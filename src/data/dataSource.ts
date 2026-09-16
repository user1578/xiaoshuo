import { Capacitor } from '@capacitor/core'

export type DataSource = 'mobile' | 'supabase' | 'local'

type ResolveOptions = {
  isNativePlatform?: () => boolean
  viteDataSource?: string | undefined
}

export function resolveDataSource(options: ResolveOptions = {}): DataSource {
  const isNativePlatform = options.isNativePlatform ?? (() => Capacitor.isNativePlatform())
  const viteDataSource = options.viteDataSource ?? import.meta.env.VITE_DATA_SOURCE

  if (isNativePlatform()) return 'mobile'
  return viteDataSource === 'supabase' ? 'supabase' : 'local'
}

export function isMobileDataSource(): boolean {
  return resolveDataSource() === 'mobile'
}

export function isSupabaseDataSource(): boolean {
  return resolveDataSource() === 'supabase'
}
