import { randomUUID } from 'node:crypto'
import { connectDatabase } from './sqlite'

export interface ServiceSettings {
  wavespeedKey: string
  llmModel: string
  /** Disabled until media generation is migrated to WaveSpeed. */
  falKey: string
  revision: string
  llmOk: boolean
  wavespeedOk: boolean
  checkedAt: string
}
export const DEFAULT_MODEL = 'moonshotai/kimi-k3'
export function readServiceSettings(): ServiceSettings {
  const db = connectDatabase()
  db.exec('CREATE TABLE IF NOT EXISTS local_service_settings (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL)')
  const row = db.prepare('SELECT body FROM local_service_settings WHERE id = 1').get()
  const saved = row ? JSON.parse(String(row.body)) : {}
  const defaults = { wavespeedKey: '', llmModel: DEFAULT_MODEL, revision: '', llmOk: false, wavespeedOk: false, checkedAt: '' }
  // Legacy credentials and approvals must never be reused for a different provider.
  return { ...defaults, ...(typeof saved.wavespeedKey === 'string' ? saved : {}), falKey: '', llmModel: DEFAULT_MODEL }
}
export function writeServiceSettings(settings: ServiceSettings) {
  readServiceSettings()
  connectDatabase().prepare('INSERT INTO local_service_settings(id, body) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body').run(JSON.stringify(settings))
}
export function updateServiceSettings(input: { wavespeedKey?: string, llmModel?: string }) {
  const current = readServiceSettings()
  const settings: ServiceSettings = {
    wavespeedKey: input.wavespeedKey === undefined ? current.wavespeedKey : input.wavespeedKey.trim(),
    // LLM is product-locked; ignore any client-supplied model id.
    llmModel: DEFAULT_MODEL,
    falKey: '',
    revision: randomUUID(),
    llmOk: false,
    wavespeedOk: false,
    checkedAt: '',
  }
  writeServiceSettings(settings)
  return settings
}
export function publicServiceStatus(settings = readServiceSettings()) {
  const fresh = Boolean(settings.checkedAt)
  return {
    wavespeedConfigured: Boolean(settings.wavespeedKey),
    llmModel: settings.llmModel,
    llmOk: fresh && settings.llmOk,
    wavespeedOk: fresh && settings.wavespeedOk,
    connected: fresh && settings.llmOk && settings.wavespeedOk,
    checkedAt: settings.checkedAt,
  }
}
