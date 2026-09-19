import { describe, expect, it, vi } from 'vitest'
import { createMobileRepository } from './mobileRepository'
import { enableMobileForeignKeys, migrateMobileDatabase } from './mobileMigrations'
import { MobileNovelRepository, type StoredNovelPayload } from './mobileNovelRepository'
import { NodeMobileDatabase } from './testSupport/nodeMobileDatabase'

const headers = '书名,作者,主角1,主角1属性,主角2,主角2属性,CP类别,结局,阅读状态,个人评价,阅读次数,标签,备注'
const csv = `${headers}\nCSV 新书,CSV 作者,主角,1,,,,,,,2,标签,备注`

function payload(overrides: Partial<StoredNovelPayload> = {}): StoredNovelPayload {
  return {
    title: 'Generated existing', author: 'Generated author', characters: [{ name: 'Generated lead', attribute: '1' }],
    cpCategory: '1v1', ending: 'HE', status: '看完', rating: '喜欢', readCount: 1, tags: [], notes: '',
    createdAt: '2026-09-18', updatedAt: '2026-09-18', cover: 'book', favorite: false, ...overrides,
  }
}

async function createStore(options?: ConstructorParameters<typeof NodeMobileDatabase>[0]) {
  const database = new NodeMobileDatabase(options)
  await enableMobileForeignKeys(database)
  await migrateMobileDatabase(database)
  return { database, novels: new MobileNovelRepository(database) }
}

function mobileRepository(novels: MobileNovelRepository) {
  const writeFile = vi.fn(async () => ({ uri: 'content://cache/novel-export.csv' }))
  const getUri = vi.fn(async () => ({ uri: 'content://cache/novel-export.csv' }))
  const share = vi.fn(async () => ({}))
  return {
    repository: createMobileRepository({
      novels,
      covers: { deleteIfUnreferenced: async () => undefined, resolveUri: async () => null, save: async () => 'unused' },
      filesystem: { writeFile, getUri },
      share: { share },
    }),
    writeFile,
    getUri,
    share,
  }
}

describe('mobile CSV repository', () => {
  it('previews from SQLite without writing and confirms only ready rows', async () => {
    const { novels } = await createStore()
    const { repository } = mobileRepository(novels)

    await expect(repository.previewCsvImport(csv)).resolves.toMatchObject({ importableCount: 1 })
    expect(await novels.listNovels()).toEqual([])
    await expect(repository.confirmCsvImport(csv)).resolves.toMatchObject({ importedCount: 1 })
    expect((await novels.listNovels()).map((novel) => novel.title)).toEqual(['CSV 新书'])
  })

  it('re-previews at confirmation time so a concurrent insert becomes duplicate', async () => {
    const { novels } = await createStore()
    const { repository } = mobileRepository(novels)

    await repository.previewCsvImport(csv)
    await novels.createNovel(payload({ title: 'CSV 新书', author: 'CSV 作者' }))
    await expect(repository.confirmCsvImport(csv)).resolves.toMatchObject({ importedCount: 0, duplicateCount: 1 })
    expect(await novels.getLibraryStatus()).toMatchObject({ novelCount: 1 })
  })

  it('inserts a CSV batch in one transaction and rolls back the entire batch on relation failure', async () => {
    const success = await createStore()
    await success.novels.createNovels([payload({ title: 'Generated batch first' }), payload({ title: 'Generated batch second' })])
    expect(await success.novels.getLibraryStatus()).toMatchObject({ novelCount: 2 })

    const failing = await createStore({ failWhenSqlIncludes: 'INSERT INTO characters' })
    await expect(failing.novels.createNovels([
      payload({ title: 'Generated rollback first', characters: [] }),
      payload({ title: 'Generated rollback second' }),
    ])).rejects.toThrow('Mobile SQLite transaction failed')
    expect(await failing.novels.getLibraryStatus()).toMatchObject({ novelCount: 0 })
  })

  it('exports SQLite CSV once to Cache and shares the returned URI', async () => {
    const { novels } = await createStore()
    await novels.createNovel(payload({ title: 'Generated export' }))
    const { repository, writeFile, getUri, share } = mobileRepository(novels)

    await expect(repository.shareNovelCsv()).resolves.toBe('content://cache/novel-export.csv')
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ data: expect.stringMatching(/^\uFEFF/), directory: 'CACHE', encoding: 'utf8' }))
    expect(getUri).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: ['content://cache/novel-export.csv'] }))
  })
})
