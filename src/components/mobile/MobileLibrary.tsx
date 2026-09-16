import { Check, ChevronRight, Filter, MoreHorizontal, Plus, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { NovelCover } from '../NovelCover'
import { mobileLibraryChips } from './mobileNavigation'
import type { Novel, View } from '../../types/novel'

export function MobileNovelCard({ novel, selecting, selected, onClick, onToggle }: {
  novel: Novel
  selecting?: boolean
  selected?: boolean
  onClick: () => void
  onToggle?: () => void
}) {
  return (
    <article className={selected ? 'mobile-novel-card selected' : 'mobile-novel-card'}>
      {selecting && <button aria-label={`选择 ${novel.title}`} className="mobile-select-toggle" onClick={onToggle} type="button">{selected && <Check size={15} />}</button>}
      <button className="mobile-novel-card-main" onClick={onClick} type="button">
        <NovelCover novel={novel} size="wall" />
        <span>
          <strong>{novel.title}</strong>
          <em>{novel.author}</em>
          <span className="mobile-tag-row">{novel.tags.slice(0, 3).map((tag) => <i key={tag}>#{tag}</i>)}</span>
          <small>{novel.status} · {novel.rating}</small>
        </span>
        <ChevronRight size={18} />
      </button>
    </article>
  )
}

export function MobileLibrary({
  activeView,
  novels,
  query,
  onQueryChange,
  onNavigate,
  onOpenNovel,
  onOpenFilter,
  onOpenMore,
  onNew,
  onBulkDelete,
}: {
  activeView: View
  novels: Novel[]
  query: string
  onQueryChange: (value: string) => void
  onNavigate: (view: View) => void
  onOpenNovel: (novel: Novel) => void
  onOpenFilter: () => void
  onOpenMore: () => void
  onNew: () => void
  onBulkDelete: (ids: number[]) => Promise<void>
}) {
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const libraryTitle = activeView === 'all'
    ? '我的书库'
    : activeView === 'recent'
      ? '最近添加'
      : activeView === 'finished'
        ? '看完'
        : activeView === 'liked'
          ? '喜欢'
          : activeView === 'abandoned'
            ? '弃文'
            : '全部小说'

  const toggleSelected = (id: number) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id])
  const closeSelection = () => {
    setSelecting(false)
    setSelectedIds([])
    setDeleteError(null)
  }

  const deleteSelected = async () => {
    if (selectedIds.length === 0 || !window.confirm(`确认删除选中的 ${selectedIds.length} 本小说吗？`)) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onBulkDelete(selectedIds)
      closeSelection()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '批量删除失败，请稍后重试')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mobile-page mobile-library-page">
      <div className="mobile-library-title-row">
        <div><p>共 {novels.length} 本</p><h2>{libraryTitle}</h2></div>
        <button aria-label="更多书库操作" className="mobile-icon-button" onClick={onOpenMore} type="button"><MoreHorizontal size={21} /></button>
      </div>
      <label className="mobile-search-field">
        <Search size={18} />
        <input onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索书名、作者或标签" value={query} />
        <button aria-label="打开筛选" onClick={onOpenFilter} type="button"><Filter size={18} /></button>
      </label>
      <div className="mobile-library-chips" aria-label="书库分类">
        {mobileLibraryChips.map((chip) => <button className={activeView === chip.id ? 'active' : ''} key={chip.id} onClick={() => onNavigate(chip.id)} type="button">{chip.label}</button>)}
      </div>
      <div className="mobile-library-actions">
        {selecting ? (
          <>
            <span>已选 {selectedIds.length} 本</span>
            <button className="mobile-text-button danger" disabled={selectedIds.length === 0 || deleting} onClick={deleteSelected} type="button"><Trash2 size={15} />{deleting ? '删除中' : '删除'}</button>
            <button aria-label="退出批量管理" className="mobile-icon-button" onClick={closeSelection} type="button"><X size={18} /></button>
          </>
        ) : <button className="mobile-text-button" onClick={() => setSelecting(true)} type="button">批量管理</button>}
      </div>
      {deleteError && <p className="mobile-action-error" role="alert">{deleteError}</p>}
      <div className="mobile-novel-list">
        {novels.map((novel) => (
          <MobileNovelCard
            key={novel.id}
            novel={novel}
            onClick={() => selecting ? toggleSelected(novel.id) : onOpenNovel(novel)}
            onToggle={() => toggleSelected(novel.id)}
            selected={selectedIds.includes(novel.id)}
            selecting={selecting}
          />
        ))}
        {novels.length === 0 && <div className="mobile-inline-empty">没有符合当前搜索或筛选条件的小说。</div>}
      </div>
      <button aria-label="新增小说" className="mobile-fab" onClick={onNew} type="button"><Plus size={23} /></button>
    </div>
  )
}
