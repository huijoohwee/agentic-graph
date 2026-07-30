export type SettingSourceKind = 'store' | 'localStorage' | 'env' | 'backendEnv' | 'eslint'

export type SettingBackingKind =
  | 'zustand'
  | 'localStorage'
  | 'import.meta.env'
  | 'window.__ENV__'
  | 'eslint'
  | 'tailwindcss'

export type SettingType = 'string' | 'number' | 'boolean' | 'json'

export interface SettingMeta {
  key: string
  type: SettingType
  source: SettingSourceKind
  backingImports?: readonly SettingBackingKind[]
  read: () => string | number | boolean | null
  write?: (value: string | number | boolean) => void
  docKey?: string
  default?: () => string | number | boolean | null
  options?: string[]
}

export interface FlowDetails {
  area?: string
  modules?: string[]
  classes?: string[]
  functions?: string[]
  responsibility?: string
  imports?: string[]
  notes?: string
  lineRange?: string
}
