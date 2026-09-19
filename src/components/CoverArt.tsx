import { BookOpen } from 'lucide-react'
import type { CoverStyle } from '../types/novel'

export type CoverArtSize = 'feature' | 'wall' | 'detail' | 'thumb'

export function CoverArt({ cover, size }: { cover: CoverStyle; size: CoverArtSize }) {
  return (
    <div className={`cover-art cover-${cover} cover-${size}`} aria-hidden="true">
      <span className="shape moon" />
      <span className="shape apple" />
      <span className="shape cat-face" />
      <span className="shape book-block" />
      <span className="shape flower" />
      <span className="shape cloud" />
      <span className="shape portrait-head" />
      <span className="shape line-one" />
      <span className="shape line-two" />
      <BookOpen size={size === 'wall' ? 22 : size === 'thumb' ? 16 : 30} />
    </div>
  )
}
