import type { ModelOpenAPISchema, SchemaProperty } from '../types/aiModel'
import flux3Schemas from '../constants/wavespeedFlux3Schemas.json'
import gptImage2Schemas from '../constants/wavespeedGptImage2Schemas.json'
import gptImage25Schemas from '../constants/wavespeedGptImage25Schemas.json'
import nanoBanana2LiteSchemas from '../constants/wavespeedNanoBanana2LiteSchemas.json'
import nanoBanana2Schemas from '../constants/wavespeedNanoBanana2Schemas.json'
import nanoBananaProSchemas from '../constants/wavespeedNanoBananaProSchemas.json'
import seedance20Schemas from '../constants/wavespeedSeedance20Schemas.json'
import seedance25Schemas from '../constants/wavespeedSeedance25Schemas.json'
import seedream5Schemas from '../constants/wavespeedSeedream5Schemas.json'
import toolSchemas from '../constants/wavespeedToolSchemas.json'

// WaveSpeed model docs: https://wavespeed.ai/docs/docs-api/alibaba/alibaba-wan-3.0-reference-to-video
// Keep local catalog IDs stable for saved conversations and model selections.
export const WAVESPEED_ENDPOINTS: Record<string, string> = {
  'image-layer-splitter': 'bytedance/seedream-v5.0-pro/layer-decomposition',
  'fal-ai/ideogram/remove-background': 'bria/remove-background',
  'seedream/5-pro-text-to-image': 'bytedance/seedream-v5.0-pro',
  'seedream/5-pro-image-to-image': 'bytedance/seedream-v5.0-pro/edit',
  'gpt-image-2-text-to-image': 'openai/gpt-image-2/text-to-image',
  'gpt-image-2-image-to-image': 'openai/gpt-image-2/edit',
  // https://wavespeed.ai/docs/docs-api/openai/openai-gpt-image-2.5-flare-edit
  'gpt-image-2-5-flare-image-to-image': 'openai/gpt-image-2.5-flare/edit',
  'gpt-image-2-5-sunburst-image-to-image': 'openai/gpt-image-2.5-sunburst/edit',
  'nano-banana-2-text-to-image': 'google/nano-banana-2/text-to-image',
  'nano-banana-2-image-to-image': 'google/nano-banana-2/edit',
  'nano-banana-2-lite-text-to-image': 'google/nano-banana-2-lite/text-to-image',
  'nano-banana-2-lite-image-to-image': 'google/nano-banana-2-lite/edit',
  'nano-banana-pro-text-to-image': 'google/nano-banana-pro/text-to-image',
  'nano-banana-pro-image-to-image': 'google/nano-banana-pro/edit',
  'blackforestlabs/flux-3/text-to-video': 'black-forest-labs/flux-3/text-to-video',
  'blackforestlabs/flux-3/image-to-video': 'black-forest-labs/flux-3/image-to-video',
  'bytedance/seedance-2-5-text-to-video': 'bytedance/seedance-2.5/text-to-video',
  'bytedance/seedance-2-5-image-to-video': 'bytedance/seedance-2.5/image-to-video',
  'bytedance/seedance-2-5-reference-to-video': 'bytedance/seedance-2.5/video-edit',
  'bytedance/seedance-2-text-to-video': 'bytedance/seedance-2.0/text-to-video',
  'bytedance/seedance-2-image-to-video': 'bytedance/seedance-2.0/image-to-video',
  'bytedance/seedance-2-reference-to-video': 'bytedance/seedance-2.0/video-edit',
  'minimax-h3/text-to-video': 'minimax/h3/text-to-video',
  'minimax-h3/image-to-video': 'minimax/h3/image-to-video',
  'minimax-h3/reference-to-video': 'minimax/h3/reference-to-video',
  'wan/3-0-video-text-to-video': 'alibaba/wan-3.0/text-to-video',
  'wan/3-0-video-image-to-video': 'alibaba/wan-3.0/image-to-video',
  'wan/3-0-video-reference-to-video': 'alibaba/wan-3.0/reference-to-video',
}
export function wavespeedEndpoint(model: string) {
  return WAVESPEED_ENDPOINTS[model] || (Object.values(WAVESPEED_ENDPOINTS).includes(model) ? model : undefined)
}
export function generationProvider(model: string): 'wavespeed' | 'fal' {
  return wavespeedEndpoint(model) ? 'wavespeed' : 'fal'
}
export const WAVESPEED_MEDIA_FIELDS = ['images', 'image', 'last_image', 'video', 'reference_images', 'reference_videos', 'reference_audios']
export function wavespeedInputSchema(model: string): Record<string, any> | undefined {
  const endpoint = wavespeedEndpoint(model)
  if (!endpoint)
    return undefined
  if (endpoint in gptImage25Schemas || endpoint in toolSchemas || endpoint === 'bytedance/seedream-v5.0-pro' || endpoint === 'bytedance/seedream-v5.0-pro/edit' || endpoint.startsWith('openai/gpt-image-2/') || endpoint.startsWith('bytedance/seedance-') || endpoint.startsWith('black-forest-labs/flux-3/') || endpoint.startsWith('google/nano-banana-pro/') || endpoint.startsWith('google/nano-banana-2-lite/') || endpoint.startsWith('google/nano-banana-2/'))
    return snapshotSchema(endpoint)
  if (endpoint.startsWith('minimax/h3/'))
    return minimaxH3Schema(endpoint)
  const image = endpoint.endsWith('/image-to-video')
  const reference = endpoint.endsWith('/reference-to-video')
  const media = (description: string, accept: string, maxItems?: number): SchemaProperty => ({
    'type': maxItems ? 'array' : 'string',
    ...(maxItems ? { items: { type: 'string', minLength: 1 }, maxItems } : { minLength: 1 }),
    description,
    'x-ui-component': 'uploaders',
    'x-accept': accept,
  })
  const properties: Record<string, SchemaProperty> = {
    prompt: { 'type': 'string', 'minLength': 1, 'description': 'Describe the scene, action and camera motion. Refer to reference media by array order.', 'x-ui-component': 'textarea' },
    ...(image
      ? {
          image: media('First-frame image (required). URL or Base64 image data.', 'image/*'),
          last_image: media('Optional last-frame image. URL or Base64 image data.', 'image/*'),
        }
      : {}),
    ...(reference
      ? {
          reference_images: media('Up to 10 reference images. At least one reference image, video or audio is required.', 'image/*', 10),
          reference_videos: { ...media('Up to 5 MP4/MOV videos, each 1–15 seconds and at most 100 MB; total at most 15 seconds. Each side 240–4096 pixels; aspect ratio at most 8:1. Input video duration plus output duration must not exceed 30 seconds.', 'video/mp4,video/quicktime', 5), 'x-max-bytes': 100 * 1024 * 1024 },
          reference_audios: media('Up to 5 reference audio files, at most 15 seconds in total.', 'audio/*', 5),
        }
      : {}),
    resolution: { type: 'string', enum: ['480p', '720p', '1080p'], default: '720p' },
    aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:3', '3:4'], ...(image ? {} : { default: '16:9' }), description: image ? 'Omit to adapt to the input image.' : 'Output aspect ratio.' },
    duration: { type: 'integer', minimum: 2, maximum: 30, default: 5, description: reference ? 'Output seconds. Reference video duration plus output duration must not exceed 30 seconds.' : 'Output duration in seconds.' },
    enable_prompt_expansion: { type: 'boolean', default: false },
    enable_audio: { type: 'boolean', default: true },
    seed: { type: 'integer', minimum: -1, maximum: 2147483647, description: 'Random seed. Omit or use -1 for a random seed.' },
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required: image ? ['prompt', 'image'] : ['prompt'],
    ...(reference ? { anyOf: ['reference_images', 'reference_videos', 'reference_audios'].map(key => ({ required: [key], properties: { [key]: { minItems: 1 } } })) } : {}),
  }
}
export function wavespeedFormSchema(model: string): ModelOpenAPISchema {
  const schema = wavespeedInputSchema(model)!
  const properties = { ...schema.properties }
  if (properties.aspect_ratio && properties.aspect_ratio.default === undefined)
    properties.aspect_ratio = { ...properties.aspect_ratio, 'default': '', 'x-placeholder': model.includes('text-to-image') ? 'Auto' : 'Auto (source)' }
  return { components: { schemas: { Input: { 'properties': properties, 'required': schema.required, 'x-order-properties': schema['x-order-properties'] || Object.keys(schema.properties) } } } }
}

// https://wavespeed.ai/models/minimax/h3/reference-to-video
function minimaxH3Schema(endpoint: string): Record<string, any> {
  const image = endpoint.endsWith('/image-to-video')
  const reference = endpoint.endsWith('/reference-to-video')
  const media = (description: string, accept: string, maxItems?: number): SchemaProperty => ({
    'type': maxItems ? 'array' : 'string',
    ...(maxItems ? { items: { type: 'string', minLength: 1 }, maxItems } : { minLength: 1 }),
    description,
    'x-ui-component': 'uploaders',
    'x-accept': accept,
  })
  const properties: Record<string, SchemaProperty> = {
    prompt: { 'type': 'string', 'minLength': 1, 'x-ui-component': 'textarea', 'description': 'Describe the scene, motion, camera movement and visual style.' },
    ...(image
      ? {
          image: media('Required first-frame image URL or Base64 data. Each side must be 256–5760 pixels, with an aspect ratio between 0.4 and 2.5.', 'image/*'),
          last_image: media('Optional last-frame image URL or Base64 data.', 'image/*'),
        }
      : {}),
    ...(reference
      ? {
          reference_images: media('Up to 9 reference images. At least one image or video is required.', 'image/*', 9),
          reference_videos: media('Up to 3 reference videos. Each clip is normalized to 2–15 seconds; combined reference-video duration is capped at 15 seconds.', 'video/*', 3),
          reference_audios: media('Up to 3 audio references. Audio must accompany at least one reference image or video.', 'audio/*', 3),
        }
      : {}),
    ...(!image ? { aspect_ratio: { type: 'string', enum: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], default: '16:9' } } : {}),
    resolution: { type: 'string', enum: ['768p', '2k'], default: '768p' },
    duration: { type: 'integer', minimum: 4, maximum: 15, default: 5, description: 'Output duration in seconds (4–15).' },
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required: image ? ['prompt', 'image'] : ['prompt'],
    ...(reference ? { anyOf: ['reference_images', 'reference_videos'].map(key => ({ required: [key], properties: { [key]: { minItems: 1 } } })) } : {}),
  }
}

// Snapshots from the WaveSpeed playgrounds' embedded request_schema.
function snapshotSchema(endpoint: string): Record<string, any> {
  const raw = ({ ...seedance20Schemas, ...seedance25Schemas, ...flux3Schemas, ...nanoBananaProSchemas, ...nanoBanana2LiteSchemas, ...nanoBanana2Schemas, ...gptImage2Schemas, ...gptImage25Schemas, ...seedream5Schemas, ...toolSchemas } as Record<string, any>)[endpoint]
  const properties = Object.fromEntries(Object.entries(raw.properties).map(([key, value]) => {
    const prop = { ...(value as Record<string, any>) }
    if (key === 'prompt') {
      if (raw.required?.includes('prompt'))
        prop.minLength = 1
      prop['x-ui-component'] = 'textarea'
    }
    if (WAVESPEED_MEDIA_FIELDS.includes(key)) {
      prop['x-ui-component'] = 'uploaders'
      prop['x-accept'] = key.includes('video') ? 'video/*' : key.includes('audio') ? 'audio/*' : 'image/*'
      if (prop.type === 'string')
        prop.minLength = 1
    }
    if (key === 'images' && raw.required?.includes(key))
      prop.minItems = 1
    // Jobs use asynchronous polling and archive URL outputs.
    if (key === 'enable_sync_mode' || key === 'enable_base64_output') {
      prop.const = false
      prop['x-ui-component'] = 'hidden'
    }
    if (prop['x-hidden'])
      prop['x-ui-component'] = 'hidden'
    return [key, prop]
  }))
  return { ...raw, additionalProperties: false, properties }
}
