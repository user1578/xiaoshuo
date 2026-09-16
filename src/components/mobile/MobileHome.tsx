import { ChevronRight, Plus, Search, Shuffle } from 'lucide-react'
import { CoverArt } from '../CoverArt'
import type { Novel } from '../../types/novel'

type Stats = { total: number; finished: number; liked: number; abandoned: number }

export function MobileHome({
  stats,
  query,
  randomNovel,
  recentNovels,
  onQueryChange,
  onRefreshRandom,
  onOpenNovel,
  onOpenLibrary,
  onNew,
}: {
  stats: Stats
  query: string
  randomNovel: Novel | null
  recentNovels: Novel[]
  onQueryChange: (value: string) => void
  onRefreshRandom: () => void
  onOpenNovel: (novel: Novel) => void
  onOpenLibrary: () => void
  onNew: () => void
}) {
  const statItems = [
    { label: '总数', value: stats.total },
    { label: '看完', value: stats.finished },
    { label: '喜欢', value: stats.liked },
    { label: '荒废', value: stats.abandoned },
  ]

  return (
    <div className="mobile-page mobile-home">
      <label className="mobile-search-field">
        <Search size={18} />
        <input onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索书名、作者或标签" value={query} />
      </label>

      <section className="mobile-stat-grid" aria-label="书库统计">
        {statItems.map((item) => (
          <article key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </section>

      <section className="mobile-random-section" aria-labelledby="mobile-random-title">
        <div className="mobile-section-heading">
          <div>
            <p>今天读哪一本？</p>
            <h2 id="mobile-random-title">随机一本</h2>
          </div>
          <button className="mobile-text-button" onClick={onRefreshRandom} type="button">
            <Shuffle size={16} />
            换一本
          </button>
        </div>
        {randomNovel ? (
          <article className="mobile-random-card">
            <CoverArt cover={randomNovel.cover} size="wall" />
            <div>
              <h3>{randomNovel.title}</h3>
              <p>{randomNovel.author}</p>
              <div className="mobile-tag-row">
                {randomNovel.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
              <button className="mobile-detail-link" onClick={() => onOpenNovel(randomNovel)} type="button">
                查看详情 <ChevronRight size={16} />
              </button>
            </div>
          </article>
        ) : (
          <div className="mobile-inline-empty">书库还没有小说，先把第一本故事放进袋子里吧。</div>
        )}
      </section>

      <section aria-labelledby="mobile-recent-title" className="mobile-recent-section">
        <div className="mobile-section-heading">
          <div>
            <p>最近入袋</p>
            <h2 id="mobile-recent-title">最近添加</h2>
          </div>
          <button className="mobile-text-button" onClick={onOpenLibrary} type="button">查看全部</button>
        </div>
        <div className="mobile-recent-list">
          {recentNovels.map((novel) => (
            <button className="mobile-recent-item" key={novel.id} onClick={() => onOpenNovel(novel)} type="button">
              <CoverArt cover={novel.cover} size="thumb" />
              <span><strong>{novel.title}</strong><em>{novel.author}</em></span>
              <ChevronRight size={17} />
            </button>
          ))}
          {recentNovels.length === 0 && <div className="mobile-inline-empty">暂时没有可显示的最近添加记录。</div>}
        </div>
      </section>

      <button aria-label="新增小说" className="mobile-home-add" onClick={onNew} type="button"><Plus size={20} /></button>
    </div>
  )
}
