import type { AssetLibraryAssetPublic, AssetLibraryAssetSearchItem, AssetLibraryMediaKind } from '../../shared/types/assetLibrary'
import type { IAssetLibraryAsset } from '../models/assetLibraryAsset'
import { assetLibraryMediaKind } from '../../shared/types/assetLibrary'
import { AssetLibrary } from '../models/assetLibrary'
import { AssetLibraryAsset } from '../models/assetLibraryAsset'
import { isDocumentId } from './sqlite'

function toIso(value?: Date) {
  return value ? value.toISOString() : ''
}

export function toPublicAssetLibraryAsset(
  asset: IAssetLibraryAsset & { _id: string },
): AssetLibraryAssetPublic {
  return {
    id: String(asset._id),
    libraryId: asset.libraryId,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType || '',
    url: asset.url,
    size: asset.size || 0,
    duration: asset.duration || undefined,
    createdAt: toIso(asset.createdAt),
    updatedAt: toIso(asset.updatedAt),
  }
}

export async function requireAssetLibrary(libraryId: string) {
  if (!isDocumentId(libraryId)) {
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
  return library
}

export async function listLibraryAssets(libraryId: string) {
  await requireAssetLibrary(libraryId)
  const assets = await AssetLibraryAsset.find({ libraryId }).sort({ createdAt: -1 })
  return assets.map(asset => toPublicAssetLibraryAsset(asset))
}

export async function countLibraryAssets(libraryIds: string[]) {
  const counts = new Map<string, number>()
  if (!libraryIds.length)
    return counts
  const assets = await AssetLibraryAsset.find({ libraryId: { $in: libraryIds } }).select('libraryId')
  for (const asset of assets) {
    const id = String(asset.libraryId || '')
    if (!id)
      continue
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  return counts
}

export async function coverUrlsForLibraries(libraryIds: string[]) {
  const coverById = new Map<string, string>()
  if (!libraryIds.length)
    return coverById
  const assets = await AssetLibraryAsset.find({
    libraryId: { $in: libraryIds },
    kind: 'image',
  }).sort({ createdAt: -1 }).select('libraryId url')
  for (const asset of assets) {
    if (!coverById.has(asset.libraryId) && asset.url)
      coverById.set(asset.libraryId, asset.url)
  }
  return coverById
}

export async function createLibraryAsset(libraryId: string, input: {
  url: string
  name?: string
  mimeType?: string
  size?: number
  duration?: number
  kind?: AssetLibraryMediaKind
}) {
  await requireAssetLibrary(libraryId)
  const url = String(input.url || '').trim()
  if (!/^https?:\/\//i.test(url)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A valid media URL is required',
    })
  }
  const name = String(input.name || url.split('/').pop() || 'Untitled').trim().slice(0, 120) || 'Untitled'
  const mimeType = String(input.mimeType || '').trim()
  const kind = input.kind || assetLibraryMediaKind(mimeType, name)
  if (!kind) {
    throw createError({
      statusCode: 400,
      statusMessage: 'This file type is not supported',
    })
  }
  return await AssetLibraryAsset.create({
    libraryId,
    name,
    kind,
    mimeType,
    url: url.slice(0, 2000),
    size: Math.max(0, Math.floor(Number(input.size) || 0)),
    duration: Math.max(0, Math.floor(Number(input.duration) || 0)),
  })
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function searchLibraryAssets(
  options: { q?: string, limit?: number } = {},
): Promise<AssetLibraryAssetSearchItem[]> {
  const limit = Math.min(200, Math.max(1, Math.floor(Number(options.limit) || 100)))
  const q = String(options.q || '').trim().toLowerCase()
  let assets = await AssetLibraryAsset.find({}).sort({ createdAt: -1 })
  if (q)
    assets = assets.filter((asset: { name?: string }) => String(asset.name || '').toLowerCase().includes(q))
  assets = assets.slice(0, limit)

  const libraryIds = [...new Set(assets.map((asset: { libraryId: string }) => asset.libraryId).filter(Boolean))]
  const libraries = libraryIds.length
    ? await AssetLibrary.find({ _id: { $in: libraryIds } }).select('name')
    : []
  const libraryNameById = new Map(libraries.map((library: { _id: string, name: string }) => [String(library._id), String(library.name || 'Library')]))

  return assets.map((asset: IAssetLibraryAsset & { _id: string }) => ({
    ...toPublicAssetLibraryAsset(asset),
    libraryName: libraryNameById.get(asset.libraryId) || 'Library',
  }))
}

export async function updateLibraryAsset(libraryId: string, assetId: string, input: { name?: string }) {
  await requireAssetLibrary(libraryId)
  if (!isDocumentId(assetId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid asset',
    })
  }
  const asset = await AssetLibraryAsset.findOne({ _id: assetId, libraryId })
  if (!asset) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Asset not found',
    })
  }
  if (input.name !== undefined) {
    const name = String(input.name || '').trim().slice(0, 120)
    if (!name) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Name is required',
      })
    }
    asset.name = name
  }
  await asset.save()
  return asset
}

export async function deleteLibraryAsset(libraryId: string, assetId: string) {
  await requireAssetLibrary(libraryId)
  if (!isDocumentId(assetId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid asset',
    })
  }
  const result = await AssetLibraryAsset.deleteOne({ _id: assetId, libraryId })
  if (!result.deletedCount) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Asset not found',
    })
  }
  return { ok: true as const }
}
