export type NovelSelectionState = {
  contextKey: string
  selecting: boolean
  selectedIds: Set<number>
}

function selectingState(contextKey: string, selectedIds: Iterable<number> = []): NovelSelectionState {
  return { contextKey, selecting: true, selectedIds: new Set(selectedIds) }
}

export function startEmptySelection(contextKey: string): NovelSelectionState {
  return selectingState(contextKey)
}

export function startSelectionWith(contextKey: string, id: number, availableIds: Iterable<number>): NovelSelectionState {
  return selectingState(contextKey, new Set(availableIds).has(id) ? [id] : [])
}

export function toggleSelectionId(
  state: NovelSelectionState,
  id: number,
  availableIds: Iterable<number>,
): NovelSelectionState {
  if (!state.selecting || !new Set(availableIds).has(id)) return state
  const selectedIds = new Set(state.selectedIds)
  if (selectedIds.has(id)) selectedIds.delete(id)
  else selectedIds.add(id)
  return { ...state, selectedIds }
}

export function toggleAllSelection(state: NovelSelectionState, availableIds: Iterable<number>): NovelSelectionState {
  if (!state.selecting) return state
  const ids = [...new Set(availableIds)]
  const allSelected = ids.length > 0 && ids.every((id) => state.selectedIds.has(id))
  return { ...state, selectedIds: allSelected ? new Set() : new Set(ids) }
}

export function finishSelection(state: NovelSelectionState): NovelSelectionState {
  return { ...state, selecting: false, selectedIds: new Set() }
}

export function replaceSelectionContext(state: NovelSelectionState, contextKey: string): NovelSelectionState {
  return state.contextKey === contextKey ? state : { contextKey, selecting: false, selectedIds: new Set() }
}

export function reconcileAvailableIds(state: NovelSelectionState, availableIds: Iterable<number>): NovelSelectionState {
  const available = new Set(availableIds)
  const selectedIds = new Set([...state.selectedIds].filter((id) => available.has(id)))
  return selectedIds.size === state.selectedIds.size ? state : { ...state, selectedIds }
}

export function canEditSelection(state: NovelSelectionState): boolean {
  return state.selecting && state.selectedIds.size === 1
}
