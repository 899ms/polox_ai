import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
function load(relative, mocks = {}, globals = {}) {
 const cache = new Map()
 function moduleAt(file) {
  if (cache.has(file)) return cache.get(file)
  const module = {exports:{}}
  cache.set(file,module.exports)
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  vm.runInNewContext(code,{module,exports:module.exports,URL,AbortSignal,Uint8Array,setTimeout,console,createError:d=>Object.assign(new Error(d.statusMessage),d),...globals,require:id=>{
   if(id in mocks)return mocks[id]
   if(id.startsWith('.')||id.startsWith('~~/')){
    const path=id.startsWith('~~/')?resolve(root,id.slice(3)):resolve(dirname(file),id)
    return path.endsWith('.json')?JSON.parse(readFileSync(path,'utf8')):moduleAt(`${path}.ts`)
   }
   return require(id)
  }},{filename:file})
  return module.exports
 }
 return moduleAt(resolve(root,relative))
}
const schema=load('shared/utils/wavespeedSchema.ts')
const sanitizer=load('server/utils/wavespeedInput.ts').sanitizeWavespeedInput
const registry=load('shared/utils/agentModels.ts')
const ids=Object.keys(schema.WAVESPEED_ENDPOINTS).filter(id=>id.startsWith('wan/'))
const [text,image,reference]=ids
const url='https://example.com/media.png'
test('all three catalog models and Agent tools expose WaveSpeed fields and defaults',()=>{
 for(const id of ids){
  const model=registry.AGENT_MODELS.find(m=>m.id===id)
  assert.ok(model)
  const tool=registry.registeredModelTools.find(t=>t.function.name===registry.agentModelToolName(id))
  assert.equal(tool.function.parameters.properties.enable_audio.default,true)
  assert.equal(tool.function.parameters.properties.resolution.default,'720p')
  for(const old of ['audio','image_urls','start_image_url','end_image_url','negative_prompt'])assert.ok(!(old in tool.function.parameters.properties))
  assert.equal(model.schema.components.schemas.Input.properties.duration.maximum,30)
 }
 assert.ok(registry.AGENT_MODELS.find(m=>m.id===image).schema.components.schemas.Input.properties.image)
})
test('text defaults, boundary durations, and strict rejection of fal input',()=>{
 const result=sanitizer(text,{prompt:'A lake'})
 assert.equal(result.duration,5)
 assert.equal(result.resolution,'720p')
 assert.equal(result.aspect_ratio,'16:9')
 assert.equal(result.enable_audio,true)
 for(const duration of [2,30])assert.equal(sanitizer(text,{prompt:'test',duration}).duration,duration)
 for(const duration of [1,31,2.5])assert.throws(()=>sanitizer(text,{prompt:'test',duration}))
 for(const input of [{audio:true},{resolution:'720P'},{image_urls:[url]},{aspect_ratio:'adaptive'}])assert.throws(()=>sanitizer(text,{prompt:'test',...input}))
})
test('image input requires first frame and keeps omitted aspect ratio adaptive',()=>{
 assert.throws(()=>sanitizer(image,{prompt:'Move'}))
 const result=sanitizer(image,{prompt:'Move',image:url,last_image:url})
 assert.equal(result.image,url)
 assert.ok(!('aspect_ratio' in result))
 assert.equal(sanitizer(image,{prompt:'Move',image:'data:image/png;base64,AQID'}).image,'data:image/png;base64,AQID')
})
test('reference requires media; accepts audio-only, enforces 10/5/5 limits in API and Agent',()=>{
 const model=registry.AGENT_MODELS.find(m=>m.id===reference)
 for(const validate of [raw=>sanitizer(reference,raw),raw=>registry.validateAgentModelInput(model,raw)]){
  assert.throws(()=>validate({prompt:'test'}))
  assert.throws(()=>validate({prompt:'test',reference_images:[],reference_videos:[],reference_audios:[]}))
  for(const [key,max] of [['reference_images',10],['reference_videos',5],['reference_audios',5]]){
   assert.equal(validate({prompt:'test',[key]:Array(max).fill(url)})[key].length,max)
   assert.throws(()=>validate({prompt:'test',[key]:Array(max+1).fill(url)}))
  }
 }
})
function provider(fetch){
 return load('server/utils/wavespeed.ts',{
  './serviceSettings':{readServiceSettings:()=>({wavespeedKey:'private-key'})},
  './localMedia':{readStoredMedia:async()=>null},
  './generationResults':{mergeSourceUrls:(job,urls)=>{job.sourceUrls=urls}},
 },{fetch})
}
test('submission uses WaveSpeed endpoint, Bearer auth and exact field names',async()=>{
 for(const id of ids){
  const api=provider(async(endpoint,init)=>{
   assert.equal(endpoint,`https://api.wavespeed.ai/api/v3/${schema.WAVESPEED_ENDPOINTS[id]}`)
   assert.equal(init.headers.Authorization,'Bearer private-key')
   const body=JSON.parse(init.body)
   assert.equal(body.enable_audio,true)
   assert.equal(body.resolution,'720p')
   assert.ok(!('audio' in body))
   return {ok:true,json:async()=>({code:200,data:{id:'prediction-1'}})}
  })
  const input={prompt:'test',...(id===image?{image:url}:id===reference?{reference_audios:[url]}:{})}
  assert.equal((await api.createWavespeedTask(id,input)).requestId,'prediction-1')
 }
})
test('polling archives completed outputs and stops on each failure status',async()=>{
 for(const status of ['processing','completed','failed','cancelled','timeout','deleted']){
  const api=provider(async(endpoint)=>{
   assert.equal(endpoint,'https://api.wavespeed.ai/api/v3/predictions/prediction-1/result')
   return {ok:true,json:async()=>({code:200,data:{status,outputs:['https://example.com/result.mp4'],error:''}})}
  })
  const job={providerTaskId:'prediction-1',state:'waiting',save:async()=>{}}
  await api.syncJobFromWavespeed(job)
  assert.equal(job.state,status==='completed'?'archiving':status==='processing'?'generating':'fail')
  if(status==='completed')assert.equal(job.sourceUrls[0],'https://example.com/result.mp4')
 }
})
test('upload uses ticket headers without sending the API key to storage',async()=>{
 let calls=0
 const api=provider(async(endpoint,init)=>{
  calls++
  if(calls===1){
   assert.equal(endpoint,'https://api.wavespeed.ai/api/v3/media/uploads')
   assert.equal(JSON.parse(init.body).size,3)
   return {ok:true,json:async()=>({code:200,data:{download_url:url,upload:{method:'PUT',url:'https://storage.example.com/signed',headers:{'Content-Type':'image/png'}}}})}
  }
  assert.equal(endpoint,'https://storage.example.com/signed')
  assert.equal(init.headers.Authorization,undefined)
  assert.equal(init.body.byteLength,3)
  return {ok:true}
 })
 assert.equal(await api.uploadWavespeedFile(new Uint8Array([1,2,3]),'image/png','test.png'),url)
})

test('local queue dispatch routes WaveSpeed jobs without invoking fal',async()=>{
 let started=0
 const queue=load('server/utils/generationQueue.ts',{
  './wavespeed':{createWavespeedTask:async(model,input)=>{started++;assert.equal(model,text);return {requestId:'wave-task'}}},
  './falGenerate':{createFalTask:async()=>{throw new Error('fal must not be called')}},
  '../models/generationJob':{GenerationJob:{}},
  './generationConcurrency':{generationConcurrency:async()=>1},
 })
 const job={provider:'wavespeed',model:text,input:{prompt:'test'},originalRequest:{},requestBody:{},state:'waiting',taskId:'job_test',providerTaskId:'',save:async()=>{}}
 await queue.startPendingProviderJob(job)
 assert.equal(started,1)
 assert.equal(job.providerTaskId,'wave-task')
 await queue.startPendingProviderJob(job)
 assert.equal(started,1)
})

test('recovering a saved WaveSpeed task uses prediction polling',async()=>{
 const api=load('server/agent/modelGeneration.ts',{
  '../utils/wavespeed':{readWavespeedTask:async(id)=>{assert.equal(id,'wave-existing');return {status:'completed',outputs:[url]}},wavespeedResultUrls:r=>r.outputs},
  '../models/generationJob':{GenerationJob:{findOne:async()=>({provider:'wavespeed'})}},
  '../utils/falGenerate':{},'../utils/falInput':{},'../utils/generateInput':{},'./env':{},
 })
 assert.equal((await api.pollFalTask('wave-existing',{timeoutMs:1000,failLabel:'test'})).urls[0],url)
})


test('H3 catalog and Agent schemas use separate WaveSpeed parameters',()=>{
 for(const task of ['text-to-video','image-to-video','reference-to-video']){
  const id=`minimax-h3/${task}`
  assert.equal(schema.wavespeedEndpoint(id),`minimax/h3/${task}`)
  assert.equal(schema.generationProvider(id),'wavespeed')
  const model=registry.AGENT_MODELS.find(m=>m.id===id)
  const properties=model.schema.components.schemas.Input.properties
  assert.equal(properties.resolution.default,'768p')
  assert.equal(properties.duration.minimum,4)
  assert.equal(properties.duration.maximum,15)
  for(const key of ['seed','enable_audio','enable_prompt_expansion','image_url','audio'])assert.ok(!(key in properties))
  assert.equal('aspect_ratio' in properties,task!=='image-to-video')
 }
})
test('H3 reference rejects audio-only and enforces 9/3/3 limits',()=>{
 const id='minimax-h3/reference-to-video'
 const model=registry.AGENT_MODELS.find(m=>m.id===id)
 for(const validate of [raw=>sanitizer(id,raw),raw=>registry.validateAgentModelInput(model,raw)]){
  assert.throws(()=>validate({prompt:'test',reference_audios:[url]}))
  assert.throws(()=>validate({prompt:'test',reference_images:[],reference_videos:[],reference_audios:[url]}))
  for(const [key,max] of [['reference_images',9],['reference_videos',3],['reference_audios',3]]){
   assert.equal(validate({prompt:'test',reference_images:[url],[key]:Array(max).fill(url)})[key].length,max)
   assert.throws(()=>validate({prompt:'test',reference_images:[url],[key]:Array(max+1).fill(url)}))
  }
 }
})
test('H3 first frame is mandatory and duration/resolution match the provider',()=>{
 const id='minimax-h3/image-to-video'
 assert.throws(()=>sanitizer(id,{prompt:'test',last_image:url}))
 for(const duration of [4,15])assert.equal(sanitizer(id,{prompt:'test',image:url,duration}).duration,duration)
 for(const extra of [{duration:3},{duration:16},{duration:5.5},{resolution:'720p'},{aspect_ratio:'16:9'},{image_url:url}])assert.throws(()=>sanitizer(id,{prompt:'test',image:url,...extra}))
 assert.equal(sanitizer(id,{prompt:'test',image:url,resolution:'2k'}).resolution,'2k')
})
test('each H3 task submits the native WaveSpeed body and endpoint',async()=>{
 for(const task of ['text-to-video','image-to-video','reference-to-video']){
  const input={prompt:'test',...(task==='image-to-video'?{image:url,last_image:url}:task==='reference-to-video'?{reference_images:[url],reference_audios:[url]}:{})}
  const api=provider(async(endpoint,init)=>{
   assert.equal(endpoint,`https://api.wavespeed.ai/api/v3/minimax/h3/${task}`)
   assert.equal(init.headers.Authorization,'Bearer private-key')
   const body=JSON.parse(init.body)
   assert.equal(body.resolution,'768p')
   assert.equal(body.duration,5)
   assert.equal('aspect_ratio' in body,task!=='image-to-video')
   assert.ok(!('enable_audio' in body))
   return {ok:true,json:async()=>({code:200,data:{id:'h3-task'}})}
  })
  assert.equal((await api.createWavespeedTask(`minimax-h3/${task}`,input)).requestId,'h3-task')
 }
})

test('Seedance 2.0 preserves optional video-edit duration and requires a source video',()=>{
 const id='bytedance/seedance-2-reference-to-video'
 assert.equal(schema.wavespeedEndpoint(id),'bytedance/seedance-2.0/video-edit')
 const model=registry.AGENT_MODELS.find(m=>m.id===id)
 for(const validate of [raw=>sanitizer(id,raw),raw=>registry.validateAgentModelInput(model,raw)]){
  assert.throws(()=>validate({prompt:'edit',reference_images:[url]}))
  assert.throws(()=>validate({prompt:'edit',reference_videos:[url]}))
  const result=validate({prompt:'edit',video:url})
  assert.ok(!('duration' in result))
  assert.ok(!('aspect_ratio' in result))
  assert.equal(result.generate_audio,true)
  assert.equal(result.resolution,'720p')
  assert.equal(validate({prompt:'edit',video:url,duration:15,generate_audio:false}).duration,15)
 }
})
test('Seedance 2.0 has model-specific fields and reference limits',()=>{
 const textId='bytedance/seedance-2-text-to-video'
 const imageId='bytedance/seedance-2-image-to-video'
 const defaults=sanitizer(textId,{prompt:'test'})
 assert.equal(defaults.aspect_ratio,'16:9')
 assert.equal(defaults.duration,5)
 assert.equal(defaults.enable_web_search,false)
 for(const [key,max] of [['reference_images',9],['reference_videos',3],['reference_audios',3]]){
  assert.equal(sanitizer(textId,{prompt:'test',[key]:Array(max).fill(url)})[key].length,max)
  assert.throws(()=>sanitizer(textId,{prompt:'test',[key]:Array(max+1).fill(url)}))
 }
 assert.throws(()=>sanitizer(imageId,{prompt:'test',last_image:url}))
 assert.throws(()=>sanitizer(imageId,{prompt:'test',image:url,reference_images:[url]}))
 for(const duration of [4,15])assert.equal(sanitizer(imageId,{prompt:'test',image:url,duration}).duration,duration)
 for(const extra of [{duration:3},{duration:16},{duration:'5'},{aspect_ratio:'adaptive'},{enable_audio:true}])assert.throws(()=>sanitizer(imageId,{prompt:'test',image:url,...extra}))
 assert.equal(sanitizer(imageId,{prompt:'test',image:url,resolution:'4k'}).resolution,'4k')
})
test('Seedance requests route to text/image/video-edit with native media keys',async()=>{
 for(const [task,endpoint,media] of [
  ['text-to-video','text-to-video',{}],
  ['image-to-video','image-to-video',{image:url,last_image:url}],
  ['reference-to-video','video-edit',{video:url,reference_images:[url]}],
 ]){
  const api=provider(async(address,init)=>{
   assert.equal(address,`https://api.wavespeed.ai/api/v3/bytedance/seedance-2.0/${endpoint}`)
   const body=JSON.parse(init.body)
   for(const [key,value] of Object.entries(media))assert.deepEqual(body[key],value)
   assert.equal(body.generate_audio,true)
   assert.ok(!('enable_audio' in body))
   assert.equal('duration' in body,endpoint!=='video-edit')
   return {ok:true,json:async()=>({code:200,data:{id:'seedance-task'}})}
  })
  assert.equal((await api.createWavespeedTask(`bytedance/seedance-2-${task}`,{prompt:'test',...media})).requestId,'seedance-task')
 }
})
test('Seedance video-edit uploads local source video before submitting',async()=>{
 let calls=0
 const api=load('server/utils/wavespeed.ts',{
  './serviceSettings':{readServiceSettings:()=>({wavespeedKey:'private-key'})},
  './localMedia':{readStoredMedia:async()=>({bytes:new Uint8Array([1,2,3]),mime:'video/mp4'})},
  './generationResults':{},
 },{fetch:async(address,init)=>{
  calls++
  if(calls===1)return {ok:true,json:async()=>({code:200,data:{download_url:'https://cdn.example.com/video.mp4',upload:{method:'PUT',url:'https://storage.example.com/signed',headers:{}}}})}
  if(calls===2)return {ok:true}
  assert.equal(JSON.parse(init.body).video,'https://cdn.example.com/video.mp4')
  return {ok:true,json:async()=>({code:200,data:{id:'video-task'}})}
 }})
 await api.createWavespeedTask('bytedance/seedance-2-reference-to-video',{prompt:'edit',video:'http://localhost/api/media/video.mp4'})
 assert.equal(calls,3)
})

test('Seedance video-edit form leaves automatic ratio and duration unset',()=>{
 const forms=load('app/lib/aiModelSchema.ts')
 const input=schema.wavespeedFormSchema('bytedance/seedance-2-reference-to-video').components.schemas.Input
 const defaults=forms.createDefaultValues(forms.parseFieldConfigs(input))
 assert.equal(defaults.aspect_ratio,'')
 assert.ok(!('duration' in defaults))
})

test('form submission converts single media to strings and omits automatic options',()=>{
 const forms=load('app/lib/aiModelSchema.ts')
 for(const [id,key] of [['bytedance/seedance-2-reference-to-video','video'],['bytedance/seedance-2-image-to-video','image']]){
  const fields=forms.parseFieldConfigs(schema.wavespeedFormSchema(id).components.schemas.Input)
  const payload=forms.createModelInput(fields,{...forms.createDefaultValues(fields),prompt:'test',[key]:[url]})
  assert.equal(payload[key],url)
  assert.ok(!('aspect_ratio' in payload))
  assert.doesNotThrow(()=>registry.validateAgentModelInput(registry.AGENT_MODELS.find(m=>m.id===id),payload))
 }
})

test('Seedance 2.5 validates its own duration, reference limits and excluded fields',()=>{
 const textId='bytedance/seedance-2-5-text-to-video'
 const imageId='bytedance/seedance-2-5-image-to-video'
 for(const id of [textId,imageId]){
  const media=id===imageId?{image:url}:{}
  for(const duration of [4,30])assert.equal(sanitizer(id,{prompt:'test',...media,duration}).duration,duration)
  for(const extra of [{duration:3},{duration:31},{enable_web_search:true},{seed:1}])assert.throws(()=>sanitizer(id,{prompt:'test',...media,...extra}))
  assert.equal(sanitizer(id,{prompt:'test',...media,resolution:'4k'}).resolution,'4k')
 }
 for(const [key,max] of [['reference_images',30],['reference_videos',10],['reference_audios',10]]){
  assert.equal(sanitizer(textId,{prompt:'test',[key]:Array(max).fill(url)})[key].length,max)
  assert.throws(()=>sanitizer(textId,{prompt:'test',[key]:Array(max+1).fill(url)}))
 }
 assert.throws(()=>sanitizer(imageId,{prompt:'test',last_image:url}))
 assert.throws(()=>sanitizer(imageId,{prompt:'test',image:url,aspect_ratio:'16:9'}))
 assert.throws(()=>sanitizer(imageId,{prompt:'test',image:'data:image/png;base64,AAAA'}))
})
test('Seedance 2.5 edit requires source video and follows its duration and ratio',()=>{
 const id='bytedance/seedance-2-5-reference-to-video'
 const model=registry.AGENT_MODELS.find(m=>m.id===id)
 for(const validate of [raw=>sanitizer(id,raw),raw=>registry.validateAgentModelInput(model,raw)]){
  assert.throws(()=>validate({prompt:'edit',reference_images:[url]}))
  for(const extra of [{duration:5},{aspect_ratio:'16:9'},{reference_videos:[url]},{enable_web_search:true}])assert.throws(()=>validate({prompt:'edit',video:url,...extra}))
  const result=validate({prompt:'edit',video:url,reference_images:Array(30).fill(url),reference_audios:Array(10).fill(url),generate_audio:false})
  assert.equal(result.generate_audio,false)
  assert.ok(!('duration' in result))
  assert.ok(!('aspect_ratio' in result))
  assert.throws(()=>validate({prompt:'edit',video:url,reference_images:Array(31).fill(url)}))
  assert.throws(()=>validate({prompt:'edit',video:url,reference_audios:Array(11).fill(url)}))
 }
})
test('Seedance 2.5 form payloads route to the three WaveSpeed endpoints',async()=>{
 const forms=load('app/lib/aiModelSchema.ts')
 for(const [task,endpoint,key] of [['text-to-video','text-to-video',null],['image-to-video','image-to-video','image'],['reference-to-video','video-edit','video']]){
  const id=`bytedance/seedance-2-5-${task}`
  const fields=forms.parseFieldConfigs(schema.wavespeedFormSchema(id).components.schemas.Input)
  const payload=forms.createModelInput(fields,{...forms.createDefaultValues(fields),prompt:'test',...(key?{[key]:[url]}:{})})
  assert.doesNotThrow(()=>registry.validateAgentModelInput(registry.AGENT_MODELS.find(m=>m.id===id),payload))
  const api=provider(async(address,init)=>{
   assert.equal(address,`https://api.wavespeed.ai/api/v3/bytedance/seedance-2.5/${endpoint}`)
   const body=JSON.parse(init.body)
   if(key)assert.equal(body[key],url)
   assert.equal('duration' in body,endpoint!=='video-edit')
   assert.equal('aspect_ratio' in body,endpoint==='text-to-video')
   assert.ok(!('enable_web_search' in body))
   return {ok:true,json:async()=>({code:200,data:{id:'seedance25-task'}})}
  })
  assert.equal((await api.createWavespeedTask(id,payload)).requestId,'seedance25-task')
 }
})

test('Flux 3 validates native fields and form defaults for both endpoints',async()=>{
 const forms=load('app/lib/aiModelSchema.ts')
 for(const task of ['text-to-video','image-to-video']){
  const id=`blackforestlabs/flux-3/${task}`
  const media=task==='image-to-video'?{image:url}:{}
  const fields=forms.parseFieldConfigs(schema.wavespeedFormSchema(id).components.schemas.Input)
  const payload=forms.createModelInput(fields,{...forms.createDefaultValues(fields),prompt:'test',...(task==='image-to-video'?{image:[url]}:{})})
  const model=registry.AGENT_MODELS.find(m=>m.id===id)
  assert.doesNotThrow(()=>registry.validateAgentModelInput(model,payload))
  for(const validate of [raw=>sanitizer(id,raw),raw=>registry.validateAgentModelInput(model,raw)]){
   for(const duration of [5,20])assert.equal(validate({prompt:'test',...media,duration}).duration,duration)
   for(const extra of [{duration:4},{duration:21},{duration:'5'},{duration:5.5},{resolution:'4k'},{aspect_ratio:'auto'},{last_image:url},{last_frame_url:url},{first_frame_url:url}])assert.throws(()=>validate({prompt:'test',...media,...extra}))
  }
  const api=provider(async(address,init)=>{
   assert.equal(address,`https://api.wavespeed.ai/api/v3/black-forest-labs/flux-3/${task}`)
   const body=JSON.parse(init.body)
   assert.equal(body.duration,5)
   assert.equal(body.resolution,'720p')
   assert.equal(body.generate_audio,true)
   if(task==='image-to-video'){
    assert.equal(body.image,url)
    assert.ok(!('aspect_ratio' in body))
   }else assert.equal(body.aspect_ratio,'9:16')
   return {ok:true,json:async()=>({code:200,data:{id:'flux-task'}})}
  })
  assert.equal((await api.createWavespeedTask(id,payload)).requestId,'flux-task')
 }
 assert.throws(()=>sanitizer('blackforestlabs/flux-3/image-to-video',{prompt:'test'}))
 assert.throws(()=>sanitizer('blackforestlabs/flux-3/image-to-video',{prompt:'test',image:'data:image/png;base64,AAAA'}))
})

test('Nano Banana Pro uses native schemas, image limits and URL output mode',async()=>{
 const forms=load('app/lib/aiModelSchema.ts')
 for(const [task,endpoint] of [['text-to-image','text-to-image'],['image-to-image','edit']]){
  const id=`nano-banana-pro-${task}`
  const media=endpoint==='edit'?{images:[url]}:{}
  const model=registry.AGENT_MODELS.find(m=>m.id===id)
  for(const validate of [raw=>sanitizer(id,raw),raw=>registry.validateAgentModelInput(model,raw)]){
   for(const resolution of ['1k','2k','4k'])assert.equal(validate({prompt:'test',...media,resolution}).resolution,resolution)
   for(const extra of [{resolution:'1K'},{output_format:'webp'},{num_images:2},{image_urls:[url]},{enable_sync_mode:true},{enable_base64_output:true}])assert.throws(()=>validate({prompt:'test',...media,...extra}))
   if(endpoint==='edit'){
    assert.throws(()=>validate({prompt:'test'}))
    assert.throws(()=>validate({prompt:'test',images:[]}))
    assert.equal(validate({prompt:'test',images:Array(14).fill(url)}).images.length,14)
    assert.throws(()=>validate({prompt:'test',images:Array(15).fill(url)}))
   }
  }
  const fields=forms.parseFieldConfigs(schema.wavespeedFormSchema(id).components.schemas.Input)
  const payload=forms.createModelInput(fields,{...forms.createDefaultValues(fields),prompt:'test',...media})
  assert.doesNotThrow(()=>registry.validateAgentModelInput(model,payload))
  const api=provider(async(address,init)=>{
   assert.equal(address,`https://api.wavespeed.ai/api/v3/google/nano-banana-pro/${endpoint}`)
   const body=JSON.parse(init.body)
   assert.equal(body.resolution,'1k')
   assert.equal(body.output_format,'png')
   assert.equal(body.enable_sync_mode,false)
   assert.equal(body.enable_base64_output,false)
   assert.ok(!('aspect_ratio' in body))
   if(endpoint==='edit')assert.deepEqual(body.images,[url])
   return {ok:true,json:async()=>({code:200,data:{id:'nano-task'}})}
  })
  assert.equal((await api.createWavespeedTask(id,payload)).requestId,'nano-task')
 }
})
test('Nano Banana Pro uploads local images before creating an edit task',async()=>{
 let calls=0
 const api=load('server/utils/wavespeed.ts',{
  './serviceSettings':{readServiceSettings:()=>({wavespeedKey:'private-key'})},
  './localMedia':{readStoredMedia:async()=>({bytes:new Uint8Array([1,2,3]),mime:'image/png'})},
  './generationResults':{},
 },{fetch:async(address,init)=>{
  calls++
  if(calls===1)return {ok:true,json:async()=>({code:200,data:{download_url:url,upload:{method:'PUT',url:'https://storage.example.com/signed',headers:{}}}})}
  if(calls===2)return {ok:true}
  assert.equal(address,'https://api.wavespeed.ai/api/v3/google/nano-banana-pro/edit')
  assert.deepEqual(JSON.parse(init.body).images,[url])
  return {ok:true,json:async()=>({code:200,data:{id:'nano-edit'}})}
 }})
 await api.createWavespeedTask('nano-banana-pro-image-to-image',{prompt:'edit',images:['http://localhost/api/media/image.png']})
 assert.equal(calls,3)
})

test('Nano Banana 2 Lite uses its own endpoints, four-image limit and no resolution',async()=>{
 const forms=load('app/lib/aiModelSchema.ts')
 for(const [task,endpoint] of [['text-to-image','text-to-image'],['image-to-image','edit']]){
  const id=`nano-banana-2-lite-${task}`
  const media=endpoint==='edit'?{images:[url]}:{}
  const model=registry.AGENT_MODELS.find(m=>m.id===id)
  for(const validate of [raw=>sanitizer(id,raw),raw=>registry.validateAgentModelInput(model,raw)]){
   for(const aspect_ratio of ['1:4','4:1','1:8','8:1'])assert.equal(validate({prompt:'test',...media,aspect_ratio}).aspect_ratio,aspect_ratio)
   for(const extra of [{resolution:'1k'},{size:'1024*1024'},{output_format:'webp'},{num_images:2},{image_urls:[url]},{enable_sync_mode:true},{enable_base64_output:true}])assert.throws(()=>validate({prompt:'test',...media,...extra}))
   if(endpoint==='edit'){
    assert.throws(()=>validate({prompt:'test'}))
    assert.throws(()=>validate({prompt:'test',images:[]}))
    assert.equal(validate({prompt:'test',images:Array(4).fill(url)}).images.length,4)
    assert.throws(()=>validate({prompt:'test',images:Array(5).fill(url)}))
   }
  }
  const fields=forms.parseFieldConfigs(schema.wavespeedFormSchema(id).components.schemas.Input)
  const payload=forms.createModelInput(fields,{...forms.createDefaultValues(fields),prompt:'test',...media})
  assert.doesNotThrow(()=>registry.validateAgentModelInput(model,payload))
  const api=provider(async(address,init)=>{
   assert.equal(address,`https://api.wavespeed.ai/api/v3/google/nano-banana-2-lite/${endpoint}`)
   const body=JSON.parse(init.body)
   assert.ok(!('resolution' in body))
   assert.equal(body.output_format,'png')
   assert.equal(body.enable_sync_mode,false)
   assert.equal(body.enable_base64_output,false)
   if(endpoint==='edit'){
    assert.deepEqual(body.images,[url])
    assert.ok(!('aspect_ratio' in body))
   }else assert.equal(body.aspect_ratio,'1:1')
   return {ok:true,json:async()=>({code:200,data:{id:'lite-task'}})}
  })
  assert.equal((await api.createWavespeedTask(id,payload)).requestId,'lite-task')
 }
})

test('Nano Banana 2 supports native resolutions, searches and fourteen edit images',async()=>{
 const forms=load('app/lib/aiModelSchema.ts')
 for(const [task,endpoint] of [['text-to-image','text-to-image'],['image-to-image','edit']]){
  const id=`nano-banana-2-${task}`
  const media=endpoint==='edit'?{images:[url]}:{}
  const model=registry.AGENT_MODELS.find(m=>m.id===id)
  for(const validate of [raw=>sanitizer(id,raw),raw=>registry.validateAgentModelInput(model,raw)]){
   for(const resolution of ['0.5k','1k','2k','4k'])assert.equal(validate({prompt:'test',...media,resolution}).resolution,resolution)
   for(const aspect_ratio of ['1:4','4:1','1:8','8:1'])assert.equal(validate({prompt:'test',...media,aspect_ratio}).aspect_ratio,aspect_ratio)
   const searches=validate({prompt:'test',...media,enable_web_search:true,enable_image_search:true,output_format:'jpeg'})
   assert.equal(searches.enable_web_search,true)
   assert.equal(searches.enable_image_search,true)
   for(const extra of [{resolution:'1K'},{output_format:'webp'},{num_images:2},{image_urls:[url]},{seed:1},{enable_sync_mode:true},{enable_base64_output:true}])assert.throws(()=>validate({prompt:'test',...media,...extra}))
   if(endpoint==='edit'){
    assert.throws(()=>validate({prompt:'test'}))
    assert.throws(()=>validate({prompt:'test',images:[]}))
    assert.equal(validate({prompt:'test',images:Array(14).fill(url)}).images.length,14)
    assert.throws(()=>validate({prompt:'test',images:Array(15).fill(url)}))
   }
  }
  const fields=forms.parseFieldConfigs(schema.wavespeedFormSchema(id).components.schemas.Input)
  const payload=forms.createModelInput(fields,{...forms.createDefaultValues(fields),prompt:'test',...media})
  assert.doesNotThrow(()=>registry.validateAgentModelInput(model,payload))
  const api=provider(async(address,init)=>{
   assert.equal(address,`https://api.wavespeed.ai/api/v3/google/nano-banana-2/${endpoint}`)
   const body=JSON.parse(init.body)
   assert.equal(body.resolution,'1k')
   assert.equal(body.output_format,'png')
   assert.equal(body.enable_web_search,false)
   assert.equal(body.enable_image_search,false)
   assert.equal(body.enable_sync_mode,false)
   assert.equal(body.enable_base64_output,false)
   assert.ok(!('aspect_ratio' in body))
   if(endpoint==='edit')assert.deepEqual(body.images,[url])
   return {ok:true,json:async()=>({code:200,data:{id:'nano2-task'}})}
  })
  assert.equal((await api.createWavespeedTask(id,payload)).requestId,'nano2-task')
 }
})

test('GPT Image 2 routes native form inputs and validates quality, formats and image count',async()=>{
 const forms=load('app/lib/aiModelSchema.ts')
 for(const [task,endpoint] of [['text-to-image','text-to-image'],['image-to-image','edit']]){
  const id=`gpt-image-2-${task}`
  const media=endpoint==='edit'?{images:[url]}:{}
  const model=registry.AGENT_MODELS.find(m=>m.id===id)
  for(const validate of [raw=>sanitizer(id,raw),raw=>registry.validateAgentModelInput(model,raw)]){
   for(const resolution of ['1k','2k','4k'])assert.equal(validate({prompt:'test',...media,resolution}).resolution,resolution)
   for(const quality of ['low','medium','high'])assert.equal(validate({prompt:'test',...media,quality}).quality,quality)
   for(const output_format of ['png','jpeg','webp'])assert.equal(validate({prompt:'test',...media,output_format}).output_format,output_format)
   for(const aspect_ratio of ['1:2','2:1','1:3','3:1','9:21'])assert.equal(validate({prompt:'test',...media,aspect_ratio}).aspect_ratio,aspect_ratio)
   for(const extra of [{image_size:'auto'},{input_urls:[url]},{image_urls:[url]},{num_images:2},{resolution:'1K'},{quality:'auto'},{enable_sync_mode:true},{enable_base64_output:true}])assert.throws(()=>validate({prompt:'test',...media,...extra}))
   if(endpoint==='edit'){
    assert.throws(()=>validate({prompt:'test',images:[]}))
    assert.throws(()=>validate({prompt:'test'}))
    assert.equal(validate({prompt:'test',images:Array(16).fill(url)}).images.length,16)
    assert.throws(()=>validate({prompt:'test',images:Array(17).fill(url)}))
   }
  }
  const fields=forms.parseFieldConfigs(schema.wavespeedFormSchema(id).components.schemas.Input)
  const payload=forms.createModelInput(fields,{...forms.createDefaultValues(fields),prompt:'test',...media})
  const api=provider(async(address,init)=>{
   assert.equal(address,`https://api.wavespeed.ai/api/v3/openai/gpt-image-2/${endpoint}`)
   const body=JSON.parse(init.body)
   assert.equal(body.resolution,'1k')
   assert.equal(body.quality,'medium')
   assert.equal(body.output_format,'png')
   assert.equal(body.enable_sync_mode,false)
   assert.equal(body.enable_base64_output,false)
   assert.ok(!('aspect_ratio' in body))
   if(endpoint==='edit')assert.deepEqual(body.images,[url])
   return {ok:true,json:async()=>({code:200,data:{id:'gpt-task'}})}
  })
  assert.equal((await api.createWavespeedTask(id,payload)).requestId,'gpt-task')
 }
})

test('Seedream 5 Pro uses native endpoints, ten images and prompt optimization',async()=>{
 const forms=load('app/lib/aiModelSchema.ts')
 for(const [task,suffix] of [['text-to-image',''],['image-to-image','/edit']]){
  const id=`seedream/5-pro-${task}`
  const media=suffix?{images:[url]}:{}
  const model=registry.AGENT_MODELS.find(m=>m.id===id)
  for(const validate of [raw=>sanitizer(id,raw),raw=>registry.validateAgentModelInput(model,raw)]){
   for(const resolution of ['1k','1.5k','2k'])assert.equal(validate({prompt:'test',...media,resolution}).resolution,resolution)
   for(const mode of ['standard','fast'])assert.equal(validate({prompt:'test',...media,prompt_optimization_mode:mode}).prompt_optimization_mode,mode)
   for(const extra of [{resolution:'4k'},{resolution:'1K'},{image_size:'auto'},{image_urls:[url]},{num_images:2},{output_format:'webp'},{prompt_optimization_mode:'off'},{enable_sync_mode:true},{enable_base64_output:true}])assert.throws(()=>validate({prompt:'test',...media,...extra}))
   if(suffix){
    assert.throws(()=>validate({prompt:'test'}))
    assert.throws(()=>validate({prompt:'test',images:[]}))
    assert.equal(validate({prompt:'test',images:Array(10).fill(url)}).images.length,10)
    assert.throws(()=>validate({prompt:'test',images:Array(11).fill(url)}))
   }
  }
  const fields=forms.parseFieldConfigs(schema.wavespeedFormSchema(id).components.schemas.Input)
  const payload=forms.createModelInput(fields,{...forms.createDefaultValues(fields),prompt:'test',...media})
  assert.doesNotThrow(()=>registry.validateAgentModelInput(model,payload))
  const api=provider(async(address,init)=>{
   assert.equal(address,`https://api.wavespeed.ai/api/v3/bytedance/seedream-v5.0-pro${suffix}`)
   const body=JSON.parse(init.body)
   assert.equal(body.resolution,'1k')
   assert.equal(body.output_format,'jpeg')
   assert.equal(body.prompt_optimization_mode,'standard')
   assert.equal(body.enable_sync_mode,false)
   assert.equal(body.enable_base64_output,false)
   if(suffix){assert.deepEqual(body.images,[url]);assert.ok(!('aspect_ratio' in body))}
   else assert.equal(body.aspect_ratio,'1:1')
   return {ok:true,json:async()=>({code:200,data:{id:'seedream-task'}})}
  })
  assert.equal((await api.createWavespeedTask(id,payload)).requestId,'seedream-task')
 }
})

test('WaveSpeed layer decomposition and Bria accept image without requiring a prompt',async()=>{
 for(const [id,endpoint,expected] of [
  ['image-layer-splitter','bytedance/seedream-v5.0-pro/layer-decomposition',{resolution:'1k',output_format:'jpeg',prompt_optimization_mode:'standard'}],
  ['fal-ai/ideogram/remove-background','bria/remove-background',{enable_sync_mode:false,enable_base64_output:false}],
 ]){
  assert.throws(()=>sanitizer(id,{}))
  assert.throws(()=>sanitizer(id,{image:url,image_url:url}))
  const api=provider(async(address,init)=>{
   assert.equal(address,`https://api.wavespeed.ai/api/v3/${endpoint}`)
   const body=JSON.parse(init.body)
   assert.equal(body.image,url)
   for(const [key,value] of Object.entries(expected))assert.equal(body[key],value)
   return {ok:true,json:async()=>({code:200,data:{id:'tool-task'}})}
  })
  assert.equal((await api.createWavespeedTask(id,{image:url})).requestId,'tool-task')
 }
 assert.throws(()=>sanitizer('bria/remove-background',{image:url,prompt:'remove'}))
 assert.equal(sanitizer('image-layer-splitter',{image:url,prompt:'separate subject',resolution:'1.5k'}).prompt,'separate subject')
})
test('selected layer boxes translate to WaveSpeed parameters',()=>{
 const adapt=load('server/utils/imageLayerSplitter.ts').sanitizeImageLayerInput
 const body=adapt({image_url:url,regions:[[10,20,300,400]]})
 assert.equal(body.image,url)
 assert.match(body.prompt,/<bbox>10 20 300 400<\/bbox>/)
 assert.equal(body.output_format,'png')
 assert.equal(body.resolution,'2k')
 assert.doesNotThrow(()=>sanitizer('image-layer-splitter',body))
 assert.throws(()=>adapt({image_url:url,regions:[[300,20,10,400]]}))
})
test('layer outputs preserve provider order and remain available for archiving',async()=>{
 const urls=['https://example.com/base.png','https://example.com/subject.png']
 const api=provider(async()=>({ok:true,json:async()=>({code:200,data:{status:'completed',outputs:urls}})}))
 const job={model:'image-layer-splitter',providerTaskId:'layers',state:'generating',save:async()=>{}}
 await api.syncJobFromWavespeed(job)
 assert.equal(job.state,'archiving')
 const result=JSON.parse(job.resultJson)
 assert.deepEqual(result.resultUrls,urls)
 assert.deepEqual(result.layers.map(layer=>layer.z_index),[0,1])
 assert.deepEqual(result.layers.map(layer=>layer.image.url),urls)
})

test('WaveSpeed rejects invalid upload sizes before requesting a ticket',async()=>{
 const api=provider(async()=>{throw new Error('Should not request a ticket')})
 await assert.rejects(api.uploadWavespeedFile(new Uint8Array(),'image/png','empty.png'),/200 MiB/)
 await assert.rejects(api.uploadWavespeedFile({byteLength:200*1024*1024+1},'video/mp4','large.mp4'),/200 MiB/)
})
test('WaveSpeed upload preserves per-request storage URLs and all ticket headers',async()=>{
 let calls=0
 const signed='https://different-storage.example.org/object?signature=opaque%2Fvalue'
 const headers={'Content-Type':'image/png','If-None-Match':'*'}
 const api=provider(async(address,init)=>{
  calls++
  if(calls===1){
   assert.deepEqual(JSON.parse(init.body),{filename:'image.png',size:3,content_type:'image/png'})
   return {ok:true,json:async()=>({code:200,data:{download_url:url,upload:{method:'PUT',url:signed,headers}}})}
  }
  assert.equal(address,signed)
  assert.deepEqual(init.headers,headers)
  assert.deepEqual(Array.from(init.body),[1,2,3])
  return {ok:true,status:204}
 })
 assert.equal(await api.uploadWavespeedFile(new Uint8Array([1,2,3]),'image/png','/tmp/image.png'),url)
})
test('failed upload never returns a usable download URL',async()=>{
 let calls=0
 const api=provider(async()=>++calls===1?{ok:true,json:async()=>({code:200,data:{download_url:url,upload:{method:'PUT',url:'https://storage.example.com/signed',headers:{}}}})}:{ok:false,status:403})
 await assert.rejects(api.uploadWavespeedFile(new Uint8Array([1]),'image/png','image.png'),/403/)
})
