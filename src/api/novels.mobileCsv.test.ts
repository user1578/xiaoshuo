import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  loadMobileRepository: vi.fn(),
}))

vi.mock('../data/dataSource', () => ({
  isSupabaseDataSource: () => false,
  resolveDataSource: () => 'mobile',
}))
vi.mock('../data/mobile/mobileLoader', () => ({ loadMobileRepository: state.loadMobileRepository }))

import { confirmCsvImport, exportNovelCsv, previewCsvImport } from './novels'

describe('mobile CSV API facade', () => {
  afterEach(() => {
    state.loadMobileRepository.mockReset()
    vi.unstubAllGlobals()
  })

  it('routes all mobile CSV operations to SQLite without fetching the Node API', async () => {
    const repository = {
      previewCsvImport: vi.fn(async () => ({ importableCount: 1 })),
      confirmCsvImport: vi.fn(async () => ({ importedCount: 1 })),
      shareNovelCsv: vi.fn(async () => 'content://cache/generated.csv'),
    }
    const fetch = vi.fn()
    state.loadMobileRepository.mockResolvedValue(repository)
    vi.stubGlobal('fetch', fetch)

    await expect(previewCsvImport('csv')).resolves.toEqual({ importableCount: 1 })
    await expect(confirmCsvImport('csv')).resolves.toEqual({ importedCount: 1 })
    await expect(exportNovelCsv()).resolves.toBe('content://cache/generated.csv')
    expect(fetch).not.toHaveBeenCalled()
  })
})
