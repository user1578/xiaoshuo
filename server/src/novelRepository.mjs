import { runInTransaction } from './db.mjs'

const ENDINGS = new Set(['HE', 'BE', 'OE', '坑', '其他'])
const CP_CATEGORIES = new Set(['1v1', '无CP', 'NP'])
const STATUSES = new Set(['看完', '荒废'])
const RATINGS = new Set(['喜欢', '一般', '不喜欢', '未评价'])
const CHARACTER_ATTRIBUTES = new Set(['1', '0', '0.5', '其他'])

const DEFAULT_COVER = 'book'
const REQUIRED_CSV_HEADERS = [
  '书名',
  '作者',
  '主角1',
  '主角1属性',
  '主角2',
  '主角2属性',
  'CP类别',
  '结局',
  '阅读状态',
  '个人评价',
  '阅读次数',
]
const OPTIONAL_CSV_HEADERS = ['标签', '备注']

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

function assertEnumValue(value, allowedValues, fieldName) {
  if (!allowedValues.has(value)) {
    throw Object.assign(new Error(`${fieldName} is invalid`), { statusCode: 400 })
  }
  return value
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

function clearNovelTables(db) {
  db.prepare('DELETE FROM novel_tags').run()
  db.prepare('DELETE FROM characters').run()
  db.prepare('DELETE FROM novels').run()
  db.prepare('DELETE FROM tags').run()
  db.prepare('DELETE FROM authors').run()
}

function insertNovelRecord(db, novel) {
  const createdAt = novel.createdAt ?? new Date().toISOString().slice(0, 10)
  const updatedAt = novel.updatedAt ?? createdAt
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
  return novelId
}

function validateImportCharacter(character, novelIndex, characterIndex) {
  if (!character || typeof character !== 'object') {
    throw Object.assign(new Error(`novels[${novelIndex}].characters[${characterIndex}] is invalid`), { statusCode: 400 })
  }

  return {
    name: assertString(character.name, `novels[${novelIndex}].characters[${characterIndex}].name`),
    attribute: assertEnumValue(
      character.attribute,
      CHARACTER_ATTRIBUTES,
      `novels[${novelIndex}].characters[${characterIndex}].attribute`,
    ),
  }
}

function validateImportNovel(novel, index) {
  if (!novel || typeof novel !== 'object') {
    throw Object.assign(new Error(`novels[${index}] is invalid`), { statusCode: 400 })
  }
  if (!Array.isArray(novel.characters)) {
    throw Object.assign(new Error(`novels[${index}].characters must be an array`), { statusCode: 400 })
  }

  const readCount = Number(novel.readCount)
  if (!Number.isInteger(readCount) || readCount < 0) {
    throw Object.assign(new Error(`novels[${index}].readCount is invalid`), { statusCode: 400 })
  }

  return {
    title: assertString(novel.title, `novels[${index}].title`),
    author: assertString(novel.author, `novels[${index}].author`),
    characters: novel.characters.map((character, characterIndex) =>
      validateImportCharacter(character, index, characterIndex),
    ),
    cpCategory: assertEnumValue(novel.cpCategory, CP_CATEGORIES, `novels[${index}].cpCategory`),
    ending: assertEnumValue(novel.ending, ENDINGS, `novels[${index}].ending`),
    status: assertEnumValue(novel.status, STATUSES, `novels[${index}].status`),
    rating: assertEnumValue(novel.rating, RATINGS, `novels[${index}].rating`),
    readCount,
    tags: Array.isArray(novel.tags)
      ? [...new Set(novel.tags.filter((tag) => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean))]
      : [],
    notes: novel.notes === undefined ? '' : String(novel.notes),
    cover: novel.cover === undefined ? DEFAULT_COVER : String(novel.cover || DEFAULT_COVER),
    favorite: toBooleanInteger(novel.favorite),
    createdAt: novel.createdAt === undefined ? new Date().toISOString().slice(0, 10) : String(novel.createdAt),
    updatedAt: novel.updatedAt === undefined ? new Date().toISOString().slice(0, 10) : String(novel.updatedAt),
  }
}

function validateImportPayload(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.novels)) {
    throw Object.assign(new Error('Backup JSON must contain a novels array'), { statusCode: 400 })
  }

  return input.novels.map((novel, index) => validateImportNovel(novel, index))
}

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let inQuotes = false
  const source = String(text ?? '').replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const nextCharacter = source[index + 1]

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        value += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === ',' && !inQuotes) {
      row.push(value)
      value = ''
      continue
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') index += 1
      row.push(value)
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      value = ''
      continue
    }

    value += character
  }

  row.push(value)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)

  return rows
}

function normalizeDuplicateText(value, { stripBookMarks = false } = {}) {
  const halfWidthText = Array.from(String(value ?? '').trim(), (character) => {
    const codePoint = character.charCodeAt(0)
    if (codePoint === 0x3000) return ' '
    if (codePoint >= 0xff01 && codePoint <= 0xff5e) return String.fromCharCode(codePoint - 0xfee0)
    return character
  }).join('')
  const text = stripBookMarks ? halfWidthText.replace(/[《》]/g, '') : halfWidthText

  return text.replace(/[\s\u00a0]+/g, '').toLowerCase()
}

function duplicateKey(title, author) {
  return `${normalizeDuplicateText(title, { stripBookMarks: true })}::${normalizeDuplicateText(author)}`
}

function csvCell(record, header) {
  return String(record[header] ?? '').trim()
}

function parseCsvTags(value) {
  if (!value.trim()) return []
  return [...new Set(value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean))]
}

function normalizeCsvOptionalEnum(value, allowedValues, defaultValue, fieldName, errors) {
  if (!value) return defaultValue
  if (allowedValues.has(value)) return value
  errors.push(`${fieldName} 只能是 ${Array.from(allowedValues).join(' / ')}`)
  return value
}

function mapCsvRecord(record, rowNumber) {
  const errors = []
  const title = csvCell(record, '书名')
  const author = csvCell(record, '作者')

  if (!title) errors.push('书名不能为空')
  if (!author) errors.push('作者不能为空')

  const characters = [
    { name: csvCell(record, '主角1'), attribute: csvCell(record, '主角1属性') },
    { name: csvCell(record, '主角2'), attribute: csvCell(record, '主角2属性') },
  ]
    .filter((character) => character.name)
    .map((character, index) => ({
      name: character.name,
      attribute: normalizeCsvOptionalEnum(
        character.attribute,
        CHARACTER_ATTRIBUTES,
        '其他',
        `主角${index + 1}属性`,
        errors,
      ),
    }))

  if (characters.length === 0) errors.push('至少需要填写一个主角')

  const readCountText = csvCell(record, '阅读次数')
  const readCount = readCountText ? Number(readCountText) : 1
  if (!Number.isInteger(readCount) || readCount < 0) errors.push('阅读次数必须是非负整数')

  const now = new Date().toISOString().slice(0, 10)
  const novel = {
    title,
    author,
    characters,
    cpCategory: normalizeCsvOptionalEnum(csvCell(record, 'CP类别'), CP_CATEGORIES, '1v1', 'CP类别', errors),
    ending: normalizeCsvOptionalEnum(csvCell(record, '结局'), ENDINGS, '其他', '结局', errors),
    status: normalizeCsvOptionalEnum(csvCell(record, '阅读状态'), STATUSES, '看完', '阅读状态', errors),
    rating: normalizeCsvOptionalEnum(csvCell(record, '个人评价'), RATINGS, '未评价', '个人评价', errors),
    readCount: Number.isInteger(readCount) && readCount >= 0 ? readCount : 1,
    tags: parseCsvTags(csvCell(record, '标签')),
    notes: csvCell(record, '备注'),
    cover: DEFAULT_COVER,
    favorite: 0,
    createdAt: now,
    updatedAt: now,
  }

  return {
    rowNumber,
    novel,
    errors,
  }
}

function readCsvInput(input) {
  const csv = typeof input === 'string' ? input : input?.csv
  if (typeof csv !== 'string' || csv.trim() === '') {
    throw Object.assign(new Error('CSV content is required'), { statusCode: 400 })
  }
  return csv
}

function buildCsvImportPreview(db, input) {
  const rows = parseCsv(readCsvInput(input))
  if (rows.length === 0) {
    throw Object.assign(new Error('CSV is empty'), { statusCode: 400 })
  }

  const headers = rows[0].map((header) => header.trim())
  const missingHeaders = REQUIRED_CSV_HEADERS.filter((header) => !headers.includes(header))
  const allowedHeaders = new Set([...REQUIRED_CSV_HEADERS, ...OPTIONAL_CSV_HEADERS])
  const unsupportedHeaders = headers.filter((header) => header && !allowedHeaders.has(header))

  if (missingHeaders.length > 0) {
    throw Object.assign(new Error(`CSV missing required headers: ${missingHeaders.join(', ')}`), { statusCode: 400 })
  }
  if (unsupportedHeaders.length > 0) {
    throw Object.assign(new Error(`CSV has unsupported headers: ${unsupportedHeaders.join(', ')}`), { statusCode: 400 })
  }

  const existingKeys = new Set(listNovels(db).map((novel) => duplicateKey(novel.title, novel.author)))
  const seenImportKeys = new Set()
  const dataRows = rows.slice(1)

  const previewRows = dataRows.map((cells, index) => {
    const record = Object.fromEntries(headers.map((header, headerIndex) => [header, cells[headerIndex] ?? '']))
    const mapped = mapCsvRecord(record, index + 2)
    const key = duplicateKey(mapped.novel.title, mapped.novel.author)
    const duplicateReasons = []

    if (mapped.novel.title && mapped.novel.author && existingKeys.has(key)) duplicateReasons.push('数据库已存在相同书名和作者')
    if (mapped.novel.title && mapped.novel.author && seenImportKeys.has(key)) duplicateReasons.push('CSV 中重复书名和作者')

    let status = 'ready'
    if (mapped.errors.length > 0) {
      status = 'error'
    } else if (duplicateReasons.length > 0) {
      status = 'duplicate'
    } else {
      seenImportKeys.add(key)
    }

    return {
      rowNumber: mapped.rowNumber,
      status,
      errors: mapped.errors,
      duplicateReasons,
      novel: mapped.novel,
    }
  })

  return {
    totalRows: previewRows.length,
    importableCount: previewRows.filter((row) => row.status === 'ready').length,
    duplicateCount: previewRows.filter((row) => row.status === 'duplicate').length,
    errorCount: previewRows.filter((row) => row.status === 'error').length,
    rows: previewRows,
  }
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

  return runInTransaction(db, () => {
    const novelId = insertNovelRecord(db, novel)
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
    clearNovelTables(db)
  })
}

export function importNovelBackup(db, input) {
  const novels = validateImportPayload(input)

  return runInTransaction(db, () => {
    clearNovelTables(db)
    novels.forEach((novel) => insertNovelRecord(db, novel))

    return {
      importedAt: new Date().toISOString(),
      count: novels.length,
      novels: listNovels(db),
    }
  })
}

export function previewCsvImport(db, input) {
  return buildCsvImportPreview(db, input)
}

export function confirmCsvImport(db, input) {
  const preview = buildCsvImportPreview(db, input)
  const importableRows = preview.rows.filter((row) => row.status === 'ready')

  return runInTransaction(db, () => {
    importableRows.forEach((row) => insertNovelRecord(db, row.novel))

    return {
      importedAt: new Date().toISOString(),
      importedCount: importableRows.length,
      duplicateCount: preview.duplicateCount,
      errorCount: preview.errorCount,
      novels: listNovels(db),
    }
  })
}
