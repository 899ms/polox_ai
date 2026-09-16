import { toPublicAssetLibraryAsset, updateLibraryAsset } from '../../../../utils/assetLibraryAssets'
import { connectDatabase } from '../../../../utils/sqlite'

export default defineEventHandler(async (event) => {
  const libraryId = String(getRouterParam(event, 'id') || '')
  const assetId = String(getRouterParam(event, 'assetId') || '')
  const body = await readBody<{ name?: string }>(event)
  await connectDatabase()
  const asset = await updateLibraryAsset(libraryId, assetId, {
    name: body?.name,
  })
  return toPublicAssetLibraryAsset(asset)
})
