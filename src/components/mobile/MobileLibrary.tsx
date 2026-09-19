import { Check, ChevronRight, Edit3, Filter, MoreHorizontal, Plus, Search, Trash2, X } from 'lucide-react'
import { NovelCover } from '../NovelCover'
import { useLongPress } from './longPress'
import { canEditSelection, type NovelSelectionState } from './novelSelection'
import { mobileLibraryChips } from './mobileNavigation'
import type { Novel, View } from '../../types/novel'

export function MobileNovelCard({ novel, selecting, selected, onClick, onToggle, onLongPress }: {
  novel: Novel
  selecting?: boolean
  selected?: boolean
  onClick: () => void
  onToggle?: () => void
  onLongPress?: () => void
}) {
  const longPress = useLongPress(onLongPress ?? (() => undefined))
  return (
    <article className={selected ? 'mobile-novel-card selected' : 'mobile-novel-card'}>
      {selecting && <button aria-label={`选择 ${novel.title}`} className="mobile-select-toggle" onClick={onToggle} type="button">{selected && <Check size={15} />}</button>}
      <button
        className="mobile-novel-card-main"
        onClick={onClick}
        onClickCapture={longPress.onClickCapture}
        onPointerCancel={longPress.onPointerCancel}
        onPointerDown={longPress.onPointerDown}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={longPress.onPointerUp}
        type="button"
      >
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
  selection,
  onQueryChange,
  onNavigate,
  onOpenNovel,
  onOpenFilter,
  onOpenMore,
  onNew,
  onStartSelection,
  onStartSelectionWith,
  onToggleSelection,
  onToggleAll,
  onFinishSelection,
  onEditSelection,
  onDeleteSelection,
}: {
  activeView: View
  novels: Novel[]
  query: string
  selection: NovelSelectionState
  onQueryChange: (value: string) => void
  onNavigate: (view: View) => void
  onOpenNovel: (novel: Novel) => void
  onOpenFilter: () => void
  onOpenMore: () => void
  onNew: () => void
  onStartSelection: () => void
  onStartSelectionWith: (id: number) => void
  onToggleSelection: (id: number) => void
  onToggleAll: () => void
  onFinishSelection: () => void
  onEditSelection: () => void
  onDeleteSelection: () => Promise<void>
}) {
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
  const selectedCount = selection.selectedIds.size
  const allSelected = novels.length > 0 && novels.every((novel) => selection.selectedIds.has(novel.id))

  const deleteSelected = async () => {
    if (selectedCount === 0 || !window.confirm(`确定删除已选择的 ${selectedCount} 本小说吗？`)) return
    await onDeleteSelection()
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
        {novels.map((novel) => (
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
        {novels.length === 0 && <div className="mobile-inline-empty">没有符合当前搜索或筛选条件的小说。</div>}
      </div>
      <button aria-label="新增小说" className="mobile-fab" onClick={onNew} type="button"><Plus size={23} /></button>
    </div>
  )
}
