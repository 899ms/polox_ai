import type { AssetLibraryPublic } from '../../shared/types/assetLibrary'
import type { IAssetLibrary } from '../models/assetLibrary'
import {
  ASSET_LIBRARY_DESCRIPTION_MAX,
  ASSET_LIBRARY_NAME_MAX,
  DEFAULT_NEW_ASSET_LIBRARY_NAME,
  nextAssetLibraryTitle,
} from '../../shared/types/assetLibrary'
import { AssetLibrary } from '../models/assetLibrary'
import { AssetLibraryAsset } from '../models/assetLibraryAsset'
import { countLibraryAssets, coverUrlsForLibraries } from './assetLibraryAssets'
import { isDocumentId } from './sqlite'

export function isAssetLibraryId(id: string) {
  return isDocumentId(id)
}

function toIso(value?: Date) {
  return value ? value.toISOString() : ''
}

function clipName(value: unknown) {
  const name = String(value || '').trim().slice(0, ASSET_LIBRARY_NAME_MAX)
  return name || DEFAULT_NEW_ASSET_LIBRARY_NAME
}

function clipDescription(value: unknown) {
  return String(value || '').trim().slice(0, ASSET_LIBRARY_DESCRIPTION_MAX)
}

export function toPublicAssetLibrary(
  library: IAssetLibrary & { _id: string },
  extras?: { assetCount?: number, coverUrl?: string },
): AssetLibraryPublic {
  return {
    id: String(library._id),
    name: library.name,
    description: library.description || '',
    assetCount: extras?.assetCount || 0,
    coverUrl: extras?.coverUrl || '',
    createdAt: toIso(library.createdAt),
    updatedAt: toIso(library.updatedAt),
  }
}

export async function listAssetLibraries() {
  const libraries = await AssetLibrary.find({}).sort({ createdAt: -1 })
  const ids = libraries.map(library => String(library._id))
  const [counts, covers] = await Promise.all([
    countLibraryAssets(ids),
    coverUrlsForLibraries(ids),
  ])
  return libraries.map(library => toPublicAssetLibrary(library, {
    assetCount: counts.get(String(library._id)) || 0,
    coverUrl: covers.get(String(library._id)) || '',
  }))
}

export async function createAssetLibrary(input: { name?: string, description?: string } = {}) {
  const existing = await AssetLibrary.find({}).select('name')
  const names = existing.map((item: { name: string }) => item.name)
  const name = input.name?.trim()
    ? clipName(input.name)
    : nextAssetLibraryTitle(names)
  return await AssetLibrary.create({
    name,
    description: clipDescription(input.description),
  })
}

export async function updateAssetLibrary(
  libraryId: string,
  input: { name?: string, description?: string },
) {
  if (!isAssetLibraryId(libraryId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid asset library',
    })
  }
  const library = await AssetLibrary.findOne({ _id: libraryId })
  if (!library) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Asset library not found',
    })
  }
  if (input.name !== undefined)
    library.name = clipName(input.name)
  if (input.description !== undefined)
    library.description = clipDescription(input.description)
  await library.save()
  return library
}

export async function deleteAssetLibrary(libraryId: string) {
  if (!isAssetLibraryId(libraryId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid asset library',
    })
  }
  const result = await AssetLibrary.deleteOne({ _id: libraryId })
  if (!result.deletedCount) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Asset library not found',
    })
  }
  await AssetLibraryAsset.deleteMany({ libraryId })
  return { ok: true as const }
}
