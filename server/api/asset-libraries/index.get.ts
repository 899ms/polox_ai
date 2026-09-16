import type { AssetLibraryList } from '../../../shared/types/assetLibrary'
import { listAssetLibraries } from '../../utils/assetLibraries'
import { connectDatabase } from '../../utils/sqlite'

export default defineEventHandler(async (_event): Promise<AssetLibraryList> => {
  await connectDatabase()
  return {
    items: await listAssetLibraries(),
  }
})
