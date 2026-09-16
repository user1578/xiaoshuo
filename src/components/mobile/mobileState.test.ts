import { describe, expect, it } from 'vitest'
import { mobileLibraryChips, mobileMoreViews } from './mobileNavigation'
import { MobileNovelDetail } from './MobileNovelDetail'
import { detailReturnView, pickNextNovelId } from './mobileState'

describe('pickNextNovelId', () => {
  it('excludes the previous ID when another novel exists', () => {
    expect(pickNextNovelId([{ id: 1 }, { id: 2 }], 1, () => 0)).toBe(2)
  })

  it('returns the only novel ID when the library has one book', () => {
    expect(pickNextNovelId([{ id: 7 }], 7, () => 0.8)).toBe(7)
  })
})

describe('detailReturnView', () => {
  it('keeps navigable list and home views but rejects detail and edit', () => {
    expect(detailReturnView('authors')).toBe('authors')
    expect(detailReturnView('detail')).toBe('home')
    expect(detailReturnView('edit')).toBe('home')
  })
})

describe('mobileMoreViews', () => {
  it('keeps every low-frequency legacy category reachable', () => {
    expect(mobileMoreViews.map((item) => item.id)).toEqual([
      'recent', 'finished', 'liked', 'abandoned', 'stats', 'cp-1v1', 'cp-none', 'cp-np',
    ])
  })
})

describe('mobileLibraryChips', () => {
  it('keeps the four primary library filters compact', () => {
    expect(mobileLibraryChips.map((item) => item.id)).toEqual(['all', 'finished', 'liked', 'abandoned'])
  })
})

it('provides a dedicated mobile novel detail page component', () => {
  expect(MobileNovelDetail).toBeTypeOf('function')
})
