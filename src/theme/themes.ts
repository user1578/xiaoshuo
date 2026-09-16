export const themeIds = ['blue-red', 'mono', 'mist-wine', 'charcoal'] as const

export type ThemeId = (typeof themeIds)[number]

export type ThemeDefinition = {
  id: ThemeId
  label: string
  description: string
  swatches: [string, string, string, string]
}

export const themes: ThemeDefinition[] = [
  {
    id: 'blue-red',
    label: '蓝灰红',
    description: '沉稳的蓝灰与低饱和红',
    swatches: ['#1f344a', '#8fa9c2', '#d7dce2', '#9a3f3f'],
  },
  {
    id: 'mono',
    label: '黑白灰',
    description: '纯净克制，专注阅读记录',
    swatches: ['#171717', '#5f6368', '#d9dce0', '#fafafa'],
  },
  {
    id: 'mist-wine',
    label: '雾蓝酒红',
    description: '轻雾蓝与温润酒红',
    swatches: ['#5f8097', '#b9cfda', '#ead9df', '#853946'],
  },
  {
    id: 'charcoal',
    label: '深灰米白红',
    description: '深炭灰、米白与砖红',
    swatches: ['#343434', '#857a6c', '#f3eee5', '#a64c43'],
  },
]

export function isThemeId(value: string | null): value is ThemeId {
  return themeIds.includes(value as ThemeId)
}

export function readStoredTheme(value: string | null): ThemeId {
  return isThemeId(value) ? value : 'blue-red'
}
