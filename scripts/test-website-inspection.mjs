import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import process from 'node:process'
import sharp from 'sharp'
import { inspectWebsite, publicWebsiteTarget } from '../server/agent/websiteInspection.ts'

for (const url of ['http://127.0.0.1', 'http://[::1]', 'http://169.254.169.254', 'http://10.0.0.1', 'http://[::ffff:127.0.0.1]', 'file:///etc/passwd', 'https://user:password@example.com', 'http://example.com:3000'])
  await assert.rejects(() => publicWebsiteTarget(url), undefined, url)
const cancelled = new AbortController()
cancelled.abort()
await assert.rejects(() => inspectWebsite('https://example.com', cancelled.signal))
console.log('URL safety and cancellation checks passed.')
if (process.argv[2]) {
  const result = await inspectWebsite(process.argv[2])
  assert.equal(result.content.ok, true, JSON.stringify(result.content))
  assert.ok(result.content.text.length > 0)
  assert.equal(result.content.method, 'playwright')
  assert.equal(result.screenshots.length, 2)
  const hero = await sharp(result.screenshots[0]).metadata()
  const overview = await sharp(result.screenshots[1]).metadata()
  assert.equal(hero.width, 1440)
  assert.equal(hero.height, 1000)
  assert.equal(overview.height, Math.min(result.content.pageHeight, 6000))
  await mkdir('tmp/website-inspection', { recursive: true })
  await writeFile('tmp/website-inspection/content.json', JSON.stringify(result.content, null, 2))
  for (const [index, bytes] of result.screenshots.entries())
    await writeFile(`tmp/website-inspection/screenshot-${index + 1}.jpg`, bytes)
  console.log(JSON.stringify({ title: result.content.title, status: result.content.status, textLength: result.content.text.length, screenshots: result.screenshots.map(image => image.length) }))
}
