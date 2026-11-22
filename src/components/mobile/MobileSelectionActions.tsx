import { useState } from 'react'
import { Edit3, Trash2, X } from 'lucide-react'
import type { Novel } from '../../types/novel'
import { canEditSelection, type NovelSelectionState } from './novelSelection'

export type MobileSelectionActionsProps = {
  selection: NovelSelectionState
  onToggleAll: () => void
  onFinishSelection: () => void
  onEditSelection: () => void
  onDeleteSelection: () => Promise<void>
}

export function MobileSelectionActions({
  novels, selection, onToggleAll, onFinishSelection, onEditSelection, onDeleteSelection,
}: MobileSelectionActionsProps & { novels: Novel[] }) {
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const selectedCount = selection.selectedIds.size
  const allSelected = novels.length > 0 && novels.every((novel) => selection.selectedIds.has(novel.id))

  const deleteSelected = async () => {
    if (deleting || selectedCount === 0 || !window.confirm(`确定删除已选择的 ${selectedCount} 本小说吗？`)) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDeleteSelection()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '删除失败，请重试')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <span aria-live="polite">已选择 {selectedCount} 本</span>
      <button className="mobile-text-button" disabled={deleting} onClick={onToggleAll} type="button">{allSelected ? '取消全选' : '全选'}</button>
      {canEditSelection(selection) && <button className="mobile-text-button" disabled={deleting} onClick={onEditSelection} type="button"><Edit3 size={15} />编辑</button>}
      <button className="mobile-text-button danger" disabled={deleting || selectedCount === 0} onClick={() => void deleteSelected()} type="button"><Trash2 size={15} />删除</button>
      <button aria-label="完成选择" className="mobile-icon-button" onClick={onFinishSelection} type="button"><X size={18} /></button>
      {deleteError && <p className="mobile-action-error" role="alert">{deleteError}</p>}
    </>
  )
}
