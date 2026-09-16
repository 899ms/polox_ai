import { createLibraryAsset, toPublicAssetLibraryAsset } from '../../../utils/assetLibraryAssets'
import { connectDatabase } from '../../../utils/sqlite'

export default defineEventHandler(async (event) => {
  const libraryId = String(getRouterParam(event, 'id') || '')
  const body = await readBody<{
    url?: string
    name?: string
    mimeType?: string
    size?: number
    duration?: number
    kind?: 'image' | 'video' | 'audio'
  }>(event)
  await connectDatabase()
  const asset = await createLibraryAsset(libraryId, {
    url: body?.url || '',
    name: body?.name,
    mimeType: body?.mimeType,
    size: body?.size,
    duration: body?.duration,
    kind: body?.kind,
  })
  return toPublicAssetLibraryAsset(asset)
})
