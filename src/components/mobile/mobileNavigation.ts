import type { View } from '../../types/novel'

export const mobileMoreViews = [
  { id: 'recent', label: '最近添加' },
  { id: 'finished', label: '看完' },
  { id: 'liked', label: '喜欢' },
  { id: 'abandoned', label: '荒废' },
  { id: 'stats', label: '统计' },
  { id: 'cp-1v1', label: '1v1' },
  { id: 'cp-none', label: '无CP' },
  { id: 'cp-np', label: 'NP' },
] satisfies { id: View; label: string }[]

export const mobileLibraryChips = [
  { id: 'all', label: '全部' },
  { id: 'finished', label: '看完' },
  { id: 'liked', label: '喜欢' },
  { id: 'abandoned', label: '荒废' },
] as const
