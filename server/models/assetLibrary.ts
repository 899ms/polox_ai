import { defineCollection } from '../utils/sqlite'

export interface IAssetLibrary {
  name: string
  description: string
  createdAt: Date
  updatedAt: Date
}

export const AssetLibrary = defineCollection<IAssetLibrary>('asset_libraries', () => ({
  description: '',
}))
