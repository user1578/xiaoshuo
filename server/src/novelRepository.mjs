import { runInTransaction } from './db.mjs'

const ENDINGS = new Set(['HE', 'BE', 'OE', '坑', '其他'])
const CP_CATEGORIES = new Set(['1v1', '无CP', 'NP'])
const STATUSES = new Set(['看完', '荒废'])
const RATINGS = new Set(['喜欢', '一般', '不喜欢', '未评价'])
const CHARACTER_ATTRIBUTES = new Set(['1', '0', '0.5', '其他'])

const DEFAULT_COVER = 'book'

function normalizeEnding(value) {
  if (ENDINGS.has(value)) return value
  if (value === '未完结') return '坑'
  if (value === '未知') return '其他'
  return '其他'
}

function normalizeCpCategory(value) {
  if (CP_CATEGORIES.has(value)) return value
  if (value === '无CP') return '无CP'
  return value === 'NP' ? 'NP' : '1v1'
}

function normalizeStatus(value) {
  if (STATUSES.has(value)) return value
  return value === '荒废' ? '荒废' : '看完'
}

function normalizeRating(value) {
  if (RATINGS.has(value)) return value
  return '未评价'
}

function normalizeCharacterAttribute(value) {
  if (CHARACTER_ATTRIBUTES.has(value)) return value
  return '其他'
}

function assertString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw Object.assign(new Error(`${fieldName} is required`), { statusCode: 400 })
  }
  return value.trim()
}

function toBooleanInteger(value) {
  return value === true || value === 1 ? 1 : 0
}

function normalizeNovelInput(input, { partial = false } = {}) {
  const now = new Date().toISOString().slice(0, 10)
  const source = input ?? {}

  if (!partial) {
    assertString(source.title, 'title')
    assertString(source.author, 'author')
  }

  return {
    title: source.title === undefined ? undefined : assertString(source.title, 'title'),
    author: source.author === undefined ? undefined : assertString(source.author, 'author'),
    characters: Array.isArray(source.characters)
      ? source.characters
          .filter((character) => character && typeof character.name === 'string' && character.name.trim())
          .map((character) => ({
            name: character.name.trim(),
            attribute: normalizeCharacterAttribute(character.attribute),
          }))
      : undefined,
    tags: Array.isArray(source.tags)
      ? [...new Set(source.tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean))]
      : undefined,
    cpCategory: source.cpCategory === undefined ? undefined : normalizeCpCategory(source.cpCategory),
    ending: source.ending === undefined ? undefined : normalizeEnding(source.ending),
    status: source.status === undefined ? undefined : normalizeStatus(source.status),
    rating: source.rating === undefined ? undefined : normalizeRating(source.rating),
    readCount:
      source.readCount === undefined ? undefined : Math.max(0, Number.parseInt(String(source.readCount), 10) || 0),
    notes: source.notes === undefined ? undefined : String(source.notes),
    cover: source.cover === undefined ? undefined : String(source.cover || DEFAULT_COVER),
    favorite: source.favorite === undefined ? undefined : toBooleanInteger(source.favorite),
    createdAt: source.createdAt === undefined ? undefined : String(source.createdAt || now),
    updatedAt: source.updatedAt === undefined ? undefined : String(source.updatedAt || now),
  }
}

function getOrCreateAuthorId(db, authorName) {
  db.prepare('INSERT OR IGNORE INTO authors (name) VALUES (?)').run(authorName)
  return db.prepare('SELECT id FROM authors WHERE name = ?').get(authorName).id
}

function getOrCreateTagId(db, tagName) {
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(tagName)
  return db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName).id
}

function replaceCharacters(db, novelId, characters) {
  db.prepare('DELETE FROM characters WHERE novel_id = ?').run(novelId)
  const insertCharacter = db.prepare(
    'INSERT INTO characters (novel_id, name, attribute, sort_order) VALUES (?, ?, ?, ?)',
  )
  characters.forEach((character, index) => {
    insertCharacter.run(novelId, character.name, character.attribute, index)
  })
}

function replaceTags(db, novelId, tags) {
  db.prepare('DELETE FROM novel_tags WHERE novel_id = ?').run(novelId)
  const insertNovelTag = db.prepare('INSERT OR IGNORE INTO novel_tags (novel_id, tag_id) VALUES (?, ?)')
  tags.forEach((tag) => {
    insertNovelTag.run(novelId, getOrCreateTagId(db, tag))
  })
}

function rowToNovel(db, row) {
  if (!row) return null

  const characters = db
    .prepare('SELECT name, attribute FROM characters WHERE novel_id = ? ORDER BY sort_order ASC, id ASC')
    .all(row.id)
  const tags = db
    .prepare(
      `SELECT tags.name
       FROM tags
       INNER JOIN novel_tags ON novel_tags.tag_id = tags.id
       WHERE novel_tags.novel_id = ?
       ORDER BY tags.name ASC`,
    )
    .all(row.id)
    .map((tag) => tag.name)

  return {
    id: row.id,
    title: row.title,
    author: row.author,
    characters,
    cpCategory: row.cp_category,
    ending: row.ending,
    status: row.status,
    rating: row.rating,
    readCount: row.read_count,
    tags,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cover: row.cover,
    favorite: Boolean(row.favorite),
  }
}

function selectNovelRows(db, whereClause = '', params = []) {
  return db
    .prepare(
      `SELECT novels.*, authors.name AS author
       FROM novels
       INNER JOIN authors ON authors.id = novels.author_id
       ${whereClause}
       ORDER BY novels.updated_at DESC, novels.id DESC`,
    )
    .all(...params)
}

export function listNovels(db) {
  return selectNovelRows(db).map((row) => rowToNovel(db, row))
}

export function getNovelById(db, id) {
  const rows = selectNovelRows(db, 'WHERE novels.id = ?', [id])
  return rowToNovel(db, rows[0])
}

export function createNovel(db, input) {
  const novel = normalizeNovelInput(input)
  const createdAt = novel.createdAt ?? new Date().toISOString().slice(0, 10)
  const updatedAt = novel.updatedAt ?? createdAt

  return runInTransaction(db, () => {
    const authorId = getOrCreateAuthorId(db, novel.author)
    const result = db
      .prepare(
        `INSERT INTO novels (
          title, author_id, cp_category, ending, status, rating, read_count,
          notes, cover, favorite, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        novel.title,
        authorId,
        novel.cpCategory ?? '1v1',
        novel.ending ?? '其他',
        novel.status ?? '看完',
        novel.rating ?? '未评价',
        novel.readCount ?? 0,
        novel.notes ?? '',
        novel.cover ?? DEFAULT_COVER,
        novel.favorite ?? 0,
        createdAt,
        updatedAt,
      )

    const novelId = Number(result.lastInsertRowid)
    replaceCharacters(db, novelId, novel.characters ?? [])
    replaceTags(db, novelId, novel.tags ?? [])
    return getNovelById(db, novelId)
  })
}

export function updateNovel(db, id, input) {
  const existing = getNovelById(db, id)
  if (!existing) return null

  const novel = normalizeNovelInput(input, { partial: true })
  const next = {
    ...existing,
    ...Object.fromEntries(Object.entries(novel).filter(([, value]) => value !== undefined)),
    updatedAt: novel.updatedAt ?? new Date().toISOString().slice(0, 10),
  }

  return runInTransaction(db, () => {
    const authorId = getOrCreateAuthorId(db, next.author)
    db.prepare(
      `UPDATE novels
       SET title = ?,
           author_id = ?,
           cp_category = ?,
           ending = ?,
           status = ?,
           rating = ?,
           read_count = ?,
           notes = ?,
           cover = ?,
           favorite = ?,
           created_at = ?,
           updated_at = ?
       WHERE id = ?`,
    ).run(
      next.title,
      authorId,
      next.cpCategory,
      next.ending,
      next.status,
      next.rating,
      next.readCount,
      next.notes,
      next.cover,
      toBooleanInteger(next.favorite),
      next.createdAt,
      next.updatedAt,
      id,
    )

    if (novel.characters !== undefined) replaceCharacters(db, id, novel.characters)
    if (novel.tags !== undefined) replaceTags(db, id, novel.tags)
    return getNovelById(db, id)
  })
}

export function deleteNovel(db, id) {
  return runInTransaction(db, () => {
    const existing = getNovelById(db, id)
    if (!existing) return false
    db.prepare('DELETE FROM characters WHERE novel_id = ?').run(id)
    db.prepare('DELETE FROM novel_tags WHERE novel_id = ?').run(id)
    db.prepare('DELETE FROM novels WHERE id = ?').run(id)
    return true
  })
}

export function clearAllNovels(db) {
  runInTransaction(db, () => {
    db.prepare('DELETE FROM novel_tags').run()
    db.prepare('DELETE FROM characters').run()
    db.prepare('DELETE FROM novels').run()
    db.prepare('DELETE FROM tags').run()
    db.prepare('DELETE FROM authors').run()
  })
}
