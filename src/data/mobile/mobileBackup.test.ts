import { describe, expect, it } from 'vitest'
import type { Novel } from '../../types/novel'
import { exportMobileBackup, previewMobileBackup, restoreMobileBackup, validateMobileBackup } from './mobileBackup'
import { enableMobileForeignKeys, migrateMobileDatabase } from './mobileMigrations'
import { MobileNovelRepository, type StoredNovelPayload } from './mobileNovelRepository'
import { NodeMobileDatabase } from './testSupport/nodeMobileDatabase'

function makeNovel(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: 'Generated backup title',
    author: 'Generated backup author',
    characters: [{ name: 'Generated backup lead', attribute: '1' }],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 2,
    tags: ['生成标签'],
    notes: 'Generated backup fixture only',
    createdAt: '2026-09-16',
    updatedAt: '2026-09-16',
    cover: 'book',
    favorite: false,
    ...overrides,
  }
}

function makeBackup(novels: Record<string, unknown>[]): Record<string, unknown> {
  return {
    count: novels.length,
    exportedAt: '2026-09-16T12:00:00.000Z',
    novels,
  }
}

function makeNovelPayload(overrides: Partial<StoredNovelPayload> = {}): StoredNovelPayload {
  return {
    title: 'Generated restored payload',
    author: 'Generated restored author',
    characters: [{ name: 'Generated restored lead', attribute: '1' }],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 1,
    tags: ['恢复标签'],
    notes: 'Generated restore fixture only',
    createdAt: '2026-09-16',
    updatedAt: '2026-09-16T12:00:00.000Z',
    cover: 'book',
    favorite: false,
    ...overrides,
  }
}

async function createRepositoryForTest(
  options?: ConstructorParameters<typeof NodeMobileDatabase>[0],
): Promise<MobileNovelRepository> {
  const database = new NodeMobileDatabase(options)
  await enableMobileForeignKeys(database)
  await migrateMobileDatabase(database)
  return new MobileNovelRepository(database)
}

function structuredNovel(novel: Novel) {
  return {
    author: novel.author,
    characters: novel.characters,
    cover: novel.cover,
    cpCategory: novel.cpCategory,
    createdAt: novel.createdAt,
    ending: novel.ending,
    favorite: novel.favorite,
    notes: novel.notes,
    rating: novel.rating,
    readCount: novel.readCount,
    status: novel.status,
    tags: novel.tags,
    title: novel.title,
    updatedAt: novel.updatedAt,
  }
}

describe('mobile JSON backup validation and preview', () => {
  it('accepts date-only and ISO datetimes without changing their strings', () => {
    const validation = validateMobileBackup(
      makeBackup([{ ...makeNovel(), createdAt: '2026-06-10', updatedAt: '2026-06-10T12:30:00.000Z' }]),
    )

    expect(validation.issues).toEqual([])
    expect(validation.parsed?.novels[0]).toMatchObject({
      createdAt: '2026-06-10',
      updatedAt: '2026-06-10T12:30:00.000Z',
    })
  })

  it('reports the exact novel and field for invalid id and invalid date', () => {
    const preview = previewMobileBackup(makeBackup([{ ...makeNovel(), id: 0, createdAt: '2026-15-40' }]), 3)

    expect(preview.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['novels[0].id', 'novels[0].createdAt']),
    )
    expect(preview.canRestore).toBe(false)
  })

  it('collects every required business-field issue and never creates a restoreable parsed backup', () => {
    const validation = validateMobileBackup({
      count: 2,
      novels: [
        makeNovel({
          author: '',
          characters: [{ name: '', attribute: 'bad' }],
          cover: 'bad-cover',
          cpCategory: 'bad-cp',
          ending: 'bad-ending',
          favorite: 'true',
          notes: 3,
          rating: 'bad-rating',
          readCount: -1,
          status: 'bad-status',
          tags: ['ok', 3],
          title: ' ',
        }),
      ],
    })

    expect(validation.parsed).toBeNull()
    expect(validation.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        'count',
        'novels[0].title',
        'novels[0].author',
        'novels[0].characters[0].name',
        'novels[0].characters[0].attribute',
        'novels[0].cpCategory',
        'novels[0].ending',
        'novels[0].status',
        'novels[0].rating',
        'novels[0].readCount',
        'novels[0].tags[1]',
        'novels[0].notes',
        'novels[0].cover',
        'novels[0].favorite',
      ]),
    )
  })

  it('rejects duplicate backup IDs but reports duplicate normalized title-author keys as warnings', () => {
    const duplicateIds = validateMobileBackup(
      makeBackup([{ ...makeNovel(), id: 8 }, { ...makeNovel(), id: 8, title: 'Generated title two' }]),
    )
    const duplicateNames = previewMobileBackup(
      makeBackup([
        makeNovel({ author: 'Generated Author', title: ' Generated Key ' }),
        makeNovel({ author: 'generated author', title: 'generated key' }),
      ]),
      5,
    )

    expect(duplicateIds.parsed).toBeNull()
    expect(duplicateIds.issues.map((issue) => issue.path)).toContain('novels[1].id')
    expect(duplicateNames.canRestore).toBe(true)
    expect(duplicateNames.duplicateNovelKeys).toEqual(['generated key\u0000generated author'])
  })

  it('normalizes only supported legacy endings and strips private cover paths from parsed output', () => {
    const validation = validateMobileBackup(
      makeBackup([
        makeNovel({
          coverImage: { included: false, kind: 'local' },
          coverImagePath: 'covers/should-not-leave-the-device.webp',
          ending: '未完结',
          unexpected: 'ignored',
        }),
        makeNovel({ ending: '未知', title: 'Generated second title' }),
      ]),
    )

    expect(validation.issues).toEqual([])
    expect(validation.parsed?.novels[0]).toMatchObject({
      coverImage: { included: false, kind: 'local' },
      ending: '坑',
    })
    expect(validation.parsed?.novels[0]).not.toHaveProperty('coverImagePath')
    expect(validation.parsed?.novels[0]).not.toHaveProperty('unexpected')
    expect(validation.parsed?.novels[1]?.ending).toBe('其他')
  })

  it('accepts a legacy backup with only novels without inventing export metadata', () => {
    const validation = validateMobileBackup({ novels: [makeNovel()] })

    expect(validation.issues).toEqual([])
    expect(validation.parsed).toMatchObject({ count: 1 })
    expect(validation.parsed?.exportedAt).toBeUndefined()
  })

  it('restores valid explicit ids and allocates the next created id above the maximum', async () => {
    const repository = await createRepositoryForTest()
    const validation = validateMobileBackup(
      makeBackup([
        { ...makeNovel({ title: 'Generated explicit seventeen' }), id: 17 },
        { ...makeNovel({ title: 'Generated explicit forty-two' }), id: 42 },
      ]),
    )
    if (!validation.parsed) throw new Error('fixture must be valid')

    await restoreMobileBackup(repository, validation.parsed)

    const created = await repository.createNovel(makeNovelPayload())
    expect(created.id).toBeGreaterThan(42)
  })

  it('rolls back a replacement restore if a relation write fails', async () => {
    const repository = await createRepositoryForTest({ failWhenSqlIncludes: 'INSERT INTO novel_tags' })
    await repository.createNovel(makeNovelPayload({ tags: [], title: 'Generated before restore' }))
    const validation = validateMobileBackup(makeBackup([makeNovel({ tags: ['触发失败'] })]))
    if (!validation.parsed) throw new Error('fixture must be valid')

    await expect(restoreMobileBackup(repository, validation.parsed)).rejects.toThrow()
    expect((await repository.listNovels()).map((novel) => novel.title)).toEqual(['Generated before restore'])
  })

  it('restores mixed missing and explicit ids without primary-key collisions', async () => {
    const repository = await createRepositoryForTest()
    const validation = validateMobileBackup(
      makeBackup([
        makeNovel({ title: 'Generated automatic one' }),
        { ...makeNovel({ title: 'Generated explicit one' }), id: 1 },
        makeNovel({ title: 'Generated automatic two' }),
        { ...makeNovel({ title: 'Generated explicit forty-two' }), id: 42 },
      ]),
    )
    if (!validation.parsed) throw new Error('fixture must be valid')

    await restoreMobileBackup(repository, validation.parsed)

    const restored = await repository.listNovels()
    expect(restored.find((novel) => novel.title === 'Generated explicit one')?.id).toBe(1)
    expect(restored.find((novel) => novel.title === 'Generated explicit forty-two')?.id).toBe(42)
    expect(new Set(restored.map((novel) => novel.id)).size).toBe(4)
    expect((await repository.createNovel(makeNovelPayload())).id).toBeGreaterThan(Math.max(...restored.map((novel) => novel.id)))
  })

  it('round-trips a generated 425-record backup without custom cover paths', async () => {
    const source = await createRepositoryForTest()
    const validation = validateMobileBackup(
      makeBackup(
        Array.from({ length: 425 }, (_, index) =>
          makeNovel({
            author: `Generated author ${index % 17}`,
            characters: [{ name: `Generated character ${index}`, attribute: index % 2 === 0 ? '1' : '0' }],
            tags: [`Generated tag ${index % 11}`],
            title: `Generated backup ${index + 1}`,
          }),
        ),
      ),
    )
    if (!validation.parsed) throw new Error('fixture must be valid')

    await restoreMobileBackup(source, validation.parsed)
    const exported = await exportMobileBackup(source)
    const exportedValidation = validateMobileBackup(exported)
    if (!exportedValidation.parsed) throw new Error('export must be valid')
    const target = await createRepositoryForTest()
    await restoreMobileBackup(target, exportedValidation.parsed)

    const sourceNovels = await source.listNovels()
    const targetNovels = await target.listNovels()
    expect(exported.count).toBe(425)
    expect(exported.novels.every((novel) => !('coverImagePath' in novel))).toBe(true)
    expect(targetNovels.map(structuredNovel)).toEqual(sourceNovels.map(structuredNovel))
  })

  it('exports only non-image custom-cover metadata and restores it as a null path', async () => {
    const source = await createRepositoryForTest()
    await source.createNovel(
      makeNovelPayload({ coverImagePath: 'covers/123e4567-e89b-12d3-a456-426614174000.webp' }),
    )

    const exported = await exportMobileBackup(source)
    const validation = validateMobileBackup(exported)
    if (!validation.parsed) throw new Error('export must be valid')
    const target = await createRepositoryForTest()
    await restoreMobileBackup(target, validation.parsed)

    expect(exported.novels[0]).toMatchObject({ coverImage: { included: false, kind: 'local' } })
    expect(exported.novels[0]).not.toHaveProperty('coverImagePath')
    expect((await target.listNovels())[0]?.coverImagePath).toBeNull()
  })
})
