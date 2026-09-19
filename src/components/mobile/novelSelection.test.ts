import { describe, expect, it } from 'vitest'
import {
  canEditSelection,
  finishSelection,
  reconcileAvailableIds,
  replaceSelectionContext,
  startEmptySelection,
  startSelectionWith,
  toggleAllSelection,
  toggleSelectionId,
} from './novelSelection'

describe('mobile novel selection state', () => {
  it('starts empty or with an available novel and only toggles available ids', () => {
    const empty = startEmptySelection('library:all')
    const selected = startSelectionWith('library:all', 12, [12, 13])

    expect(empty).toEqual({ contextKey: 'library:all', selecting: true, selectedIds: new Set() })
    expect(selected.selectedIds).toEqual(new Set([12]))
    expect(toggleSelectionId(selected, 99, [12, 13])).toEqual(selected)
    expect(toggleSelectionId(selected, 13, [12, 13]).selectedIds).toEqual(new Set([12, 13]))
  })

  it('selects only the current results and toggles all back off', () => {
    const state = startSelectionWith('library:liked', 4, [4, 7, 9])
    const all = toggleAllSelection(state, [4, 7, 9])

    expect(all.selectedIds).toEqual(new Set([4, 7, 9]))
    expect(toggleAllSelection(all, [4, 7, 9]).selectedIds).toEqual(new Set())
  })

  it('clears selection on a context change but preserves it when available records refresh', () => {
    const selected = startSelectionWith('author:甲', 1, [1, 2, 3])
    const twoSelected = toggleSelectionId(selected, 2, [1, 2, 3])

    expect(replaceSelectionContext(twoSelected, 'author:乙')).toEqual({
      contextKey: 'author:乙',
      selecting: false,
      selectedIds: new Set(),
    })
    expect(reconcileAvailableIds(twoSelected, [2, 3])).toEqual({
      contextKey: 'author:甲',
      selecting: true,
      selectedIds: new Set([2]),
    })
  })

  it('finishes by clearing ids and permits edit exactly for one selected novel', () => {
    const single = startSelectionWith('library:all', 3, [3])

    expect(canEditSelection(single)).toBe(true)
    expect(canEditSelection(toggleSelectionId(single, 3, [3]))).toBe(false)
    expect(finishSelection(single)).toEqual({ contextKey: 'library:all', selecting: false, selectedIds: new Set() })
  })
})
