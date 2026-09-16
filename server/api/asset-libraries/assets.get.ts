import type { AssetLibraryAssetSearchList } from '../../../shared/types/assetLibrary'
import { searchLibraryAssets } from '../../utils/assetLibraryAssets'
import { connectDatabase } from '../../utils/sqlite'

export default defineEventHandler(async (event): Promise<AssetLibraryAssetSearchList> => {
  const query = getQuery(event)
  const q = typeof query.q === 'string' ? query.q : ''
  const limit = Number(query.limit)
  await connectDatabase()
  return {
    items: await searchLibraryAssets({ q, limit }),
  }
})
