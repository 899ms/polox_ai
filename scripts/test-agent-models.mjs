import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
function load(relative, mocks = {}, globals = {}) {
    const cache = new Map();
    function moduleAt(file) {
        if (cache.has(file))
            return cache.get(file);
        const module = { exports: {} };
        cache.set(file, module.exports);
        const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
        vm.runInNewContext(code, {
            module,
            URL,
            Error,
            exports: module.exports,
            fetch,
            AbortSignal,
            setTimeout,
            structuredClone,
            createError: details => Object.assign(new Error(details.statusMessage), details),
            ...globals,
            require: (id) => {
                if (id.endsWith('/serviceSettings')) return {readServiceSettings: () => ({falKey:'test-key',openRouterKey:'test-key',openRouterModel:'test-model'})};
                if (id in mocks)
                    return mocks[id];
                if (id.startsWith('.') || id.startsWith('~~/')) {
                    const target = id.startsWith('~~/') ? resolve(root, id.slice(3)) : resolve(dirname(file), id);
                    return target.endsWith('.json') ? JSON.parse(readFileSync(target, 'utf8')) : moduleAt(`${target}.ts`);
                }
                return require(id);
            },
        }, { filename: file });
        return module.exports;
    }
    return moduleAt(resolve(root, relative));
}
const registry = load('shared/utils/agentModels.ts');
const session = () => ({ id: 'session', projectId: 'project', quality: 'custom', messages: [], images: [] });
const source = 'https://example.com/source.png';
function validInput(model) {
    const schema = model.schema.components.schemas.Input;
    const raw = {};
    for (const [key, prop] of Object.entries(schema.properties)) {
        if (prop.default !== undefined && prop.default !== '' && !(Array.isArray(prop.default) && !prop.default.length)) {
            raw[key] = prop.default;
        }
        else if ((schema.required || []).includes(key)) {
            if (key === 'prompt')
                raw[key] = 'A quiet lake at sunset with a small sailboat';
            else if (key === 'regions')
                raw[key] = [[10, 20, 500, 600]];
            else if (prop.type === 'array')
                raw[key] = [source];
            else if (key.includes('url') || prop['x-ui-component'] === 'uploaders')
                raw[key] = source;
            else if (prop.enum)
                raw[key] = prop.enum[0];
            else if (prop.type === 'boolean')
                raw[key] = true;
            else if (prop.type === 'integer' || prop.type === 'number')
                raw[key] = prop.minimum || 1;
        }
    }
    // Reference models require at least one source across optional media arrays.
    if (model.task === 'Reference to Video' && !schema.properties.video)
        raw[schema.properties.reference_images ? 'reference_images' : schema.properties.image_urls ? 'image_urls' : 'reference_image_urls'] = [source];
    return raw;
}
const emitted = [];
let slotArgs;
let storedJob = { createdAt: new Date(), updatedAt: new Date(), resultAssets: [], state: 'success', providerTaskId: 'provider', resultUrls: ['https://example.com/result-a.png', 'https://example.com/result-b.png'] };
const api = load('server/agent/models.ts', {
    './httpError': { toUpstreamApiError: error => error },
    './session': { persistNow: () => { }, upsertImage: (s, image) => { s.images = [image, ...s.images.filter(item => item.id !== image.id)]; } },
    './slots': { acquireGenerationSlot: async (args) => { slotArgs = args; return { queued: false }; } },
    '../models/generationJob': { GenerationJob: { findOne: async () => storedJob } },
    '../utils/generationPipeline': { refreshGenerationJob: async (job) => job },
}, { console });
test('every website model has a unique valid tool and matching required parameters', () => {
    const website = load('shared/constants/aiModels.ts').AI_MODELS;
    assert.equal(registry.AGENT_MODELS.length, website.length + 3);
    assert.equal(new Set(registry.registeredModelTools.map(tool => tool.function.name)).size, registry.AGENT_MODELS.length);
    for (const model of website) {
        const tool = registry.registeredModelTools.find(tool => tool.function.name === registry.agentModelToolName(model.id));
        assert.match(tool.function.name, /^[\w-]{1,64}$/);
        assert.deepEqual(JSON.parse(JSON.stringify(tool.function.required || tool.function.parameters.required)), JSON.parse(JSON.stringify(model.schema.components.schemas.Input.required || [])));
        for (const key of Object.keys(model.schema.components.schemas.Input.properties))
            assert.ok(key in tool.function.parameters.properties);
    }
});
for (const model of registry.AGENT_MODELS.filter(model => !['image-text-editor', 'sketch-to-image'].includes(model.id))) {
    test(`${model.id}: validated parameters preserve the correct model identity`, async () => {
        const args = await api.prepareModelGeneration(registry.agentModelToolName(model.id), JSON.stringify(validInput(model)), session());
        assert.equal(args.modelId, model.id);
        if (model.task === 'Image to Image')
            assert.ok(args.inputUrls.includes(source), 'All model-specific image fields must be retained for preview and input checks');
        assert.equal(api.modelConfirmation(args).params.modelId, model.id);
    });
}
test('missing source media is rejected before any generation', async () => {
    const model = registry.AGENT_MODELS.find(model => model.id === 'gpt-image-2-image-to-image');
    const raw = validInput(model);
    delete raw.images;
    await assert.rejects(api.prepareModelGeneration(registry.agentModelToolName(model.id), JSON.stringify(raw), session()), /required property 'images'/);
});
test('defaults fill settings but never fabricate required media', () => {
    const model = registry.AGENT_MODELS.find(model => model.id === 'gpt-image-2-text-to-image');
    const input = registry.validateAgentModelInput(model, { prompt: 'A quiet lake at sunset' });
    assert.equal(input.resolution, model.schema.components.schemas.Input.properties.resolution.default);
    assert.throws(() => registry.validateAgentModelInput(model, { prompt: 'A lake', quality: 'unsupported' }), /allowed values/);
    assert.throws(() => registry.validateAgentModelInput(model, { prompt: 'A lake', invented: true }), /additional properties/);
});
test('mention roundtrip preserves exact model task and deduplicates badges', () => {
    const model = registry.AGENT_MODELS[0];
    const text = `${registry.modelMention(model)} ${registry.modelMention(model)} Make a picture`;
    assert.deepEqual(Array.from(registry.readModelMentions(text)), [model.id]);
    assert.equal(registry.stripModelMentions(text), 'Make a picture');
});
test('a selected model cannot be silently substituted; other-category prerequisites remain possible', async () => {
    const chosen = registry.AGENT_MODELS.find(model => model.id === 'gpt-image-2-text-to-image');
    const wrong = registry.AGENT_MODELS.find(model => model.id === 'nano-banana-2-text-to-image');
    const s = session();
    s.messages = [{ role: 'user', content: registry.modelMention(chosen) }];
    await assert.rejects(api.prepareModelGeneration(registry.agentModelToolName(wrong.id), JSON.stringify(validInput(wrong)), s), /exact model/);
});
test('session media IDs resolve to real URLs and invalid IDs fail', async () => {
    const model = registry.AGENT_MODELS.find(model => model.id === 'gpt-image-2-image-to-image');
    const s = session();
    s.images = [{ id: 'image-1', kind: 'still', status: 'success', url: source }];
    const raw = { ...validInput(model), images: ['image-1'] };
    const args = await api.prepareModelGeneration(registry.agentModelToolName(model.id), JSON.stringify(raw), s);
    assert.equal(args.input.images[0], source);
    raw.images = ['missing-image'];
    await assert.rejects(api.prepareModelGeneration(registry.agentModelToolName(model.id), JSON.stringify(raw), s), /Missing media/);
});
test('registered generation uses normal provider pipeline and preserves every output', async () => {
    const model = registry.AGENT_MODELS.find(model => model.id === 'gpt-image-2-text-to-image');
    const s = session();
    const args = await api.prepareModelGeneration(registry.agentModelToolName(model.id), JSON.stringify(validInput(model)), s);
    const result = JSON.parse(await api.runModelGeneration(s, 'call-1', args, event => emitted.push(event)));
    assert.equal(slotArgs.meta.modelId, model.id);
    assert.equal(slotArgs.meta.requestModel, 'openai/gpt-image-2/text-to-image');
    assert.equal(slotArgs.meta.modelInput.prompt, args.input.prompt);
    assert.equal(result.urls.length, 2);
    assert.equal(s.images.filter(image => image.status === 'success').length, 2);
    assert.ok(s.images.every(image => image.modelId === model.id));
});
test('provider terminal failure produces a failed result, not a success', async () => {
    const model = registry.AGENT_MODELS[0];
    const s = session();
    const args = await api.prepareModelGeneration(registry.agentModelToolName(model.id), JSON.stringify(validInput(model)), s);
    storedJob = { state: 'fail', failMsg: 'Provider rejected request', resultUrls: [] };
    const result = JSON.parse(await api.runModelGeneration(s, 'call-fail', args, () => { }));
    assert.equal(result.ok, false);
    assert.match(s.images[0].error, /Provider rejected/);
});
function loopHarness(responses, initial, prose = {}) {
    const events = [];
    const s = { ...session(), confirmPolicy: 'always', pendingConfirmation: null, pendingChoice: null, ...initial };
    let registered;
    const generationRequests = [];
    const llmRequests = [];
    const detectionRequests = [];
    const mocks = Object.fromEntries(['./annotationReferences', './concat', './fal', './modelGeneration', './restore', './resume', './slots', '../utils/agentChats'].map(id => [id, {}]));
    const loop = load('server/agent/loop.ts', {
        ...mocks,
        '../utils/agentChats': { snapshotAgentChatFromService: async () => { } },
        './annotationReferences': { validateProjectImageReferences: async urls => { if (urls.some(url => !s.images.some(image => image.url === url && image.status === 'success'))) throw new Error('Reference image is not available'); } },
        './models': { ...api, runModelGeneration: async (_session, callId, args) => {
                generationRequests.push({ callId, args });
                const failed = Boolean(s.failLayerUrl && (args.input.image === s.failLayerUrl || args.input.images?.includes(s.failLayerUrl)));
                s.images.push({ id: callId, modelId: args.modelId, status: failed ? 'fail' : 'success', error: failed ? 'Image dimensions are too small' : '', url: failed ? '' : `https://example.com/${callId}.png` });
                return JSON.stringify(failed ? { ok: false, error: 'Image dimensions are too small' } : { ok: true, model: args.modelId, urls: [`https://example.com/${callId}.png`] });
            } },
        './session': { requireLoadedSession: async () => s, choiceAlreadyAnswered: () => false, confirmationAlreadyStarted: () => false, requireSession: () => s, touch: () => { }, refreshSessionPrompt: () => { }, persistNow: () => { } },
        './title': { summarizeSessionTitle: async () => '' },
        '../utils/sqlite': { connectDatabase: async () => { } },
        './llm': {
            completeText: async (options) => {
                detectionRequests.push(options);
                const imageUrl = options.messages[1].content[0].image_url.url;
                return JSON.stringify([{ original: imageUrl === source ? 'Hello' : 'CAFE', location: 'center' }]);
            },
            assembleToolCalls: calls => calls,
            streamChat: async (options) => {
                llmRequests.push(options);
                registered = options.tools;
                options.onDelta({ ...prose, toolCalls: responses.shift() || [] });
            },
        },
    }, { crypto, AbortController, console });
    return { s, events, generationRequests, llmRequests, detectionRequests, choice: body => loop.handleChoice(s.id, body, event => events.push(event)), confirm: body => loop.handleConfirm(s.id, body, event => events.push(event)), run: () => loop.runAgentLoop(s.id, event => events.push(event)), tools: () => registered };
}
function call(model, raw, id = 'tool-1') {
    return { id, type: 'function', function: { name: registry.agentModelToolName(model.id), arguments: JSON.stringify(raw) } };
}
test('Agent loop queues the exact selected model and full parameters for confirmation before spending', async () => {
    const model = registry.AGENT_MODELS.find(model => model.id === 'blackforestlabs/flux-3/text-to-video');
    const h = loopHarness([[call(model, validInput(model))]], { messages: [{ role: 'user', content: registry.modelMention(model) }] });
    await h.run();
    assert.equal(h.s.pendingConfirmation.payload.params.modelId, model.id);
    assert.equal(h.s.pendingConfirmation.payload.jobs[0].modelName, model.name);
    assert.ok(h.s.pendingConfirmation.payload.params.modelInput.prompt);
    assert.equal(h.s.pendingConfirmation.items[0].tool, registry.agentModelToolName(model.id));
    assert.ok(h.tools().some(tool => tool.function.name === registry.agentModelToolName(model.id)));
    assert.ok(!h.tools().some(tool => tool.function.name === 'generate_video'));
});
test('missing required media returns to the Agent for clarification without a generation confirmation', async () => {
    const model = registry.AGENT_MODELS.find(model => model.id === 'gpt-image-2-image-to-image');
    const raw = validInput(model);
    delete raw.images;
    const h = loopHarness([[call(model, raw)], [{ id: 'ask-1', type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'source', prompt: 'Which existing image should I edit?', options: [{ id: 'last', label: 'The previous result' }, { id: 'custom', label: 'Other', allow_custom: true }] }] }) } }]]);
    await h.run();
    assert.equal(h.s.pendingConfirmation, null);
    assert.equal(h.s.pendingChoice.payload.questions[0].id, 'source');
    assert.match(h.s.messages.find(message => message.role === 'tool').content, /required property/);
});
test('tool planning is collapsed and saved separately from a terminal answer', async () => {
    const model = registry.AGENT_MODELS.find(model => model.id === 'blackforestlabs/flux-3/text-to-video');
    const h = loopHarness([[call(model, validInput(model))]], {}, { content: 'I will plan this generation.' });
    await h.run();
    assert.ok(h.events.some(event => event.type === 'text_replace' && event.delta === '<think>I will plan this generation.</think>'));
    assert.ok(h.s.messages.some(message => message.tool_calls && message.content === '<think>I will plan this generation.</think>'));
    const answer = loopHarness([[]], {}, { reasoning: 'Check the input.', content: 'Please attach an image.' });
    await answer.run();
    assert.equal(answer.s.messages.at(-1).content, '<think>Check the input.</think>Please attach an image.');
});
test('multiple layer selections prepare distinct source jobs with their own confirmed boxes', async () => {
    const s = session();
    const urls = [source, 'https://example.com/second.png'];
    const boxes = [[[10, 20, 500, 600]], [[100, 200, 800, 900], [0, 0, 100, 100]]];
    s.images = urls.map((url, i) => ({ id: `source-${i}`, url, status: 'success', kind: 'still' }));
    s.messages = [
        { role: 'user', content: '@[Image Layer Splitter](model:image-layer-splitter)' },
        ...urls.map((imageUrl, i) => ({ role: 'tool', content: JSON.stringify({ ok: true, answers: [{ questionId: 'layer_selection_method', optionId: 'draw_boxes', imageUrl, regions: boxes[i] }] }) })),
    ];
    const tool = registry.agentModelToolName('image-layer-splitter');
    for (const refs of [urls, ['source-0', 'source-1']]) {
        const jobs = await Promise.all(refs.map(image_url => api.prepareModelGeneration(tool, JSON.stringify({ image_url, regions: [[0, 0, 1000, 1000]] }), s)));
        for (const [i, job] of jobs.entries()) {
            assert.equal(job.input.image, urls[i]);
            assert.deepEqual([...job.input.prompt.matchAll(/<bbox>(.*?)<\/bbox>/g)].map(match => match[1].split(' ').map(Number)), boxes[i]);
            assert.deepEqual(Array.from(job.inputUrls), [urls[i]]);
            assert.equal(api.modelConfirmation(job).inputUrls[0], urls[i]);
        }
    }
    await assert.rejects(api.prepareModelGeneration(tool, '{}', s), /source image with confirmed boxes/);
    await assert.rejects(api.prepareModelGeneration(tool, JSON.stringify({ image_url: 'https://example.com/unconfirmed.png', regions: boxes[0] }), s), /source image with confirmed boxes/);
    s.messages.pop();
    const single = await api.prepareModelGeneration(tool, '{}', s);
    assert.equal(single.input.image, source);
});
test('text editor requires confirmed user edits and maps them to direct full-image GPT editing', async () => {
    const s = session();
    await assert.rejects(api.prepareModelGeneration('model_image_text_editor', JSON.stringify({ image_url: source }), s), /confirm edits/);
    const textEdit = { imageUrl: source, lines: [{ original: 'Hello', text: '你好', location: 'upper left' }] };
    s.images = [{ id: 'upload', status: 'success', kind: 'upload', url: source }];
    s.messages = [{ role: 'tool', content: JSON.stringify({ ok: true, textEdit }) }];
    for (const quality of ['economy', 'high', 'hobby', 'custom']) {
        s.quality = quality;
        const args = await api.prepareModelGeneration('model_image_text_editor', JSON.stringify({ image_url: 'ignored-model-url' }), s);
        assert.equal(args.modelId, 'gpt-image-2-5-sunburst-image-to-image');
        assert.equal(args.input.aspect_ratio, undefined);
        assert.equal(api.modelConfirmation(args).modelName, 'GPT Image 2.5 Sunburst');
        assert.equal(args.requestModel, 'openai/gpt-image-2.5-sunburst/edit');
        assert.equal(args.input.quality, 'high');
        assert.equal(args.input.resolution, '1k');
        assert.equal(args.input.images[0], source);
        assert.equal(args.input._textEdit, undefined);
        assert.match(args.input.prompt, /At "upper left", change "Hello" to "你好"/);
    }
});
for (const confirmPolicy of ['always', 'auto']) {
    test(`confirming two drawn images dispatches both jobs under ${confirmPolicy} policy`, async () => {
        const imageSelections = [
            { imageUrl: source, regions: [[0, 0, 100, 100]] },
            { imageUrl: 'https://example.com/second.png', regions: [[100, 100, 500, 500], [500, 500, 900, 900]] },
        ];
        const payload = { id: 'choice-batch', questions: [{ id: 'layer_selection_method', options: [{ id: 'draw_boxes', label: 'Draw boxes' }] }] };
        const h = loopHarness([], {
            confirmPolicy,
            images: imageSelections.map((selection, i) => ({ id: `source-${i}`, url: selection.imageUrl, status: 'success', kind: 'still' })),
            messages: [{ role: 'user', content: '@[Image Layer Splitter](model:image-layer-splitter)' }],
            pendingChoice: { payload, items: [{ toolCallId: 'ask-boxes', tool: 'ask_user' }] },
        });
        await h.choice({ action: 'submit', choiceId: payload.id, answers: [{ questionId: 'layer_selection_method', optionId: 'draw_boxes', imageSelections }] });
        const confirmation = h.events.find(event => event.type === 'confirmation').confirmation;
        assert.equal(confirmation.count, 2);
        assert.deepEqual(Array.from(confirmation.jobs, job => job.inputUrls[0]), imageSelections.map(selection => selection.imageUrl));
        if (confirmPolicy === 'always') {
            assert.equal(h.tools(), undefined, 'No LLM call may drop a confirmed image');
            const pending = h.s.pendingConfirmation;
            assert.equal(pending.items.length, 2);
            await h.confirm({ action: 'confirm', confirmationId: pending.payload.id, params: pending.payload.params });
        }
        else {
            assert.equal(h.s.pendingConfirmation, null);
        }
        assert.equal(h.generationRequests.length, 2);
        assert.equal(new Set(h.generationRequests.map(request => request.callId)).size, 2);
        assert.deepEqual(h.generationRequests.map(request => request.args.input.image), imageSelections.map(selection => selection.imageUrl));
    });
}
test('a partial layer failure cannot trigger a second split, even if the summary model calls tools', async () => {
    const model = registry.AGENT_MODELS.find(model => model.id === 'image-layer-splitter');
    const imageSelections = [source, 'https://example.com/small.png', 'https://example.com/room.png'].map(imageUrl => ({ imageUrl, regions: [[0, 0, 300, 300]] }));
    const payload = { id: 'partial', questions: [{ id: 'layer_selection_method', options: [{ id: 'draw_boxes', label: 'Draw boxes' }] }] };
    const repeated = imageSelections.map((selection, i) => call(model, { image_url: selection.imageUrl, regions: selection.regions }, `unwanted-${i}`));
    const h = loopHarness([repeated], {
        confirmPolicy: 'auto',
        failLayerUrl: imageSelections[1].imageUrl,
        images: imageSelections.map((selection, i) => ({ id: `upload-${i}`, url: selection.imageUrl, status: 'success', kind: 'upload' })),
        messages: [{ role: 'user', content: '@[Image Layer Splitter](model:image-layer-splitter)' }],
        pendingChoice: { payload, items: [{ toolCallId: 'ask-partial', tool: 'ask_user' }] },
    }, { content: 'Two images succeeded; the small image failed.' });
    await h.choice({ action: 'submit', choiceId: payload.id, answers: [{ questionId: 'layer_selection_method', optionId: 'draw_boxes', imageSelections }] });
    assert.equal(h.generationRequests.length, 3);
    assert.equal(h.s.pendingConfirmation, null);
    assert.equal(h.llmRequests.length, 1);
    assert.equal(h.llmRequests[0].disableTools, true);
    assert.ok(!h.s.messages.some(message => message.internal && JSON.stringify(message.content).includes('Retry only')));
    assert.ok(!h.s.messages.some(message => message.tool_calls?.some(tool => tool.id.startsWith('unwanted-'))));
    assert.equal(h.s.images.filter(image => image.modelId === model.id && image.status === 'success').length, 2);
});
test('text submission queues GPT directly and saves a full-image edit without a second planning call', async () => {
    const textEdit = { imageUrl: source, lines: [{ original: 'Hello', text: 'Hello', location: 'upper left' }, { original: 'Keep', text: 'Keep', location: 'bottom' }] };
    const h = loopHarness([], {
        confirmPolicy: 'always',
        images: [{ id: 'upload', url: source, status: 'success', kind: 'upload' }],
        messages: [{ role: 'user', content: '@[Image Text Editor](model:image-text-editor)' }],
        pendingChoice: { payload: { id: 'edit', textEdit, questions: [] }, items: [{ toolCallId: 'detect', tool: 'model_image_text_editor' }] },
    });
    await h.choice({ choiceId: 'edit', action: 'submit', answers: [{ questionId: 'image_text_editor', textLines: [{ ...textEdit.lines[0], text: '你好' }, textEdit.lines[1]] }] });
    assert.equal(h.llmRequests.length, 0);
    const pending = h.s.pendingConfirmation;
    assert.equal(pending.payload.count, 1);
    assert.equal(pending.payload.jobs[0].modelName, 'GPT Image 2.5 Sunburst');
    const args = JSON.parse(pending.items[0].argsJson);
    assert.equal(args.modelId, 'gpt-image-2-5-sunburst-image-to-image');
    assert.match(args.input.prompt, /At "upper left", change "Hello" to "你好"/);
    assert.doesNotMatch(args.input.prompt, /"Keep"|bbox|coordinates|crop/);
    assert.equal(args.input._textEdit, undefined);
    await h.confirm({ confirmationId: pending.payload.id, action: 'confirm', params: pending.payload.params });
    assert.equal(h.generationRequests.length, 1);
    assert.equal(h.llmRequests[0].disableTools, true);
});
for (const confirmPolicy of ['always', 'auto']) {
    test(`multi-image text edits create one GPT job per changed source under ${confirmPolicy} policy`, async () => {
        const textEdits = [source, 'https://example.com/cup.png', 'https://example.com/unchanged.png'].map((imageUrl, index) => ({ imageUrl, lines: [{ original: `Original ${index}`, text: `Original ${index}`, location: `location ${index}` }] }));
        const changed = textEdits.slice(0, 2).map((edit, index) => ({ ...edit, lines: [{ ...edit.lines[0], text: `Replacement ${index}` }] }));
        const model = registry.AGENT_MODELS.find(model => model.id === 'image-text-editor');
        const h = loopHarness([[call(model, { image_url: source }, 'unwanted-repeat')]], {
            confirmPolicy,
            images: textEdits.map((edit, index) => ({ id: `upload-${index}`, url: edit.imageUrl, kind: 'upload', status: 'success' })),
            messages: [{ role: 'user', content: registry.modelMention(model) }],
            pendingChoice: { payload: { id: 'batch-edit', textEdits, questions: [] }, items: [{ toolCallId: 'detect-batch', tool: 'model_image_text_editor' }] },
        });
        await h.choice({ choiceId: 'batch-edit', action: 'submit', answers: [{ questionId: 'image_text_editor', textEdits: changed }] });
        const confirmation = h.events.find(event => event.type === 'confirmation').confirmation;
        assert.equal(confirmation.count, 2);
        assert.ok(confirmation.jobs.every(job => job.modelName === 'GPT Image 2.5 Sunburst'));
        assert.deepEqual(Array.from(confirmation.jobs, job => job.inputUrls[0]), changed.map(edit => edit.imageUrl));
        if (confirmPolicy === 'always') {
            assert.equal(h.llmRequests.length, 0);
            const pending = h.s.pendingConfirmation;
            await h.confirm({ confirmationId: pending.payload.id, action: 'confirm', params: pending.payload.params });
        }
        assert.equal(h.generationRequests.length, 2);
        assert.equal(new Set(h.generationRequests.map(request => request.callId)).size, 2);
        h.generationRequests.forEach(({ args }, index) => {
            assert.deepEqual(Array.from(args.input.images), [changed[index].imageUrl]);
            assert.match(args.input.prompt, new RegExp(`At "location ${index}", change "Original ${index}" to "Replacement ${index}"`));
            assert.doesNotMatch(args.input.prompt, new RegExp(`Original ${1 - index}`));
        });
        assert.equal(h.s.images.filter(image => image.modelId === 'gpt-image-2-5-sunburst-image-to-image' && image.status === 'success').length, 2);
        assert.equal(h.s.pendingConfirmation, null);
        assert.equal(h.llmRequests.length, 1);
        assert.equal(h.llmRequests[0].disableTools, true);
        assert.ok(!h.s.messages.some(message => message.tool_calls?.some(tool => tool.id === 'unwanted-repeat')));
    });
}
test('a confirmed batch cannot borrow another image draft, including when only one image changed', async () => {
    const s = session();
    s.images = [{ id: 'upload', url: source, kind: 'upload', status: 'success' }];
    s.messages = [{ role: 'tool', content: JSON.stringify({ ok: true, textEdits: [{ imageUrl: source, lines: [{ original: 'Hello', text: 'Hi', location: 'top' }] }] }) }];
    await assert.rejects(api.prepareModelGeneration('model_image_text_editor', JSON.stringify({ image_url: 'https://example.com/other.png' }), s), /confirm edits/);
    const args = await api.prepareModelGeneration('model_image_text_editor', JSON.stringify({ image_url: 'upload' }), s);
    assert.equal(args.input.images[0], source);
});
test('multiple editor tool calls open one card and detect each attachment only once', async () => {
    const model = registry.AGENT_MODELS.find(model => model.id === 'image-text-editor');
    const urls = [source, 'https://example.com/cup.png'];
    const h = loopHarness([[call(model, { image_url: urls[1] }, 'detect-last'), call(model, { image_url: urls[0] }, 'detect-first')]], {
        images: urls.map((url, index) => ({ id: `upload-${index}`, url, kind: 'upload', status: 'success' })),
        messages: [{ role: 'user', content: [{ type: 'text', text: registry.modelMention(model) }, ...urls.map(url => ({ type: 'image_url', image_url: { url } }))] }],
    });
    await h.run();
    assert.deepEqual(h.detectionRequests.map(request => request.messages[1].content[0].image_url.url), urls);
    assert.equal(h.events.filter(event => event.type === 'choice').length, 1);
    assert.equal(h.s.pendingChoice.items.length, 1);
    assert.deepEqual(Array.from(h.s.pendingChoice.payload.textEdits, edit => edit.imageUrl), urls);
    assert.equal(h.generationRequests.length, 0);
    const textEdits = h.s.pendingChoice.payload.textEdits.map(edit => ({ ...edit, lines: edit.lines.map(line => ({ ...line, text: `${line.text}!` })) }));
    await h.choice({ choiceId: h.s.pendingChoice.payload.id, action: 'submit', answers: [{ questionId: 'image_text_editor', textEdits }] });
    assert.equal(h.s.pendingConfirmation.items.length, 2);
    assert.equal(h.detectionRequests.length, 2, 'Submission must not detect again');
});

function sketchRequest() {
  const model = registry.AGENT_MODELS.find(model => model.id === 'sketch-to-image')
  return { role: 'user', content: [{ type: 'text', text: registry.modelMention(model) }, { type: 'image_url', image_url: { url: source } }] }
}
function sketchAnswer(questionId, optionId, extra = {}, prompt = 'Preserve its composition. 水彩风格 watercolor cottage') {
  const id = `ask-${questionId}-${Math.random()}`
  return [
    { role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: questionId, prompt }] }) } }] },
    { role: 'tool', tool_call_id: id, content: JSON.stringify({ ok: true, answers: [{ questionId, optionId, ...extra }], ...(questionId === 'sketch_understanding' && optionId === 'correct' ? { confirmedUnderstanding: prompt } : {}) }) },
  ]
}
function approvedSketch() {
  return [sketchRequest(), ...sketchAnswer('sketch_references', 'no'), ...sketchAnswer('sketch_understanding', 'correct')]
}
test('Sketch accepts the prompt composed after understanding confirmation and preserves the selected images', async () => {
  const s = session()
  s.messages = approvedSketch()
  const prompt = 'Create a watercolor cottage preserving the sketch composition and the requested lettering.'
  const args = await api.prepareModelGeneration('model_sketch_to_image', JSON.stringify({ images: ['https://example.com/unselected.png'], prompt, resolution: '2k' }), s)
  assert.equal(args.modelId, 'gpt-image-2-5-flare-image-to-image')
  assert.equal(args.requestModel, 'openai/gpt-image-2.5-flare/edit')
  assert.equal(args.input.images[0], source)
  assert.equal(args.input.images.length, 1)
  assert.equal(args.input.prompt, prompt)
  assert.equal(api.modelConfirmation(args).modelName, 'GPT Image 2.5 Flare')
  await assert.rejects(api.prepareModelGeneration('model_gpt_image_2_5_sunburst_image_to_image', '{}', s), /model_sketch_to_image/)
})
test('Sketch blocks missing source, unfinished steps, direct backend bypass, adjustment and cancellation', async () => {
  const s = session()
  await assert.rejects(api.prepareModelGeneration('model_sketch_to_image', '{}', s), /Save a sketch/)
  s.messages = [sketchRequest()]
  for (const tool of ['model_sketch_to_image', 'model_gpt_image_2_5_flare_image_to_image'])
    await assert.rejects(api.prepareModelGeneration(tool, '{}', s), /confirm sketch_understanding/)
  s.messages = approvedSketch()
  s.messages.push(...sketchAnswer('sketch_understanding', 'adjust', { text: 'Make it blue' }))
  await assert.rejects(api.prepareModelGeneration('model_sketch_to_image', '{}', s), /confirm sketch_understanding/)
  s.messages = approvedSketch()
  s.messages.push(...sketchAnswer('sketch_prompt', 'cancel'))
  await assert.rejects(api.prepareModelGeneration('model_sketch_to_image', '{}', s), /confirm sketch_understanding/)
})


function sketchAsk(id, prompt = 'Question') {
  const options = id === 'sketch_prompt' ? ['send', 'adjust', 'cancel'] : id === 'sketch_understanding' ? ['correct', 'adjust'] : ['yes', 'no']
  return { id: `call-${id}-${Math.random()}`, type: 'function', function: { name: 'ask_user', arguments: JSON.stringify({ questions: [{ id, prompt, options: options.map(id => ({ id, label: id, ...(id === 'adjust' ? { allow_custom: true } : {}) })) }] }) } }
}
test('Sketch inspects all images, confirms corrections, then submits directly without more creative checkpoints', async () => {
  const ref = 'https://example.com/reference.png'
  const initialRef = 'https://example.com/initial-reference.png'
  const model = registry.AGENT_MODELS.find(model => model.id === 'sketch-to-image')
  const understanding = 'I understand the sketch as a cottage centered in the frame, with a tall tree on the left. The initial reference supplies the cottage architecture; the added reference supplies the color palette. The drawn lettering appears to be a title above the roof, rather than an instruction to change the chat language. Is this understanding correct?'
  const corrected = understanding.replace('tall tree', 'signpost')
  const prompt = 'Draw a cottage using sketch composition and reference colors. Include the confirmed signpost on the left and the title above the roof.'
  const request = sketchRequest()
  request.content.push({ type: 'image_url', image_url: { url: initialRef } })
  const h = loopHarness([
    [sketchAsk('sketch_references')],
    [sketchAsk('sketch_understanding', understanding)],
    [sketchAsk('sketch_understanding', corrected)],
    [call(model, { prompt, images: ['https://example.com/wrong.png'] })],
  ], { messages: [request], images: [source, initialRef, ref].map((url, index) => ({ id: String(index), url, kind: 'upload', status: 'success' })) })
  await h.run()
  const answer = async (questionId, optionId, extra = {}) => h.choice({ action: 'submit', choiceId: h.s.pendingChoice.payload.id, answers: [{ questionId, optionId, ...extra }] })
  await answer('sketch_references', 'yes', { referenceImages: [{ url: ref, name: 'Colors' }] })
  assert.equal(h.s.pendingChoice.payload.questions[0].id, 'sketch_understanding')
  assert.equal(h.s.pendingChoice.payload.questions[0].prompt, understanding, 'The complete visual interpretation must not be truncated to a short question')
  assert.deepEqual(Array.from(h.s.pendingChoice.payload.questions[0].options, option => [option.id, option.custom]), [['correct', false], ['adjust', true]])
  const firstReview = h.llmRequests.at(-1).messages.findLast(message => message.internal && Array.isArray(message.content))
  assert.deepEqual(Array.from(firstReview.content.filter(part => part.type === 'image_url'), part => part.image_url.url), [source, initialRef, ref], 'The LLM must receive all actual images before describing its understanding')
  await answer('sketch_understanding', 'adjust', { text: 'The shape on the left is a signpost, not a tree.' })
  assert.equal(h.s.pendingChoice.payload.questions[0].id, 'sketch_understanding')
  assert.equal(h.s.pendingChoice.payload.questions[0].prompt, corrected)
  assert.ok(h.llmRequests.at(-1).messages.some(message => message.role === 'tool' && message.content.includes('The shape on the left is a signpost')))
  await assert.rejects(api.prepareModelGeneration('model_sketch_to_image', '{}', h.s), /confirm sketch_understanding/)
  await answer('sketch_understanding', 'correct')
  assert.equal(h.s.pendingChoice, null)
  assert.equal(h.llmRequests.at(-1).requiredTool, 'model_sketch_to_image')
  const confirmed = h.s.messages.filter(message => message.role === 'tool').map(message => JSON.parse(message.content)).find(result => result.confirmedUnderstanding)
  assert.equal(confirmed.confirmedUnderstanding, corrected)
  const review = h.s.messages.findLast(message => message.internal && Array.isArray(message.content))
  assert.deepEqual([...review.content.filter(part => part.type === 'image_url').map(part => part.image_url.url)], [source, initialRef, ref])
  assert.equal(h.generationRequests.length, 0)
  assert.equal(h.s.pendingConfirmation.payload.params.prompt, prompt)
  assert.deepEqual([...h.s.pendingConfirmation.payload.params.modelInput.images], [source, initialRef, ref])
  assert.deepEqual(h.events.filter(event => event.type === 'choice').map(event => event.choice.questions[0].id), ['sketch_references', 'sketch_understanding', 'sketch_understanding'])
})
test('Sketch refuses out-of-order cards and empty Yes answers without consuming the pending step', async () => {
  const h = loopHarness([[sketchAsk('sketch_notes')], [sketchAsk('sketch_references')]], { messages: [sketchRequest()], images: [] })
  await h.run()
  assert.equal(h.s.pendingChoice.payload.questions[0].id, 'sketch_references')
  const choiceId = h.s.pendingChoice.payload.id
  await assert.rejects(h.choice({ action: 'submit', choiceId, answers: [{ questionId: 'sketch_references', optionId: 'yes', referenceImages: [] }] }), /between 1 and 8/)
  assert.equal(h.s.pendingChoice.payload.id, choiceId)
  assert.equal(h.generationRequests.length, 0)
})

test('Sketch Correct generates once with automatic confirmation without any further question', async () => {
  const model = registry.AGENT_MODELS.find(model => model.id === 'sketch-to-image')
  const prompt = 'A finished cottage illustration based on the confirmed sketch.'
  const h = loopHarness([
    [sketchAsk('sketch_references')],
    [sketchAsk('sketch_understanding', 'A cottage in the center. Confirm to generate the image.')],
    [call(model, { prompt, images: [source] })],
    [call(model, { prompt: 'Unrequested repeat', images: [source] }, 'repeat')],
  ], { messages: [sketchRequest()], confirmPolicy: 'auto' })
  await h.run()
  assert.equal(h.llmRequests[0].requiredTool, 'ask_user')
  await h.choice({ action: 'skip', choiceId: h.s.pendingChoice.payload.id })
  const review = h.llmRequests.at(-1).messages.findLast(message => message.internal && Array.isArray(message.content))
  assert.deepEqual(Array.from(review.content.filter(part => part.type === 'image_url'), part => part.image_url.url), [source])
  await h.choice({ action: 'submit', choiceId: h.s.pendingChoice.payload.id, answers: [{ questionId: 'sketch_understanding', optionId: 'correct' }] })
  assert.equal(h.s.pendingChoice, null)
  assert.equal(h.s.pendingConfirmation, null)
  assert.equal(h.generationRequests.length, 1)
  assert.equal(h.generationRequests[0].args.input.prompt, prompt)
  assert.deepEqual(Array.from(h.generationRequests[0].args.input.images), [source])
  assert.equal(h.llmRequests[2].requiredTool, 'model_sketch_to_image')
  assert.equal(h.llmRequests.at(-1).disableTools, true)
  assert.deepEqual(h.events.filter(event => event.type === 'choice').map(event => event.choice.questions[0].id), ['sketch_references', 'sketch_understanding'])
})

test('Sketch rejects extra questions after Correct and proceeds to generation instead', async () => {
  const model = registry.AGENT_MODELS.find(model => model.id === 'sketch-to-image')
  const h = loopHarness([
    [sketchAsk('sketch_notes')],
    [sketchAsk('sketch_prompt')],
    [call(model, { prompt: 'A cottage from the confirmed sketch.', images: [source] })],
  ], { messages: approvedSketch() })
  await h.run()
  assert.equal(h.s.pendingChoice, null)
  assert.ok(h.s.pendingConfirmation)
  assert.equal(h.events.filter(event => event.type === 'choice').length, 0)
  assert.ok(h.s.messages.some(message => message.role === 'tool' && message.content.includes('do not ask for further confirmation')))
})

test('Sketch cannot skip understanding or consume an empty correction, and cannot jump ahead to notes or generation', async () => {
  const h = loopHarness([
    [sketchAsk('sketch_references')],
    [sketchAsk('sketch_notes')],
    [sketchAsk('sketch_understanding', 'A cottage with a signpost. Is this understanding correct?')],
  ], { messages: [sketchRequest()] })
  await h.run()
  await h.choice({ action: 'submit', choiceId: h.s.pendingChoice.payload.id, answers: [{ questionId: 'sketch_references', optionId: 'no' }] })
  assert.ok(h.s.messages.some(message => message.role === 'tool' && message.content.includes('exactly one sketch_understanding')))
  const choiceId = h.s.pendingChoice.payload.id
  await assert.rejects(h.choice({ action: 'skip', choiceId }), /Confirm the understanding/)
  await assert.rejects(h.choice({ action: 'submit', choiceId, answers: [] }), /Confirm the understanding/)
  await assert.rejects(h.choice({ action: 'submit', choiceId, answers: [{ questionId: 'sketch_understanding', optionId: 'adjust', text: '  ' }] }), /Describe what to add or correct/)
  assert.equal(h.s.pendingChoice.payload.id, choiceId)
  assert.equal(h.s.pendingConfirmation, null)
  assert.equal(h.generationRequests.length, 0)
  const s = session()
  s.messages = [sketchRequest(), ...sketchAnswer('sketch_references', 'no'), ...sketchAnswer('sketch_notes', 'no'), ...sketchAnswer('sketch_prompt', 'send')]
  for (const tool of ['model_sketch_to_image', 'model_gpt_image_2_5_flare_image_to_image'])
    await assert.rejects(api.prepareModelGeneration(tool, '{}', s), /confirm sketch_understanding/)
})

test('Sketch approval is tied to the current saved sketch, not an older request', async () => {
  const s = session()
  s.messages = [...approvedSketch(), sketchRequest()]
  await assert.rejects(api.prepareModelGeneration('model_sketch_to_image', '{}', s), /confirm sketch_understanding/)
})

const { normalizeComposerSelection } = load('shared/utils/agentComposerSelection.ts')
test('composer keeps only the last model or skill while preserving the prompt', () => {
  const [first, second] = registry.AGENT_MODELS
  const modelA = registry.modelMention(first)
  const modelB = registry.modelMention(second)
  const skillA = '/product-hunt-gallery'
  const skillB = '/image-layer-splitter'
  const prompt = 'Keep this prompt\nand https://example.com/product-hunt-gallery /unknown'
  for (const [previous, next] of [[modelA, modelB], [skillA, skillB], [modelA, skillA], [skillA, modelA], [modelA, modelA], [skillA, skillA]]) {
    const normalized = normalizeComposerSelection(`${previous} ${next} ${prompt}`)
    assert.equal(normalized, `${next} ${prompt}`)
    assert.equal(normalizeComposerSelection(normalized), normalized)
  }
  assert.equal(normalizeComposerSelection(`${modelA} ${skillA} ${skillB} ${prompt}`), `${skillB} ${prompt}`)
  assert.equal(normalizeComposerSelection(prompt), prompt)
  assert.equal(normalizeComposerSelection(''), '')
})
