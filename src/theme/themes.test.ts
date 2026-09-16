import { expect, it } from 'vitest'
import { readStoredTheme, themeIds } from './themes'

it('uses blue-red for an absent or invalid stored theme', () => {
  expect(readStoredTheme(null)).toBe('blue-red')
  expect(readStoredTheme('neon')).toBe('blue-red')
})

it('restores a valid stored theme', () => {
  expect(readStoredTheme('mist-wine')).toBe('mist-wine')
})

it('exposes exactly the four approved themes', () => {
  expect(themeIds).toEqual(['blue-red', 'mono', 'mist-wine', 'charcoal'])
})
