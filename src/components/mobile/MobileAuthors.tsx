import { ChevronLeft, ChevronRight, Heart, Search } from 'lucide-react'
import { CoverArt } from '../CoverArt'
import { MobileNovelCard } from './MobileLibrary'
import type { Novel } from '../../types/novel'

export type AuthorArchiveItem = { author: string; works: Novel[]; liked: number; finished: number }

export function MobileAuthors({
  authors,
  selectedAuthor,
  query,
  onQueryChange,
  onSelectAuthor,
  onClearAuthor,
  onOpenNovel,
}: {
  authors: AuthorArchiveItem[]
  selectedAuthor: { author: string; works: Novel[] } | null
  query: string
  onQueryChange: (value: string) => void
  onSelectAuthor: (author: { author: string; works: Novel[] }) => void
  onClearAuthor: () => void
  onOpenNovel: (novel: Novel) => void
}) {
  if (selectedAuthor) {
    return (
      <div className="mobile-page mobile-author-works">
        <button className="mobile-back-row" onClick={onClearAuthor} type="button"><ChevronLeft size={18} />返回作者档案</button>
        <div className="mobile-library-title-row"><div><p>{selectedAuthor.works.length} 本作品</p><h2>{selectedAuthor.author}</h2></div></div>
        <div className="mobile-novel-list">
          {selectedAuthor.works.map((novel) => <MobileNovelCard key={novel.id} novel={novel} onClick={() => onOpenNovel(novel)} />)}
        </div>
      </div>
    )
  }

  const normalizedQuery = query.trim().toLowerCase()
  const matchingAuthors = normalizedQuery.length === 0 ? authors : authors.filter((item) => item.author.toLowerCase().includes(normalizedQuery))

  return (
    <div className="mobile-page mobile-authors-page">
      <label className="mobile-search-field">
        <Search size={18} />
        <input onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索作者" value={query} />
      </label>
      <p className="mobile-page-intro">按作品数量排序，点进作者即可查看全部作品。</p>
      <div className="mobile-author-list">
        {matchingAuthors.map((item) => (
          <button className="mobile-author-card" key={item.author} onClick={() => onSelectAuthor({ author: item.author, works: item.works })} type="button">
            <span className="mobile-author-copy">
              <strong>{item.author}</strong>
              <em>{item.works.length} 本作品 · {item.finished} 本看完</em>
              {item.liked > 0 && <small><Heart size={13} fill="currentColor" /> 喜欢 {item.liked} 本</small>}
            </span>
            <span className="mobile-author-covers" aria-hidden="true">
              {item.works.slice(0, 3).map((novel) => <CoverArt cover={novel.cover} key={novel.id} size="thumb" />)}
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
        {matchingAuthors.length === 0 && <div className="mobile-inline-empty">没有找到匹配的作者。</div>}
      </div>
    </div>
  )
}
