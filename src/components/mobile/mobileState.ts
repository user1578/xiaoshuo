import type { DetailReturnView, View } from '../../types/novel'

export function pickNextNovelId<T extends { id: number }>(
  novels: T[],
  previousId: number | null,
  random = Math.random,
) {
  const candidates = novels.length > 1 && previousId !== null
    ? novels.filter((novel) => novel.id !== previousId)
    : novels

  return candidates.length === 0 ? null : candidates[Math.floor(random() * candidates.length)]?.id ?? null
}

export function detailReturnView(view: View): DetailReturnView {
  return view === 'detail' || view === 'edit' || view === 'new' || view === 'profile' ? 'home' : view
}
