import assert from 'node:assert/strict'
import { adaptImageKResolution, constrainImageKResolution, pickNearestImageResolution, imageKResolutionFamily, modelSupportsImageKResolution, modelIsImageToImage } from '../shared/utils/imageResolution.ts'
import { validateObjectRemovalEdit, objectRemovalOverlaySvg, OBJECT_REMOVAL_MASK_COLOR } from '../shared/utils/imageObjectRemoval.ts'

assert.equal(pickNearestImageResolution(800, 600), '1K')
assert.equal(pickNearestImageResolution(1920, 1080), '2K')
assert.equal(pickNearestImageResolution(4000, 3000), '4K')
assert.equal(pickNearestImageResolution(1800, 1200), '2K')
assert.equal(constrainImageKResolution('4K', 'auto', 'gpt-image-2'), '1K')
assert.equal(constrainImageKResolution('4K', '1:1', 'gpt-image-2'), '2K')
assert.equal(constrainImageKResolution('2K', '27:16', 'gpt-image-25'), '1K')
assert.equal(constrainImageKResolution('4K', '16:9', 'gpt-image-25'), '4K')
assert.equal(constrainImageKResolution('2K', 'auto', 'nano-banana'), '2K')
assert.equal(imageKResolutionFamily('gpt-image-2-5-sunburst-image-to-image'), 'gpt-image-25')
assert.equal(modelIsImageToImage({ id: 'gpt-image-2-5-sunburst-image-to-image', task: 'Image to Image' }), true)
assert.equal(modelSupportsImageKResolution({ schema: { components: { schemas: { Input: { properties: { resolution: { enum: ['1K', '2K', '4K'] } } } } } } }), true)
assert.equal(modelSupportsImageKResolution({ schema: { components: { schemas: { Input: { properties: { resolution: { enum: ['1k', '2k', '4k'] } } } } } } }), true)
assert.equal(adaptImageKResolution('2K', ['1k', '2k', '4k']), '2k')
assert.equal(adaptImageKResolution('2K', ['1K', '2K', '4K']), '2K')

const urls = ['https://cdn.example/a.png']
const edit = validateObjectRemovalEdit({
  imageUrl: urls[0],
  targets: [
    { kind: 'bbox', label: 'cone', bbox: [10, 20, 200, 300] },
    { kind: 'mask', label: 'person', strokes: [{ mode: 'paint', size: 24, points: [[100, 100], [120, 110]] }] },
  ],
  annotatedImageUrl: 'https://cdn.example/overlay.png',
}, urls)
assert.equal(edit.targets.length, 2)
assert.equal(edit.annotatedImageUrl, 'https://cdn.example/overlay.png')
assert.throws(() => validateObjectRemovalEdit({ imageUrl: urls[0], targets: [] }, urls))
const svg = objectRemovalOverlaySvg(edit.targets, 1000, 800)
assert.match(svg, /svg/)
assert.match(svg, new RegExp(OBJECT_REMOVAL_MASK_COLOR))
console.log('image-object-removal checks passed')
