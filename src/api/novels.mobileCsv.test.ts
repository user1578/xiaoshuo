import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  loadMobileRepository: vi.fn(),
}))

vi.mock('../data/dataSource', () => ({
  isSupabaseDataSource: () => false,
  resolveDataSource: () => 'mobile',
}))
vi.mock('../data/mobile/mobileLoader', () => ({ loadMobileRepository: state.loadMobileRepository }))

import { confirmCsvCorrections, confirmCsvImport, exportNovelCsv, previewCsvCorrections, previewCsvImport } from './novels'
import { createMobileRepository } from '../data/mobile/mobileRepository'
import { NodeMobileDatabase } from '../data/mobile/testSupport/nodeMobileDatabase'
import { MobileNovelRepository } from '../data/mobile/mobileNovelRepository'
import { enableMobileForeignKeys, migrateMobileDatabase } from '../data/mobile/mobileMigrations'
import { correctCsvImportRow, createCsvImportSession } from '../../shared/novelCsv.mjs'

describe('mobile CSV API facade', () => {
  afterEach(() => {
    state.loadMobileRepository.mockReset()
    vi.unstubAllGlobals()
  })

  it('passes corrections through to real in-memory SQLite without using the Node API', async () => {
    const database = new NodeMobileDatabase()
    await enableMobileForeignKeys(database)
    await migrateMobileDatabase(database)
    const novels = new MobileNovelRepository(database)
    const repository = createMobileRepository({
      novels,
      covers: { deleteIfUnreferenced: async () => undefined, resolveUri: async () => null, save: async () => 'unused' },
      filesystem: { writeFile: async () => ({ uri: '' }), getUri: async () => ({ uri: '' }) },
      share: { share: async () => ({}) },
    })
    state.loadMobileRepository.mockResolvedValue(repository)
    const fetch = vi.fn(() => { throw new Error('Unexpected network access') })
    vi.stubGlobal('fetch', fetch)
    const csv = '书名,作者,主角1,主角1属性,主角2,主角2属性,CP类别,结局,阅读状态,个人评价,阅读次数\n生成书,作者,甲,1,,,1v1,HE,看完,非法,1'
    const session = correctCsvImportRow(createCsvImportSession(csv, []), 2, { rating: '喜欢' })
    await expect(previewCsvCorrections(session.rows)).resolves.toMatchObject({ importableCount: 1 })
    await expect(confirmCsvCorrections(session.rows)).resolves.toMatchObject({ importedCount: 1 })
    expect((await novels.listNovels())[0]).toMatchObject({ title: '生成书', rating: '喜欢' })
    expect(fetch).not.toHaveBeenCalled()
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
