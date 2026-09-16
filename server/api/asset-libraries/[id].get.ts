import { toPublicAssetLibrary } from '../../utils/assetLibraries'
import { countLibraryAssets, coverUrlsForLibraries, requireAssetLibrary } from '../../utils/assetLibraryAssets'
import { connectDatabase } from '../../utils/sqlite'

export default defineEventHandler(async (event) => {
  const libraryId = String(getRouterParam(event, 'id') || '')
  await connectDatabase()
  const library = await requireAssetLibrary(libraryId)
  const [counts, covers] = await Promise.all([
    countLibraryAssets([libraryId]),
    coverUrlsForLibraries([libraryId]),
  ])
  return toPublicAssetLibrary(library, {
    assetCount: counts.get(libraryId) || 0,
    coverUrl: covers.get(libraryId) || '',
  })
})
