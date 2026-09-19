import type { CoverStyle, Novel } from '../types/novel'

const COVER_PATH_PATTERN = /^covers\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i

type CoverSelection = { kind: 'default'; cover: CoverStyle } | { kind: 'image'; src: string }

export function hasValidCustomCoverPath(path: string | null | undefined): path is string {
  return typeof path === 'string' && COVER_PATH_PATTERN.test(path)
}

export function selectNovelCover(
  novel: Pick<Novel, 'cover' | 'coverImagePath'>,
  resolvedCustomUri?: string | null,
): CoverSelection {
  if (hasValidCustomCoverPath(novel.coverImagePath) && resolvedCustomUri) {
    return { kind: 'image', src: resolvedCustomUri }
  }
  return { kind: 'default', cover: novel.cover }
}
