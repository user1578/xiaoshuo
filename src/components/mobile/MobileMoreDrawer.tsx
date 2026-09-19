import { BarChart3, CheckCircle2, Clock3, Heart, ShieldBan, UsersRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { mobileMoreViews } from './mobileNavigation'
import type { View } from '../../types/novel'

const moreIcons: Record<(typeof mobileMoreViews)[number]['id'], LucideIcon> = {
  recent: Clock3,
  finished: CheckCircle2,
  liked: Heart,
  abandoned: ShieldBan,
  stats: BarChart3,
  'cp-1v1': UsersRound,
  'cp-none': UsersRound,
  'cp-np': UsersRound,
}

export function MobileMoreDrawer({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: (view: View) => void }) {
  if (!open) return null

  return (
    <div className="mobile-drawer-backdrop" onClick={onClose} role="presentation">
      <aside aria-label="更多功能" className="mobile-more-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="mobile-drawer-heading">
          <div>
            <p>小说袋</p>
            <h2>更多功能</h2>
          </div>
          <button aria-label="关闭更多功能" className="mobile-icon-button" onClick={onClose} type="button">
            <X size={21} />
          </button>
        </div>
        <div className="mobile-more-list">
          {mobileMoreViews.map((item) => {
            const Icon = moreIcons[item.id]
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id)
                  onClose()
                }}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
