import type { Character, CharacterAttribute, CoverStyle, Novel, NovelPayload } from '../../types/novel'
import type { PortableBackupNovel } from './mobileBackup'
import type { MobileSqlDatabase, SqlRow } from './sqlTypes'

export type StoredNovelPayload = NovelPayload & { coverImagePath?: string | null }

export type MobileLibraryStatus = {
  novelCount: number
  authorCount: number
  tagCount: number
  schemaVersion: number
}

export type MobileDeleteResult = {
  deletedIds: number[]
  releasedCoverPaths: string[]
}

export type MobileBackupReplaceResult = {
  count: number
  novels: Novel[]
  releasedCoverPaths: string[]
}

type NovelRow = SqlRow & {
  id: number
  title: string
  author: string
  cp_category: Novel['cpCategory']
  ending: Novel['ending']
  status: Novel['status']
  rating: Novel['rating']
  read_count: number
  notes: string
  cover: CoverStyle
  cover_image_path: string | null
  favorite: number
  created_at: string
  updated_at: string
}

type CharacterRow = SqlRow & {
  novel_id: number
  name: string
  attribute: CharacterAttribute
}

type TagRow = SqlRow & {
  novel_id: number
  name: string
}

function numericValue(row: SqlRow | undefined, key: string): number {
  return Number(row?.[key])
}

function trimmedUnique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export class MobileNovelRepository {
  protected readonly database: MobileSqlDatabase

  constructor(database: MobileSqlDatabase) {
    this.database = database
  }

  async listNovels(): Promise<Novel[]> {
    const novels = await this.database.query<NovelRow>(
      `SELECT novels.id, novels.title, authors.name AS author, novels.cp_category, novels.ending,
              novels.status, novels.rating, novels.read_count, novels.notes, novels.cover,
              novels.cover_image_path, novels.favorite, novels.created_at, novels.updated_at
         FROM novels
         JOIN authors ON authors.id = novels.author_id
        ORDER BY novels.id`,
    )
    const characters = await this.database.query<CharacterRow>(
      'SELECT novel_id, name, attribute FROM characters ORDER BY novel_id, sort_order, id',
    )
    const tags = await this.database.query<TagRow>(
      `SELECT novel_tags.novel_id, tags.name
         FROM novel_tags
         JOIN tags ON tags.id = novel_tags.tag_id
        ORDER BY novel_tags.novel_id, tags.name`,
    )
    const charactersByNovel = new Map<number, Character[]>()
    const tagsByNovel = new Map<number, string[]>()

    for (const character of characters) {
      const current = charactersByNovel.get(character.novel_id) ?? []
      current.push({ name: character.name, attribute: character.attribute })
      charactersByNovel.set(character.novel_id, current)
    }
    for (const tag of tags) {
      const current = tagsByNovel.get(tag.novel_id) ?? []
      current.push(tag.name)
      tagsByNovel.set(tag.novel_id, current)
    }

    return novels.map((novel) => ({
      id: novel.id,
      title: novel.title,
      author: novel.author,
      characters: charactersByNovel.get(novel.id) ?? [],
      cpCategory: novel.cp_category,
      ending: novel.ending,
      status: novel.status,
      rating: novel.rating,
      readCount: novel.read_count,
      tags: tagsByNovel.get(novel.id) ?? [],
      notes: novel.notes,
      createdAt: novel.created_at,
      updatedAt: novel.updated_at,
      cover: novel.cover,
      coverImagePath: novel.cover_image_path,
      favorite: novel.favorite === 1,
    }))
  }

  async getLibraryStatus(): Promise<MobileLibraryStatus> {
    const [novelCount, authorCount, tagCount, schemaVersion] = await Promise.all([
      this.database.query<SqlRow>('SELECT COUNT(*) AS count FROM novels'),
      this.database.query<SqlRow>('SELECT COUNT(*) AS count FROM authors'),
      this.database.query<SqlRow>('SELECT COUNT(*) AS count FROM tags'),
      this.database.query<SqlRow>('PRAGMA user_version'),
    ])

    return {
      novelCount: numericValue(novelCount[0], 'count'),
      authorCount: numericValue(authorCount[0], 'count'),
      tagCount: numericValue(tagCount[0], 'count'),
      schemaVersion: numericValue(schemaVersion[0], 'user_version'),
    }
  }

  async createNovel(payload: StoredNovelPayload): Promise<Novel> {
    const novelId = await this.inTransaction(() => this.insertNovel(payload))
    const novel = await this.getNovelById(novelId)
    if (!novel) {
      throw new Error(`Created novel ${novelId} could not be read back`)
    }
    return novel
  }

  async createNovels(payloads: StoredNovelPayload[]): Promise<Novel[]> {
    if (payloads.length === 0) return []
    const ids = await this.inTransaction(async () => {
      const createdIds: number[] = []
      for (const payload of payloads) createdIds.push(await this.insertNovel(payload))
      return createdIds
    })
    const byId = new Map((await this.listNovels()).map((novel) => [novel.id, novel]))
    return ids.map((id) => {
      const novel = byId.get(id)
      if (!novel) throw new Error(`Created novel ${id} could not be read back`)
      return novel
    })
  }

  async getNovelById(id: number): Promise<Novel | null> {
    return (await this.listNovels()).find((novel) => novel.id === id) ?? null
  }

  async getCoverPath(id: number): Promise<string | null> {
    const rows = await this.database.query<SqlRow>('SELECT cover_image_path FROM novels WHERE id = ?', [id])
    const path = rows[0]?.cover_image_path
    return typeof path === 'string' ? path : null
  }

  async isCoverPathReferenced(path: string): Promise<boolean> {
    const rows = await this.database.query<SqlRow>(
      'SELECT 1 AS referenced FROM novels WHERE cover_image_path = ? LIMIT 1',
      [path],
    )
    return rows.length > 0
  }

  async updateNovel(
    id: number,
    payload: StoredNovelPayload,
  ): Promise<{ novel: Novel; releasedCoverPaths: string[] }> {
    const releasedCoverPaths = await this.inTransaction(async () => {
      const existing = await this.database.query<SqlRow>('SELECT cover_image_path FROM novels WHERE id = ?', [id])
      if (!existing[0]) {
        throw new Error(`Novel ${id} was not found`)
      }

      const authorId = await this.getOrCreateAuthorId(payload.author)
      await this.database.run(
        `UPDATE novels
            SET title = ?, author_id = ?, cp_category = ?, ending = ?, status = ?, rating = ?,
                read_count = ?, notes = ?, cover = ?, cover_image_path = ?, favorite = ?,
                created_at = ?, updated_at = ?
          WHERE id = ?`,
        [
          payload.title,
          authorId,
          payload.cpCategory,
          payload.ending,
          payload.status,
          payload.rating,
          payload.readCount,
          payload.notes,
          payload.cover,
          payload.coverImagePath ?? null,
          payload.favorite ? 1 : 0,
          payload.createdAt,
          payload.updatedAt,
          id,
        ],
      )
      await this.replaceNovelRelations(id, payload)
      await this.cleanUnreferencedMetadata()

      const previousPath = existing[0].cover_image_path
      return typeof previousPath === 'string' && previousPath !== (payload.coverImagePath ?? null) ? [previousPath] : []
    })
    const novel = await this.getNovelById(id)
    if (!novel) {
      throw new Error(`Updated novel ${id} could not be read back`)
    }
    return { novel, releasedCoverPaths }
  }

  async deleteNovel(id: number): Promise<MobileDeleteResult> {
    return this.deleteNovels([id])
  }

  async deleteNovels(ids: number[]): Promise<MobileDeleteResult> {
    const uniqueIds = [...new Set(ids)]
    if (uniqueIds.length === 0) {
      return { deletedIds: [], releasedCoverPaths: [] }
    }

    return this.inTransaction(async () => {
      const existingById = new Map<number, string | null>()
      for (const id of uniqueIds) {
        const rows = await this.database.query<SqlRow>('SELECT id, cover_image_path FROM novels WHERE id = ?', [id])
        if (!rows[0]) {
          throw new Error(`Novel ${id} was not found`)
        }
        const coverPath = rows[0].cover_image_path
        existingById.set(id, typeof coverPath === 'string' ? coverPath : null)
      }

      for (const id of uniqueIds) {
        await this.database.run('DELETE FROM novel_tags WHERE novel_id = ?', [id])
        await this.database.run('DELETE FROM characters WHERE novel_id = ?', [id])
        await this.database.run('DELETE FROM novels WHERE id = ?', [id])
      }
      await this.cleanUnreferencedMetadata()

      return {
        deletedIds: uniqueIds,
        releasedCoverPaths: [...existingById.values()].filter((path): path is string => path !== null),
      }
    })
  }

  async replaceAllFromBackup(backupNovels: PortableBackupNovel[]): Promise<MobileBackupReplaceResult> {
    const currentCoverRows = await this.database.query<SqlRow>(
      'SELECT cover_image_path FROM novels WHERE cover_image_path IS NOT NULL',
    )
    const releasedCoverPaths = currentCoverRows
      .map((row) => row.cover_image_path)
      .filter((path): path is string => typeof path === 'string')

    await this.inTransaction(async () => {
      await this.database.execute('DELETE FROM novel_tags')
      await this.database.execute('DELETE FROM characters')
      await this.database.execute('DELETE FROM novels')
      await this.database.execute('DELETE FROM tags')
      await this.database.execute('DELETE FROM authors')

      const explicitIdNovels = backupNovels.filter((novel) => novel.id !== undefined)
      const generatedIdNovels = backupNovels.filter((novel) => novel.id === undefined)
      for (const novel of explicitIdNovels) {
        await this.insertRestoredNovel(novel)
      }
      for (const novel of generatedIdNovels) {
        await this.insertRestoredNovel(novel)
      }
    })

    const novels = await this.listNovels()
    return { count: novels.length, novels, releasedCoverPaths }
  }

  protected async inTransaction<T>(operation: () => Promise<T>): Promise<T> {
    await this.database.beginTransaction()
    try {
      const result = await operation()
      await this.database.commitTransaction()
      return result
    } catch (error) {
      await this.database.rollbackTransaction()
      throw new Error(`Mobile SQLite transaction failed: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      })
    }
  }

  protected async getOrCreateAuthorId(authorName: string): Promise<number> {
    await this.database.run('INSERT OR IGNORE INTO authors (name) VALUES (?)', [authorName.trim()])
    const rows = await this.database.query<SqlRow>('SELECT id FROM authors WHERE name = ?', [authorName.trim()])
    const id = numericValue(rows[0], 'id')
    if (!Number.isInteger(id) || id < 1) {
      throw new Error(`Could not resolve author ID for ${authorName}`)
    }
    return id
  }

  protected async getOrCreateTagId(tagName: string): Promise<number> {
    await this.database.run('INSERT OR IGNORE INTO tags (name) VALUES (?)', [tagName])
    const rows = await this.database.query<SqlRow>('SELECT id FROM tags WHERE name = ?', [tagName])
    const id = numericValue(rows[0], 'id')
    if (!Number.isInteger(id) || id < 1) {
      throw new Error(`Could not resolve tag ID for ${tagName}`)
    }
    return id
  }

  private async replaceNovelRelations(id: number, payload: StoredNovelPayload): Promise<void> {
    await this.database.run('DELETE FROM novel_tags WHERE novel_id = ?', [id])
    await this.database.run('DELETE FROM characters WHERE novel_id = ?', [id])
    for (const [sortOrder, character] of payload.characters.entries()) {
      await this.database.run(
        'INSERT INTO characters (novel_id, name, attribute, sort_order) VALUES (?, ?, ?, ?)',
        [id, character.name, character.attribute, sortOrder],
      )
    }
    for (const tag of trimmedUnique(payload.tags)) {
      const tagId = await this.getOrCreateTagId(tag)
      await this.database.run('INSERT INTO novel_tags (novel_id, tag_id) VALUES (?, ?)', [id, tagId])
    }
  }

  private async cleanUnreferencedMetadata(): Promise<void> {
    await this.database.execute(
      'DELETE FROM authors WHERE NOT EXISTS (SELECT 1 FROM novels WHERE novels.author_id = authors.id)',
    )
    await this.database.execute(
      'DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM novel_tags WHERE novel_tags.tag_id = tags.id)',
    )
  }

  private async insertNovel(payload: StoredNovelPayload): Promise<number> {
    const authorId = await this.getOrCreateAuthorId(payload.author)
    const created = await this.database.run(
      `INSERT INTO novels (
        title, author_id, cp_category, ending, status, rating, read_count, notes, cover,
        cover_image_path, favorite, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.title,
        authorId,
        payload.cpCategory,
        payload.ending,
        payload.status,
        payload.rating,
        payload.readCount,
        payload.notes,
        payload.cover,
        payload.coverImagePath ?? null,
        payload.favorite ? 1 : 0,
        payload.createdAt,
        payload.updatedAt,
      ],
    )
    const id = created.lastInsertRowId
    if (id === undefined) throw new Error('SQLite did not return an inserted novel ID')
    for (const [sortOrder, character] of payload.characters.entries()) {
      await this.database.run(
        'INSERT INTO characters (novel_id, name, attribute, sort_order) VALUES (?, ?, ?, ?)',
        [id, character.name, character.attribute, sortOrder],
      )
    }
    for (const tag of trimmedUnique(payload.tags)) {
      const tagId = await this.getOrCreateTagId(tag)
      await this.database.run('INSERT INTO novel_tags (novel_id, tag_id) VALUES (?, ?)', [id, tagId])
    }
    return id
  }

  private async insertRestoredNovel(novel: PortableBackupNovel): Promise<number> {
    const authorId = await this.getOrCreateAuthorId(novel.author)
    const statement = novel.id === undefined
      ? `INSERT INTO novels (
          title, author_id, cp_category, ending, status, rating, read_count, notes, cover,
          cover_image_path, favorite, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      : `INSERT INTO novels (
          id, title, author_id, cp_category, ending, status, rating, read_count, notes, cover,
          cover_image_path, favorite, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    const values = [
      ...(novel.id === undefined ? [] : [novel.id]),
      novel.title,
      authorId,
      novel.cpCategory,
      novel.ending,
      novel.status,
      novel.rating,
      novel.readCount,
      novel.notes,
      novel.cover,
      null,
      novel.favorite ? 1 : 0,
      novel.createdAt,
      novel.updatedAt,
    ]
    const result = await this.database.run(statement, values)
    const finalId = novel.id ?? result.lastInsertRowId
    if (finalId === undefined) {
      throw new Error('SQLite did not return a restored novel ID')
    }

    for (const [sortOrder, character] of novel.characters.entries()) {
      await this.database.run(
        'INSERT INTO characters (novel_id, name, attribute, sort_order) VALUES (?, ?, ?, ?)',
        [finalId, character.name, character.attribute, sortOrder],
      )
    }
    for (const tag of trimmedUnique(novel.tags)) {
      const tagId = await this.getOrCreateTagId(tag)
      await this.database.run('INSERT INTO novel_tags (novel_id, tag_id) VALUES (?, ?)', [finalId, tagId])
    }
    return finalId
  }
}
