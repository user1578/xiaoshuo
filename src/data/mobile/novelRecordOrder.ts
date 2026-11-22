import type { Novel } from '../../types/novel'

export function sortNovelsByRecordOrder(novels: Novel[]): Novel[] {
  return [...novels].sort((first, second) => second.id - first.id)
}
