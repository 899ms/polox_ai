import { defineCollection } from '../utils/sqlite'

export interface IAssetLibraryAsset {
  libraryId: string
  name: string
  kind: 'image' | 'video' | 'audio'
  mimeType: string
  url: string
  size: number
  duration: number
  createdAt: Date
  updatedAt: Date
}

export const AssetLibraryAsset = defineCollection<IAssetLibraryAsset>('asset_library_assets', () => ({
  mimeType: '',
  size: 0,
  duration: 0,
}))
