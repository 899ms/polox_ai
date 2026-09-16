import { createAssetLibrary, toPublicAssetLibrary } from '../../utils/assetLibraries'
import { connectDatabase } from '../../utils/sqlite'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ name?: string, description?: string }>(event)
  await connectDatabase()
  const library = await createAssetLibrary({
    name: body?.name,
    description: body?.description,
  })
  return toPublicAssetLibrary(library)
})
