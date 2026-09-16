import type { AssetLibraryList, AssetLibraryPublic } from '~~/shared/types/assetLibrary'

let inflight: Promise<void> | null = null

export function useAssetLibraries() {
  const libraries = useState<AssetLibraryPublic[]>('asset-libraries', () => [])
  const loaded = useState('asset-libraries-loaded', () => false)
  const loading = useState('asset-libraries-loading', () => false)

  async function loadLibraries() {
    if (!import.meta.client)
      return

    if (inflight)
      return inflight

    loading.value = true
    inflight = (async () => {
      try {
        const data = await $fetch<AssetLibraryList>('/api/asset-libraries')
        libraries.value = data.items
      }
      catch (error) {
        console.error('[asset-libraries]', error)
      }
      finally {
        loading.value = false
        loaded.value = true
        inflight = null
      }
    })()

    return inflight
  }

  if (import.meta.client && !loaded.value)
    void loadLibraries()

  function upsertLibrary(library: AssetLibraryPublic) {
    const index = libraries.value.findIndex(item => item.id === library.id)
    if (index >= 0) {
      libraries.value = libraries.value.map((item, i) => i === index ? library : item)
      return
    }
    libraries.value = [library, ...libraries.value]
  }

  async function createLibrary(input: { name?: string, description?: string } = {}) {
    const library = await $fetch<AssetLibraryPublic>('/api/asset-libraries', {
      method: 'POST',
      body: input,
    })
    upsertLibrary(library)
    return library
  }

  return {
    libraries,
    loaded,
    loading,
    loadLibraries,
    createLibrary,
    upsertLibrary,
  }
}
