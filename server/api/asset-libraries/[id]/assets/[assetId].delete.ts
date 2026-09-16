import { deleteLibraryAsset } from '../../../../utils/assetLibraryAssets'
import { connectDatabase } from '../../../../utils/sqlite'

export default defineEventHandler(async (event) => {
  const libraryId = String(getRouterParam(event, 'id') || '')
  const assetId = String(getRouterParam(event, 'assetId') || '')
  await connectDatabase()
  return deleteLibraryAsset(libraryId, assetId)
})
