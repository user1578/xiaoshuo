import { Edit3, Heart, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CoverArt } from '../CoverArt'
import type { Novel } from '../../types/novel'

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div className="mobile-detail-item"><dt>{label}</dt><dd>{value || '未填写'}</dd></div>
}

export function MobileNovelDetail({
  novel,
  onBack,
  onEdit,
  onDelete,
}: {
  novel: Novel
  onBack: () => void
  onEdit: () => void
  onDelete: () => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const deleteNovel = async () => {
    if (!window.confirm(`确认删除《${novel.title}》吗？`)) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '删除失败，请稍后重试')
      setDeleting(false)
    }
  }

  return (
    <div className="mobile-page mobile-detail-page">
      <section className="mobile-detail-hero">
        <CoverArt cover={novel.cover} size="detail" />
        <div><h2>{novel.title}</h2><p>{novel.author}</p><span>{novel.favorite && <Heart size={15} fill="currentColor" />} {novel.status} · {novel.rating}</span></div>
      </section>
      <dl className="mobile-detail-list">
        <DetailItem label="主角" value={novel.characters.map((character) => character.name).join('、')} />
        <DetailItem label="主角属性" value={novel.characters.map((character) => `${character.name} ${character.attribute}`).join(' / ')} />
        <DetailItem label="CP 类别" value={novel.cpCategory} />
        <DetailItem label="结局" value={novel.ending} />
        <DetailItem label="阅读状态" value={novel.status} />
        <DetailItem label="个人评价" value={novel.rating} />
        <DetailItem label="阅读次数" value={`${novel.readCount} 次`} />
        <DetailItem label="添加时间" value={novel.createdAt} />
        <DetailItem label="更新时间" value={novel.updatedAt} />
      </dl>
      <section className="mobile-detail-block"><h3>标签</h3><div className="mobile-tag-row">{novel.tags.length > 0 ? novel.tags.map((tag) => <span key={tag}>#{tag}</span>) : <span>暂无标签</span>}</div></section>
      <section className="mobile-detail-block"><h3>备注</h3><p>{novel.notes || '暂无备注'}</p></section>
      {deleteError && <p className="mobile-action-error" role="alert">{deleteError}</p>}
      <div className="mobile-detail-actions">
        <button className="mobile-primary-action" onClick={onEdit} type="button"><Edit3 size={18} />编辑</button>
        <button className="mobile-danger-action" disabled={deleting} onClick={() => void deleteNovel()} type="button"><Trash2 size={18} />{deleting ? '删除中' : '删除'}</button>
        <button className="mobile-secondary-action" onClick={onBack} type="button">返回</button>
      </div>
    </div>
  )
}
