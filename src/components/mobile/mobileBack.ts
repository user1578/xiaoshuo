import type { DetailReturnView, View } from '../../types/novel'

export type MobileFormSource =
  | {
      kind: 'selection-list'
      returnView: View
      selectedAuthor: string | null
      query: string
      filtersAreDefault: boolean
    }
  | { kind: 'detail' }
  | { kind: 'new'; returnView: View }

export type MobileBackState = {
  activeView: View
  moreOpen: boolean
  filterOpen: boolean
  aboutOpen: boolean
  selectionActive: boolean
  formSource: MobileFormSource | null
  detailReturnTo: DetailReturnView
  selectedAuthor: string | null
  query: string
  filtersAreDefault: boolean
}

export type MobileBackAction =
  | { kind: 'close-more' }
  | { kind: 'close-filter' }
  | { kind: 'close-about' }
  | { kind: 'finish-selection' }
  | { kind: 'return-form'; source: MobileFormSource }
  | { kind: 'return-detail'; view: DetailReturnView }
  | { kind: 'clear-author' }
  | { kind: 'navigate'; view: View }
  | { kind: 'reset-library' }
  | { kind: 'exit-app' }

const libraryChildren = new Set<View>(['recent', 'finished', 'liked', 'abandoned', 'cp-1v1', 'cp-none', 'cp-np'])

export function resolveMobileBack(state: MobileBackState): MobileBackAction {
  if (state.moreOpen) return { kind: 'close-more' }
  if (state.filterOpen) return { kind: 'close-filter' }
  if (state.aboutOpen) return { kind: 'close-about' }
  if (state.selectionActive) return { kind: 'finish-selection' }

  if ((state.activeView === 'new' || state.activeView === 'edit') && state.formSource) {
    return { kind: 'return-form', source: state.formSource }
  }
  if (state.activeView === 'detail') return { kind: 'return-detail', view: state.detailReturnTo }
  if (state.activeView === 'authors' && state.selectedAuthor) return { kind: 'clear-author' }
  if (state.activeView === 'backup') return { kind: 'navigate', view: 'profile' }
  if (state.activeView === 'stats') return { kind: 'navigate', view: 'home' }
  if (libraryChildren.has(state.activeView)) return { kind: 'reset-library' }
  if (state.activeView === 'all' && (state.query.trim() || !state.filtersAreDefault)) return { kind: 'reset-library' }
  if (state.activeView === 'new' || state.activeView === 'edit') return { kind: 'navigate', view: 'all' }
  return { kind: 'exit-app' }
}
