import { ChevronLeft, MoreHorizontal } from 'lucide-react'

export function MobileTopBar({
  title,
  subtitle,
  onBack,
  onMore,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  onMore?: () => void
}) {
  return (
    <header className="mobile-topbar">
      <div className="mobile-topbar-leading">
        {onBack && (
          <button aria-label="返回" className="mobile-icon-button" onClick={onBack} type="button">
            <ChevronLeft size={22} />
          </button>
        )}
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {onMore && (
        <button aria-label="更多功能" className="mobile-icon-button" onClick={onMore} type="button">
          <MoreHorizontal size={22} />
        </button>
      )}
    </header>
  )
}
