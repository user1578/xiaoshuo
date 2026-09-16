import { Check } from 'lucide-react'
import { themes } from '../../theme/themes'
import type { ThemeId } from '../../theme/themes'

export function ThemeSelector({ theme, onThemeChange }: { theme: ThemeId; onThemeChange: (theme: ThemeId) => void }) {
  return (
    <section className="theme-selector" aria-labelledby="theme-selector-title">
      <div className="mobile-section-heading">
        <div>
          <p>界面外观</p>
          <h2 id="theme-selector-title">主题设置</h2>
        </div>
      </div>
      <div className="theme-options">
        {themes.map((option) => {
          const selected = option.id === theme
          return (
            <button
              aria-pressed={selected}
              className={selected ? 'theme-option selected' : 'theme-option'}
              key={option.id}
              onClick={() => onThemeChange(option.id)}
              type="button"
            >
              <span className="theme-swatches" aria-hidden="true">
                {option.swatches.map((color) => <i key={color} style={{ backgroundColor: color }} />)}
              </span>
              <span>
                <strong>{option.label}</strong>
                <em>{option.description}</em>
              </span>
              {selected && <Check size={18} aria-label="当前主题" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}
