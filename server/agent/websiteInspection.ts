import type { IncomingHttpHeaders } from 'node:http'
import type { Socket } from 'node:net'
import { lookup } from 'node:dns/promises'
import { createServer, request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import ipaddr from 'ipaddr.js'
import { chromium } from 'playwright'

export const inspectWebsiteTool = {
  type: 'function',
  function: {
    name: 'inspect_website',
    description: 'Open a public website in Playwright and return rendered text, metadata, headings, links, computed styles and two screenshots for product and visual analysis. Call alone. No generation credits. Blocked/challenge pages are explicitly reported, not product evidence.',
    parameters: { type: 'object', additionalProperties: false, properties: { url: { type: 'string', description: 'Absolute public HTTP(S) page URL.' } }, required: ['url'] },
  },
}

export async function publicWebsiteTarget(value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port)))
    throw new Error('Use a public HTTP(S) URL on port 80 or 443, without credentials.')
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = await lookup(hostname, { all: true })
  if (!addresses.length || addresses.some(item => ipaddr.process(item.address).range() !== 'unicast'))
    throw new Error('Private, local and reserved network addresses are blocked.')
  return { url, address: addresses[0]! }
}

// HTTPS uses a CONNECT tunnel: Chromium retains its own TLS, headers, cookies and
// request methods. The proxy pins validated public IPs, including redirect targets.
async function websiteProxy() {
  const sockets = new Set<Socket>()
  const track = (socket: Socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  }
  const server = createServer(async (incoming, outgoing) => {
    try {
      const { url, address } = await publicWebsiteTarget(incoming.url || '')
      if (!server.listening || outgoing.destroyed)
        return
      if (url.protocol !== 'http:')
        throw new Error('Use CONNECT for HTTPS')
      const headers: IncomingHttpHeaders = { ...incoming.headers, host: url.host }
      delete headers['proxy-authorization']
      delete headers['proxy-connection']
      const upstream = httpRequest(url, {
        method: incoming.method,
        headers,
        agent: false,
        family: address.family,
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      }, (response) => {
        outgoing.writeHead(response.statusCode || 502, response.headers)
        response.pipe(outgoing)
      })
      upstream.on('socket', socket => track(socket))
      upstream.on('error', () => {
        if (!outgoing.headersSent)
          outgoing.writeHead(502)
        outgoing.end()
      })
      upstream.setTimeout(15000, () => upstream.destroy())
      outgoing.on('close', () => upstream.destroy())
      incoming.pipe(upstream)
    }
    catch { outgoing.writeHead(403); outgoing.end('Public websites only') }
  })
  server.on('connection', track)
  server.on('connect', async (request, client, head) => {
    try {
      const { url, address } = await publicWebsiteTarget(`https://${request.url}`)
      if (client.destroyed || !server.listening)
        return
      const upstream = connect({ host: address.address, port: Number(url.port || 443), family: address.family })
      track(upstream)
      upstream.setTimeout(15000, () => upstream.destroy())
      upstream.on('error', () => client.destroy())
      client.on('error', () => upstream.destroy())
      client.on('close', () => upstream.destroy())
      upstream.on('close', () => client.destroy())
      upstream.on('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length)
          upstream.write(head)
        client.pipe(upstream)
        upstream.pipe(client)
      })
    }
    catch { client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n') }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Browser proxy unavailable')
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => { server.close(); for (const socket of sockets) socket.destroy() },
  }
}

let active = 0
export async function inspectWebsite(url: string, signal?: AbortSignal) {
  if (active >= 2)
    throw new Error('Website inspection is busy. Try again shortly.')
  active++
  const abort = new AbortController()
  const cancel = () => abort.abort()
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted)
    cancel()
  const timer = setTimeout(cancel, 60000)
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  let proxy: Awaited<ReturnType<typeof websiteProxy>> | undefined
  try {
    abort.signal.throwIfAborted()
    await publicWebsiteTarget(url)
    proxy = await websiteProxy()
    const options = { headless: true, timeout: 15000, proxy: { server: proxy.url, bypass: '<-loopback>' }, args: ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] }
    try { browser = await chromium.launch(options) }
    catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Executable doesn\'t exist'))
        throw error
      try { browser = await chromium.launch({ ...options, channel: 'chrome' }) }
      catch { throw new Error('Browser unavailable. Run pnpm browser:install (Linux: pnpm browser:install:linux) as the runtime user.') }
    }
    abort.signal.addEventListener('abort', () => {
      proxy?.close()
      void browser?.close().catch(() => {})
    }, { once: true })
    abort.signal.throwIfAborted()
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: false })
    await context.routeWebSocket('**/*', socket => socket.close())
    let requests = 0
    let blockedRequests = 0
    await context.route('**/*', async (route) => {
      if (++requests > 180 || route.request().resourceType() === 'media') {
        blockedRequests++
        await route.abort()
      }
      else {
        await route.continue()
      }
    })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    page.on('dialog', dialog => void dialog.dismiss())
    context.on('page', (popup) => {
      if (popup !== page)
        void popup.close()
    })
    let status: number | undefined
    let challengeHeader = false
    page.on('response', (response) => {
      if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
        status = response.status()
        challengeHeader = response.headers()['cf-mitigated'] === 'challenge'
      }
    })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.locator('body').waitFor()
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2000))]))
    for (let i = 0; i < 5; i++) {
      await page.evaluate(y => window.scrollTo(0, y), i * 900)
      await page.waitForTimeout(250)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    const content = await page.evaluate(() => {
      // Only rendered text is relevant; exclude scripts and hidden elements.
      // eslint-disable-next-line unicorn/prefer-dom-node-text-content
      const text = document.body.innerText
      const meta = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content || ''
      const visible = (element: Element) => element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0
      return {
        title: document.title,
        description: meta('meta[name="description"]'),
        siteName: meta('meta[property="og:site_name"]'),
        text: text.slice(0, 24000),
        textTruncated: text.length > 24000,
        headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).slice(0, 50).map(el => ({ level: el.tagName, text: el.textContent?.trim().slice(0, 300) })),
        links: [...document.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(visible).filter(el => /^https?:/.test(el.href)).slice(0, 60).map(el => ({ text: el.textContent?.trim().slice(0, 100), url: el.href })),
        images: [...document.images].filter(visible).slice(0, 35).map(el => ({ url: el.currentSrc || el.src, alt: el.alt })),
        styles: [...document.querySelectorAll('body,h1,h2,button,a')].filter(visible).slice(0, 25).map((el) => {
          const style = getComputedStyle(el)
          return { element: el.tagName, color: style.color, background: style.backgroundColor, font: style.fontFamily, fontSize: style.fontSize, borderRadius: style.borderRadius }
        }),
        pageHeight: document.documentElement.scrollHeight,
        challenge: /^(?:just a moment|attention required|access denied|verify (?:you are|that you are) human)/i.test(document.title) || Boolean(document.querySelector('#challenge-form,#challenge-running')),
      }
    })
    const blocked = challengeHeader || content.challenge || [401, 403, 429].includes(status || 0)
    const ok = !blocked && status !== undefined && status >= 200 && status < 300
    const hero = await page.screenshot({ type: 'jpeg', quality: 85, animations: 'disabled' })
    const overview = await page.screenshot({ type: 'jpeg', quality: 80, animations: 'disabled', fullPage: true, clip: { x: 0, y: 0, width: 1440, height: Math.min(content.pageHeight, 6000) } })
    return {
      content: { ...content, ok, blocked, error: ok ? undefined : 'The page is blocked, requires verification/authentication, or returned an HTTP error. Its content is not product evidence.', url: page.url(), status, method: 'playwright', blockedRequests, overviewTruncated: content.pageHeight > 6000, capturedAt: new Date().toISOString() },
      screenshots: [hero, overview],
    }
  }
  finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
    abort.abort()
    await browser?.close().catch(() => {})
    proxy?.close()
    active--
  }
}
