export const DEFAULT_NEW_ASSET_LIBRARY_NAME = 'Untitled'
export const SAMPLE_BRAND_KIT_NAME = 'Sample Brand Kit'
export const ASSET_LIBRARY_NAME_MAX = 60
export const ASSET_LIBRARY_DESCRIPTION_MAX = 280
export const ASSET_LIBRARY_DELETE_CONFIRMATION = 'DELETE'

/** Same media families the project canvas can show / accept via upload. */
export const ASSET_LIBRARY_ACCEPT = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  'image/x-ms-bmp',
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/aac',
  'audio/ogg',
  'audio/mp4',
] as const

export const ASSET_LIBRARY_ACCEPT_ATTR = ASSET_LIBRARY_ACCEPT.join(',')

export const ASSET_LIBRARY_EXTENSION_RE = /\.(jpe?g|png|webp|gif|avif|bmp|mp4|mov|mkv|mp3|wav|aac|ogg|m4a)$/i

export type AssetLibraryMediaKind = 'image' | 'video' | 'audio'

export function nextAssetLibraryTitle(existingNames: string[]) {
  const names = new Set(existingNames.map(name => name.trim()).filter(Boolean))
  if (!names.has(DEFAULT_NEW_ASSET_LIBRARY_NAME))
    return DEFAULT_NEW_ASSET_LIBRARY_NAME

  let index = 2
  while (names.has(`${DEFAULT_NEW_ASSET_LIBRARY_NAME} ${index}`))
    index += 1
  return `${DEFAULT_NEW_ASSET_LIBRARY_NAME} ${index}`
}

export function assetLibraryMediaKind(mimeType: string, fileName = ''): AssetLibraryMediaKind | null {
  const type = String(mimeType || '').toLowerCase()
  const name = String(fileName || '').toLowerCase()
  if (type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|bmp)$/.test(name))
    return 'image'
  if (type.startsWith('video/') || /\.(mp4|mov|mkv)$/.test(name))
    return 'video'
  if (type.startsWith('audio/') || /\.(mp3|wav|aac|ogg|m4a)$/.test(name))
    return 'audio'
  return null
}

export function isAssetLibraryAcceptFile(file: { type?: string, name?: string }) {
  const type = String(file.type || '')
  if ((ASSET_LIBRARY_ACCEPT as readonly string[]).includes(type))
    return true
  return ASSET_LIBRARY_EXTENSION_RE.test(String(file.name || ''))
}

export interface AssetLibraryPublic {
  id: string
  name: string
  description: string
  assetCount: number
  coverUrl: string
  createdAt: string
  updatedAt: string
}

export interface AssetLibraryList {
  items: AssetLibraryPublic[]
}

export interface AssetLibraryAssetPublic {
  id: string
  libraryId: string
  name: string
  kind: AssetLibraryMediaKind
  mimeType: string
  url: string
  size: number
  duration?: number
  createdAt: string
  updatedAt: string
}

export interface AssetLibraryAssetList {
  items: AssetLibraryAssetPublic[]
}

export interface AssetLibraryAssetSearchItem extends AssetLibraryAssetPublic {
  libraryName: string
}

export interface AssetLibraryAssetSearchList {
  items: AssetLibraryAssetSearchItem[]
}

