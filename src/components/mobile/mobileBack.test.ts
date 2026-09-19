import { describe, expect, it } from 'vitest'
import { resolveMobileBack, type MobileBackState } from './mobileBack'

const base: MobileBackState = {
  aboutOpen: false,
  activeView: 'home',
  detailReturnTo: 'all',
  filterOpen: false,
  filtersAreDefault: true,
  formSource: null,
  moreOpen: false,
  query: '',
  selectedAuthor: null,
  selectionActive: false,
}

describe('resolveMobileBack', () => {
  it('maps every active view to the required return action', () => {
    const cases: Array<[MobileBackState, ReturnType<typeof resolveMobileBack>]> = [
      [{ ...base, activeView: 'home' }, { kind: 'exit-app' }],
      [{ ...base, activeView: 'all' }, { kind: 'exit-app' }],
      [{ ...base, activeView: 'recent' }, { kind: 'reset-library' }],
      [{ ...base, activeView: 'authors' }, { kind: 'exit-app' }],
      [{ ...base, activeView: 'finished' }, { kind: 'reset-library' }],
      [{ ...base, activeView: 'liked' }, { kind: 'reset-library' }],
      [{ ...base, activeView: 'abandoned' }, { kind: 'reset-library' }],
      [{ ...base, activeView: 'stats' }, { kind: 'navigate', view: 'home' }],
      [{ ...base, activeView: 'backup' }, { kind: 'navigate', view: 'profile' }],
      [{ ...base, activeView: 'new', formSource: { kind: 'new', returnView: 'liked' } }, { kind: 'return-form', source: { kind: 'new', returnView: 'liked' } }],
      [{ ...base, activeView: 'edit', formSource: { kind: 'detail' } }, { kind: 'return-form', source: { kind: 'detail' } }],
      [{ ...base, activeView: 'cp-1v1' }, { kind: 'reset-library' }],
      [{ ...base, activeView: 'cp-none' }, { kind: 'reset-library' }],
      [{ ...base, activeView: 'cp-np' }, { kind: 'reset-library' }],
      [{ ...base, activeView: 'profile' }, { kind: 'exit-app' }],
      [{ ...base, activeView: 'detail', detailReturnTo: 'authors' }, { kind: 'return-detail', view: 'authors' }],
    ]

    for (const [state, expected] of cases) expect(resolveMobileBack(state)).toEqual(expected)
  })

  it('honors overlay and selection precedence before detail or search state', () => {
    expect(resolveMobileBack({ ...base, activeView: 'detail', moreOpen: true, selectionActive: true })).toEqual({ kind: 'close-more' })
    expect(resolveMobileBack({ ...base, activeView: 'all', query: 'keyword', selectionActive: true })).toEqual({ kind: 'finish-selection' })
    expect(resolveMobileBack({ ...base, activeView: 'all', filterOpen: true, aboutOpen: true })).toEqual({ kind: 'close-filter' })
    expect(resolveMobileBack({ ...base, activeView: 'all', aboutOpen: true })).toEqual({ kind: 'close-about' })
  })

  it('returns to the exact form origin and clears an open author archive before exiting authors', () => {
    const source = { kind: 'selection-list' as const, returnView: 'authors' as const, selectedAuthor: '甲', query: '词', filtersAreDefault: false }
    expect(resolveMobileBack({ ...base, activeView: 'edit', formSource: source })).toEqual({ kind: 'return-form', source })
    expect(resolveMobileBack({ ...base, activeView: 'authors', selectedAuthor: '甲' })).toEqual({ kind: 'clear-author' })
  })

  it('resets an all-library search or filters before allowing app exit', () => {
    expect(resolveMobileBack({ ...base, activeView: 'all', query: 'keyword' })).toEqual({ kind: 'reset-library' })
    expect(resolveMobileBack({ ...base, activeView: 'all', filtersAreDefault: false })).toEqual({ kind: 'reset-library' })
  })
})
