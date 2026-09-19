import { describe, expect, it } from 'vitest'
import type { NovelPayload } from '../../types/novel'
import { enableMobileForeignKeys, migrateMobileDatabase } from './mobileMigrations'
import { MobileNovelRepository } from './mobileNovelRepository'
import { NodeMobileDatabase } from './testSupport/nodeMobileDatabase'

type StoredNovelPayload = NovelPayload & { coverImagePath?: string | null }

function makeNovelPayload(overrides: Partial<StoredNovelPayload> = {}): StoredNovelPayload {
  return {
    title: 'Generated title Alpha',
    author: 'Generated Author',
    characters: [{ name: 'Generated lead', attribute: '1' }],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 3,
    tags: ['生成标签'],
    notes: 'Generated fixture only',
    createdAt: '2026-09-16',
    updatedAt: '2026-09-16T10:20:30.000Z',
    cover: 'book',
    favorite: false,
    ...overrides,
  }
}

async function createRepositoryForTest(): Promise<MobileNovelRepository> {
  return (await createRepositoryContext()).repository
}

async function createRepositoryContext(): Promise<{
  repository: MobileNovelRepository
  database: NodeMobileDatabase
}> {
  const database = new NodeMobileDatabase()
  await enableMobileForeignKeys(database)
  await migrateMobileDatabase(database)
  return { database, repository: new MobileNovelRepository(database) }
}

describe('MobileNovelRepository create/list round trips', () => {
  it('round-trips authors, ordered characters, deduplicated tags and optional cover paths', async () => {
    const repository = await createRepositoryForTest()
    const created = await repository.createNovel(
      makeNovelPayload({
        characters: [
          { name: 'Generated character two', attribute: '0' },
          { name: 'Generated character one', attribute: '1' },
        ],
        tags: ['幻想', '幻想', '短篇'],
        coverImagePath: 'covers/123e4567-e89b-12d3-a456-426614174000.webp',
      }),
    )

    expect(created.coverImagePath).toBe('covers/123e4567-e89b-12d3-a456-426614174000.webp')
    expect((await repository.listNovels())[0]?.characters).toEqual(created.characters)
    expect((await repository.listNovels())[0]?.tags).toEqual(['幻想', '短篇'])
    expect(await repository.getCoverPath(created.id)).toBe('covers/123e4567-e89b-12d3-a456-426614174000.webp')
  })

  it('deduplicates authors and tags while preserving the default CoverArt without a custom path', async () => {
    const repository = await createRepositoryForTest()
    await repository.createNovel(makeNovelPayload({ tags: ['共享标签', '独有标签'] }))
    const second = await repository.createNovel(
      makeNovelPayload({
        title: 'Generated title Beta',
        tags: ['共享标签'],
        cover: 'moon',
      }),
    )

    const status = await repository.getLibraryStatus()
    expect(status).toMatchObject({ authorCount: 1, novelCount: 2, schemaVersion: 1, tagCount: 2 })
    expect(second.cover).toBe('moon')
    expect(second.coverImagePath).toBeNull()
  })

  it('replaces relations and returns the former cover only after a successful update commit', async () => {
    const repository = await createRepositoryForTest()
    const created = await repository.createNovel(
      makeNovelPayload({
        author: 'Generated original author',
        characters: [{ name: 'Generated original character', attribute: '1' }],
        coverImagePath: 'covers/123e4567-e89b-12d3-a456-426614174000.jpg',
        tags: ['原始标签'],
      }),
    )

    const result = await repository.updateNovel(
      created.id,
      makeNovelPayload({
        author: 'Generated replacement author',
        characters: [{ name: 'Generated replacement character', attribute: '0.5' }],
        coverImagePath: 'covers/223e4567-e89b-42d3-a456-426614174000.png',
        tags: ['替换标签'],
        title: 'Generated replacement title',
      }),
    )

    expect(result.releasedCoverPaths).toEqual(['covers/123e4567-e89b-12d3-a456-426614174000.jpg'])
    expect(result.novel).toMatchObject({
      author: 'Generated replacement author',
      characters: [{ name: 'Generated replacement character', attribute: '0.5' }],
      coverImagePath: 'covers/223e4567-e89b-42d3-a456-426614174000.png',
      tags: ['替换标签'],
      title: 'Generated replacement title',
    })
    expect(await repository.getLibraryStatus()).toMatchObject({ authorCount: 1, tagCount: 1 })
  })

  it('cleans unreferenced authors and tags in the same bulk-delete transaction', async () => {
    const repository = await createRepositoryForTest()
    const first = await repository.createNovel(
      makeNovelPayload({ author: 'Generated shared author', tags: ['保留标签', '删除标签'] }),
    )
    const second = await repository.createNovel(makeNovelPayload({ author: 'Generated shared author', tags: ['保留标签'] }))

    await repository.deleteNovels([first.id])
    expect(await repository.getLibraryStatus()).toMatchObject({ novelCount: 1, authorCount: 1, tagCount: 1 })

    await repository.deleteNovel(second.id)
    expect(await repository.getLibraryStatus()).toMatchObject({ novelCount: 0, authorCount: 0, tagCount: 0 })
  })

  it('rolls back a failed update without releasing a cover or changing relations', async () => {
    const { database, repository } = await createRepositoryContext()
    const created = await repository.createNovel(
      makeNovelPayload({
        coverImagePath: 'covers/123e4567-e89b-12d3-a456-426614174000.webp',
        tags: ['保留标签'],
      }),
    )
    database.failNextWhenSqlIncludes('INSERT INTO characters')

    await expect(
      repository.updateNovel(
        created.id,
        makeNovelPayload({
          author: 'Generated changed author',
          characters: [{ name: 'Generated changed character', attribute: '0' }],
          tags: ['替换标签'],
        }),
      ),
    ).rejects.toThrow('Mobile SQLite transaction failed')

    expect(await repository.getLibraryStatus()).toMatchObject({ authorCount: 1, novelCount: 1, tagCount: 1 })
    await expect(repository.getNovelById(created.id)).resolves.toMatchObject({
      author: 'Generated Author',
      characters: [{ name: 'Generated lead', attribute: '1' }],
      coverImagePath: 'covers/123e4567-e89b-12d3-a456-426614174000.webp',
      tags: ['保留标签'],
    })
  })
})
