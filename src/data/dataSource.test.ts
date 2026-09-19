import { describe, expect, it } from 'vitest'
import { resolveDataSource } from './dataSource'

describe('resolveDataSource', () => {
  it('selects mobile before an inherited Supabase environment value', () => {
    expect(resolveDataSource({ isNativePlatform: () => true, viteDataSource: 'supabase' })).toBe('mobile')
  })

  it('selects Supabase only on Web when explicitly configured', () => {
    expect(resolveDataSource({ isNativePlatform: () => false, viteDataSource: 'supabase' })).toBe('supabase')
  })

  it('selects Node local API by default on Web', () => {
    expect(resolveDataSource({ isNativePlatform: () => false, viteDataSource: undefined })).toBe('local')
  })
})
