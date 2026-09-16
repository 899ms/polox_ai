import { toPublicAssetLibrary, updateAssetLibrary } from '../../utils/assetLibraries'
import { countLibraryAssets, coverUrlsForLibraries } from '../../utils/assetLibraryAssets'
import { connectDatabase } from '../../utils/sqlite'

export default defineEventHandler(async (event) => {
  const libraryId = String(getRouterParam(event, 'id') || '')
  const body = await readBody<{ name?: string, description?: string }>(event)
  await connectDatabase()
  const library = await updateAssetLibrary(libraryId, {
    name: body?.name,
    description: body?.description,
  })
  const id = String(library._id)
  const [counts, covers] = await Promise.all([
    countLibraryAssets([id]),
    coverUrlsForLibraries([id]),
  ])
  return toPublicAssetLibrary(library, {
    assetCount: counts.get(id) || 0,
    coverUrl: covers.get(id) || '',
  })
})
