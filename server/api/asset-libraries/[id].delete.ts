import { ASSET_LIBRARY_DELETE_CONFIRMATION } from '../../../shared/types/assetLibrary'
import { deleteAssetLibrary } from '../../utils/assetLibraries'
import { connectDatabase } from '../../utils/sqlite'

export default defineEventHandler(async (event) => {
  const libraryId = String(getRouterParam(event, 'id') || '')
  const body = await readBody<{ confirmation?: string }>(event)
  if (String(body?.confirmation || '').trim() !== ASSET_LIBRARY_DELETE_CONFIRMATION) {
    throw createError({
      statusCode: 400,
      statusMessage: `Type ${ASSET_LIBRARY_DELETE_CONFIRMATION} to confirm`,
    })
  }
  await connectDatabase()
  return deleteAssetLibrary(libraryId)
})
