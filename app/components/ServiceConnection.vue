<script setup lang="ts">
import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-vue-next'
import { useServiceConnection } from '~/composables/useServiceConnection'

interface ConnectionStatus {
  connected: boolean
  wavespeedConfigured: boolean
  llmModel: string
  llmOk: boolean
  wavespeedOk: boolean
  checkedAt: string
}
const status = ref<ConnectionStatus | null>(null)
const { dialogOpen: open } = useServiceConnection()
const testing = ref(false)
const MASKED_KEY = '********'
const LOCKED_LLM_MODEL = 'deepseek/deepseek-v4.1-flash'
const wavespeedKey = ref('')
function showSavedKeys() {
  wavespeedKey.value = status.value?.wavespeedConfigured ? MASKED_KEY : ''
}
function selectKey(event: FocusEvent) {
  (event.target as HTMLInputElement).select()
}
const error = ref('')
interface ConnectionResults {
  llm: { ok: boolean, message: string }
  wavespeed: { ok: boolean, message: string }
}
const results = ref<ConnectionResults | null>(null)
const connected = computed(() => Boolean(status.value?.connected))
async function refresh() {
  try { status.value = await $fetch<ConnectionStatus>('/api/settings/services') }
  catch { status.value = null }
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refresh()
  timer = setInterval(refresh, 30000)
})
onUnmounted(() => clearInterval(timer))
watch(open, async (value) => {
  wavespeedKey.value = ''
  if (!value)
    return
  await refresh()
  showSavedKeys()
  results.value = null
  error.value = ''
})
async function testConnection() {
  testing.value = true
  results.value = null
  error.value = ''
  // A new test invalidates the previous green indicator immediately.
  if (status.value)
    status.value.connected = false
  try {
    const result = await $fetch<ConnectionStatus & ConnectionResults & { superseded: boolean }>('/api/settings/services', {
      method: 'POST',
      body: { wavespeedKey: wavespeedKey.value === MASKED_KEY ? undefined : wavespeedKey.value, llmModel: LOCKED_LLM_MODEL },
      timeout: 70000,
    })
    status.value = result
    results.value = result
    if (result.superseded)
      error.value = 'Settings changed in another window. Test the current settings again.'
    showSavedKeys()
  }
  catch { error.value = 'Connection test could not finish. Please try again.'; await refresh() }
  finally { testing.value = false }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <button type="button" class="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" :class="connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'" aria-label="Service connection" :title="connected ? 'WaveSpeed tested successfully' : 'Configure and test WaveSpeed'">
        <CheckCircle2 v-if="connected" class="size-4" />
        <AlertTriangle v-else class="size-4" />
        <span>{{ connected ? 'Services connected' : 'API key not configured' }}</span>
      </button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Service connection</DialogTitle>
        <DialogDescription>Use one WaveSpeed API key for LLM and media services. Your keys are stored locally on this computer. Keep your API keys private. Never share them with anyone.</DialogDescription>
      </DialogHeader>
      <form class="space-y-4" @submit.prevent="testConnection">
        <div class="space-y-2">
          <div class="flex items-center gap-3">
            <Label for="wavespeed-key">WaveSpeed API key</Label>
            <a href="https://wavespeed.ai/accesskey" target="_blank" rel="noopener noreferrer" class="text-xs text-primary underline underline-offset-4 hover:opacity-80" aria-label="Get WaveSpeed API key (opens in a new tab)">Get API key ↗</a>
          </div>
          <Input id="wavespeed-key" v-model="wavespeedKey" type="password" autocomplete="off" :disabled="testing" placeholder="Enter your WaveSpeed API key" @focus="selectKey" />
        </div>
        <div v-if="results" class="space-y-2 rounded-md border p-3 text-sm" role="status" aria-live="polite">
          <p :class="results.llm.ok ? 'text-emerald-600' : 'text-red-600'">
            {{ results.llm.ok ? '✓' : '⚠' }} {{ results.llm.message }}
          </p>
          <p :class="results.wavespeed.ok ? 'text-emerald-600' : 'text-red-600'">
            {{ results.wavespeed.ok ? '✓' : '⚠' }} {{ results.wavespeed.message }}
          </p>
        </div>
        <p v-if="error" role="alert" class="text-sm text-red-600">
          {{ error }}
        </p>
        <DialogFooter>
          <Button type="submit" :disabled="testing || !wavespeedKey.trim()">
            <LoaderCircle v-if="testing" class="mr-2 size-4 animate-spin" />
            {{ testing ? 'Testing connections…' : 'Test connection' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
