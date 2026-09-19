import { ChevronLeft, ChevronRight, Edit3, Heart, Search, Trash2, X } from 'lucide-react'
import { NovelCover } from '../NovelCover'
import { canEditSelection, type NovelSelectionState } from './novelSelection'
import { MobileNovelCard } from './MobileLibrary'
import type { Novel } from '../../types/novel'

export type AuthorArchiveItem = { author: string; works: Novel[]; liked: number; finished: number }

export function MobileAuthors({
  authors,
  selectedAuthor,
  query,
  selection,
  onQueryChange,
  onSelectAuthor,
  onClearAuthor,
  onOpenNovel,
  onStartSelection,
  onStartSelectionWith,
  onToggleSelection,
  onToggleAll,
  onFinishSelection,
  onEditSelection,
  onDeleteSelection,
}: {
  authors: AuthorArchiveItem[]
  selectedAuthor: { author: string; works: Novel[] } | null
  query: string
  selection: NovelSelectionState
  onQueryChange: (value: string) => void
  onSelectAuthor: (author: { author: string; works: Novel[] }) => void
  onClearAuthor: () => void
  onOpenNovel: (novel: Novel) => void
  onStartSelection: () => void
  onStartSelectionWith: (id: number) => void
  onToggleSelection: (id: number) => void
  onToggleAll: () => void
  onFinishSelection: () => void
  onEditSelection: () => void
  onDeleteSelection: () => Promise<void>
}) {
  if (selectedAuthor) {
    const selectedCount = selection.selectedIds.size
    const allSelected = selectedAuthor.works.length > 0 && selectedAuthor.works.every((novel) => selection.selectedIds.has(novel.id))
    const deleteSelected = async () => {
      if (selectedCount === 0 || !window.confirm(`确定删除已选择的 ${selectedCount} 本小说吗？`)) return
      await onDeleteSelection()
    }
    return (
      <div className="mobile-page mobile-author-works">
        <button className="mobile-back-row" onClick={onClearAuthor} type="button"><ChevronLeft size={18} />返回作者档案</button>
        <div className="mobile-library-title-row"><div><p>{selectedAuthor.works.length} 本作品</p><h2>{selectedAuthor.author}</h2></div></div>
        <div className="mobile-library-actions">
          {selection.selecting ? (
            <>
              <span>已选择 {selectedCount} 本</span>
              <button className="mobile-text-button" onClick={onToggleAll} type="button">{allSelected ? '取消全选' : '全选'}</button>
              {canEditSelection(selection) && <button className="mobile-text-button" onClick={onEditSelection} type="button"><Edit3 size={15} />编辑</button>}
              <button className="mobile-text-button danger" disabled={selectedCount === 0} onClick={() => void deleteSelected()} type="button"><Trash2 size={15} />删除</button>
              <button aria-label="完成选择" className="mobile-icon-button" onClick={onFinishSelection} type="button"><X size={18} /></button>
            </>
          ) : <button className="mobile-text-button" onClick={onStartSelection} type="button">选择</button>}
        </div>
        <div className="mobile-novel-list">
          {selectedAuthor.works.map((novel) => (
            <MobileNovelCard
              key={novel.id}
              novel={novel}
              onClick={() => selection.selecting ? onToggleSelection(novel.id) : onOpenNovel(novel)}
              onLongPress={() => onStartSelectionWith(novel.id)}
              onToggle={() => onToggleSelection(novel.id)}
              selected={selection.selectedIds.has(novel.id)}
              selecting={selection.selecting}
            />
          ))}
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
              {item.works.slice(0, 3).map((novel) => <NovelCover key={novel.id} novel={novel} size="thumb" />)}
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
        {matchingAuthors.length === 0 && <div className="mobile-inline-empty">没有找到匹配的作者。</div>}
      </div>
    </div>
  )
}
