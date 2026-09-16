import type { AssetLibraryAssetList } from '../../../../../shared/types/assetLibrary'
import { listLibraryAssets } from '../../../utils/assetLibraryAssets'
import { connectDatabase } from '../../../utils/sqlite'

export default defineEventHandler(async (event): Promise<AssetLibraryAssetList> => {
  const libraryId = String(getRouterParam(event, 'id') || '')
  await connectDatabase()
  return {
    items: await listLibraryAssets(libraryId),
  }
})
