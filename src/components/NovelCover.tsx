import { useEffect, useState } from 'react'
import { resolveCustomCoverUri } from '../api/novels'
import type { Novel } from '../types/novel'
import { CoverArt, type CoverArtSize } from './CoverArt'
import { hasValidCustomCoverPath, selectNovelCover } from './novelCoverSelection'

export function NovelCover({ novel, size }: { novel: Novel; size: CoverArtSize }) {
  const [resolvedCover, setResolvedCover] = useState<{ path: string; uri: string | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    const coverPath = novel.coverImagePath
    if (!hasValidCustomCoverPath(coverPath)) {
      return () => {
        cancelled = true
      }
    }

    void resolveCustomCoverUri(coverPath)
      .then((uri) => {
        if (!cancelled) setResolvedCover({ path: coverPath, uri })
      })
      .catch(() => {
        if (!cancelled) setResolvedCover({ path: coverPath, uri: null })
      })
    return () => {
      cancelled = true
    }
  }, [novel.coverImagePath])

  const customUri = resolvedCover && resolvedCover.path === novel.coverImagePath ? resolvedCover.uri : null
  const selection = selectNovelCover(novel, customUri)
  if (selection.kind === 'image') {
    return <img alt={`${novel.title} 的自定义封面`} className={`novel-custom-cover cover-${size}`} src={selection.src} />
  }
  return <CoverArt cover={selection.cover} size={size} />
}
