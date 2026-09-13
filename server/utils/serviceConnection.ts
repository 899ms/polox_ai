import type { ServiceSettings } from './serviceSettings'
import { publicServiceStatus, readServiceSettings, writeServiceSettings } from './serviceSettings'

async function checkLlm(settings: ServiceSettings) {
  if (!settings.wavespeedKey)
    return { ok: false, message: 'WaveSpeed LLM API key is not configured.' }
  try {
    const response = await fetch('https://llm.wavespeed.ai/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(60000),
      headers: { 'Authorization': `Bearer ${settings.wavespeedKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: settings.llmModel, messages: [{ role: 'user', content: 'Reply OK.' }], max_tokens: 512, stream: false }),
    })
    const payload = await response.json()
    if (!response.ok || payload.error || typeof payload.choices?.[0]?.message?.content !== 'string' || !payload.choices[0].message.content.trim())
      return { ok: false, message: `WaveSpeed LLM test failed (${response.status}). Check your key, model name and available balance.` }
    return { ok: true, message: 'WaveSpeed LLM model responded successfully.' }
  }
  catch { return { ok: false, message: 'WaveSpeed LLM could not be reached. Check your connection and try again.' } }
}
async function checkWaveSpeed(settings: ServiceSettings) {
  if (!settings.wavespeedKey)
    return { ok: false, message: 'WaveSpeed API key is not configured.' }
  try {
    const response = await fetch('https://api.wavespeed.ai/api/v3/balance', {
      headers: { Authorization: `Bearer ${settings.wavespeedKey}` },
      signal: AbortSignal.timeout(15000),
    })
    const payload = await response.json()
    if (!response.ok || payload.code !== 200 || typeof payload.data?.balance !== 'number')
      return { ok: false, message: `WaveSpeed authentication failed (${response.status}). Check your API key and account.` }
    return { ok: true, message: 'WaveSpeed authentication succeeded.' }
  }
  catch { return { ok: false, message: 'WaveSpeed could not be reached. Check your connection and try again.' } }
}
export async function testServiceConnections(settings: ServiceSettings) {
  const [llm, wavespeed] = await Promise.all([checkLlm(settings), checkWaveSpeed(settings)])
  if (readServiceSettings().revision !== settings.revision)
    return { ...publicServiceStatus(), llm, wavespeed, superseded: true }
  const checked = { ...settings, llmOk: llm.ok, wavespeedOk: wavespeed.ok, checkedAt: new Date().toISOString() }
  writeServiceSettings(checked)
  return { ...publicServiceStatus(checked), llm, wavespeed, superseded: false }
}
