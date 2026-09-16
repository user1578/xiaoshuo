import { BookOpen, Home, LibraryBig, UserRound } from 'lucide-react'
import type { View } from '../../types/novel'

const items = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'all', label: '书库', icon: LibraryBig },
  { id: 'authors', label: '作者', icon: UserRound },
  { id: 'profile', label: '我的', icon: BookOpen },
] as const

const libraryViews: View[] = ['all', 'recent', 'finished', 'liked', 'abandoned', 'cp-1v1', 'cp-none', 'cp-np']

function selectedNavView(activeView: View) {
  return libraryViews.includes(activeView) ? 'all' : activeView
}

export function MobileBottomNav({ activeView, onNavigate }: { activeView: View; onNavigate: (view: View) => void }) {
  const selected = selectedNavView(activeView)

  return (
    <nav className="mobile-bottom-nav" aria-label="移动端主导航">
      {items.map((item) => {
        const Icon = item.icon
        const active = selected === item.id
        return (
          <button aria-current={active ? 'page' : undefined} className={active ? 'active' : ''} key={item.id} onClick={() => onNavigate(item.id)} type="button">
            <Icon size={20} />
            <span>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
