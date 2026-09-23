const ENDINGS = new Set(['HE', 'BE', 'OE', '坑', '其他'])
const CP_CATEGORIES = new Set(['1v1', '无CP', 'NP'])
const STATUSES = new Set(['看完', '荒废'])
const RATINGS = new Set(['喜欢', '一般', '不喜欢', '未评价'])
const CHARACTER_ATTRIBUTES = new Set(['1', '0', '0.5', '其他'])

export const CSV_REQUIRED_HEADERS = [
  '书名', '作者', '主角1', '主角1属性', '主角2', '主角2属性', 'CP类别', '结局', '阅读状态', '个人评价', '阅读次数',
]
export const CSV_OPTIONAL_HEADERS = ['标签', '备注']
export const CSV_HEADERS = [...CSV_REQUIRED_HEADERS, ...CSV_OPTIONAL_HEADERS]

// CSV form options and validation share the same business enums.
export const CSV_CORRECTION_FIELDS = [
  { field: 'title', header: '书名' },
  { field: 'author', header: '作者' },
  { field: 'character1Name', header: '主角1' },
  { field: 'character1Attribute', header: '主角1属性', options: [...CHARACTER_ATTRIBUTES] },
  { field: 'character2Name', header: '主角2' },
  { field: 'character2Attribute', header: '主角2属性', options: [...CHARACTER_ATTRIBUTES] },
  { field: 'cpCategory', header: 'CP类别', options: [...CP_CATEGORIES] },
  { field: 'ending', header: '结局', options: [...ENDINGS] },
  { field: 'status', header: '阅读状态', options: [...STATUSES] },
  { field: 'rating', header: '个人评价', options: [...RATINGS] },
  { field: 'readCount', header: '阅读次数' },
  { field: 'tags', header: '标签' },
  { field: 'notes', header: '备注' },
]
const correctionFields = new Map(CSV_CORRECTION_FIELDS.map((item) => [item.field, item]))

function pickStableCover(title, author) {
  const source = `${title}\u0000${author}`
  let hash = 2166136261
  for (const character of source) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  const covers = ['portrait', 'apple', 'cat', 'book', 'flower', 'moon', 'cloud', 'line']
  return covers[Math.abs(hash) % covers.length] ?? 'book'
}

function parseCsvRecords(text) {
  const rows = []
  let row = []
  let value = ''
  let inQuotes = false
  let lineNumber = 1
  let rowNumber = 1
  const source = String(text ?? '').replace(/^\uFEFF/, '')
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const nextCharacter = source[index + 1]
    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        value += '"'
        index += 1
      } else inQuotes = !inQuotes
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
      if (row.some((cell) => cell.trim() !== '')) rows.push({ cells: row, rowNumber })
      row = []
      value = ''
      lineNumber += 1
      rowNumber = lineNumber
      continue
    }
    if (character === '\r' || (character === '\n' && source[index - 1] !== '\r')) lineNumber += 1
    value += character
  }
  row.push(value)
  if (row.some((cell) => cell.trim() !== '')) rows.push({ cells: row, rowNumber })
  return rows
}

export function parseNovelsCsv(text) {
  return parseCsvRecords(text).map((row) => row.cells)
}

export function normalizeNovelDuplicateText(value, { stripBookMarks = false } = {}) {
  const halfWidthText = Array.from(String(value ?? '').trim(), (character) => {
    const codePoint = character.charCodeAt(0)
    if (codePoint === 0x3000) return ' '
    if (codePoint >= 0xff01 && codePoint <= 0xff5e) return String.fromCharCode(codePoint - 0xfee0)
    return character
  }).join('')
  const text = stripBookMarks ? halfWidthText.replace(/[《》]/g, '') : halfWidthText
  return text.replace(/[\s\u00a0]+/g, '').toLowerCase()
}

export function novelDuplicateKey(title, author) {
  return `${normalizeNovelDuplicateText(title, { stripBookMarks: true })}::${normalizeNovelDuplicateText(author)}`
}

function csvCell(record, header) {
  return String(record[header] ?? '').trim()
}

function parseCsvTags(value) {
  if (!value.trim()) return []
  return [...new Set(value.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean))]
}

export function applyCsvCorrections(raw, corrections = {}) {
  const record = { ...raw }
  for (const [field, value] of Object.entries(corrections)) {
    const definition = correctionFields.get(field)
    if (!definition) throw new Error(`Unknown CSV correction field: ${field}`)
    if (typeof value !== 'string') throw new Error(`CSV correction must be text: ${field}`)
    record[definition.header] = value
  }
  return record
}

export function validateCsvRow(raw, corrections = {}, rowNumber = 0) {
  const record = applyCsvCorrections(raw, corrections)
  const issues = []
  const addIssue = (field, message) => {
    const { header } = correctionFields.get(field)
    issues.push({ field, rawValue: String(raw[header] ?? ''), value: String(record[header] ?? ''), message })
  }
  const optionalEnum = (field, defaultValue) => {
    const { header, options } = correctionFields.get(field)
    const value = csvCell(record, header)
    if (!value) return defaultValue
    if (!options.includes(value)) addIssue(field, `${header} 只能是 ${options.join(' / ')}`)
    return value
  }
  const title = csvCell(record, '书名')
  const author = csvCell(record, '作者')
  if (!title) addIssue('title', '书名不能为空')
  if (!author) addIssue('author', '作者不能为空')
  const characters = [1, 2].flatMap((index) => {
    const name = csvCell(record, `主角${index}`)
    return name ? [{ name, attribute: optionalEnum(`character${index}Attribute`, '其他') }] : []
  })
  if (characters.length === 0) addIssue('character1Name', '至少需要填写一个主角')
  const readCountText = csvCell(record, '阅读次数')
  const readCount = readCountText ? Number(readCountText) : 1
  if (!Number.isInteger(readCount) || readCount < 0) addIssue('readCount', '阅读次数必须是非负整数')
  const now = new Date().toISOString().slice(0, 10)
  return {
    rowNumber,
    novel: {
      title,
      author,
      characters,
      cpCategory: optionalEnum('cpCategory', '1v1'),
      ending: optionalEnum('ending', '其他'),
      status: optionalEnum('status', '看完'),
      rating: optionalEnum('rating', '未评价'),
      readCount: Number.isInteger(readCount) && readCount >= 0 ? readCount : 1,
      tags: parseCsvTags(csvCell(record, '标签')),
      notes: csvCell(record, '备注'),
      cover: pickStableCover(title, author),
      favorite: false,
      createdAt: now,
      updatedAt: now,
    },
    errors: issues.map((issue) => issue.message),
    issues,
  }
}

export function parseCsvRows(csv) {
  if (typeof csv !== 'string' || csv.trim() === '') throw new Error('CSV content is required')
  const rows = parseCsvRecords(csv)
  if (rows.length === 0) throw new Error('CSV is empty')
  const headers = rows[0].cells.map((header) => header.trim())
  const missingHeaders = CSV_REQUIRED_HEADERS.filter((header) => !headers.includes(header))
  const allowedHeaders = new Set(CSV_HEADERS)
  const unsupportedHeaders = headers.filter((header) => header && !allowedHeaders.has(header))
  if (missingHeaders.length > 0) throw new Error(`CSV missing required headers: ${missingHeaders.join(', ')}`)
  if (unsupportedHeaders.length > 0) throw new Error(`CSV has unsupported headers: ${unsupportedHeaders.join(', ')}`)
  return rows.slice(1).map(({ cells, rowNumber }) => ({
    rowNumber,
    raw: Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])),
  }))
}

function classifyCsvRows(rows, existingKeys, mappings = []) {
  const databaseKeys = new Set(existingKeys)
  const seenImportKeys = new Set()
  const previewRows = rows.map((mapped) => {
    const key = novelDuplicateKey(mapped.novel.title, mapped.novel.author)
    const duplicateReasons = []
    if (mapped.novel.title && mapped.novel.author && databaseKeys.has(key)) duplicateReasons.push('数据库已存在相同书名和作者')
    if (mapped.novel.title && mapped.novel.author && seenImportKeys.has(key)) duplicateReasons.push('CSV 中重复书名和作者')
    const status = mapped.errors.length > 0 ? 'error' : duplicateReasons.length > 0 ? 'duplicate' : 'ready'
    if (status === 'ready' && !mapped.skipped) seenImportKeys.add(key)
    if (mapped.status === status && mapped.duplicateReasons?.join() === duplicateReasons.join()) return mapped
    return { ...mapped, status, duplicateReasons }
  })
  return {
    totalRows: previewRows.length,
    importableCount: previewRows.filter((row) => !row.skipped && row.status === 'ready').length,
    duplicateCount: previewRows.filter((row) => !row.skipped && row.status === 'duplicate').length,
    errorCount: previewRows.filter((row) => !row.skipped && row.status === 'error').length,
    skippedCount: previewRows.filter((row) => row.skipped).length,
    rows: previewRows,
    existingKeys,
    mappings,
  }
}

export function revalidateCsvImportRows(rows, existingNovels) {
  const drafts = rows.map((row) => {
    const raw = { ...row.raw }
    const corrections = { ...row.corrections }
    const original = validateCsvRow(raw, {}, row.rowNumber)
    const validated = Object.keys(corrections).length ? validateCsvRow(raw, corrections, row.rowNumber) : original
    return { ...validated, raw, originalParsed: original.novel, corrections, skipped: row.skipped === true }
  })
  return classifyCsvRows(drafts, existingNovels.map((novel) => novelDuplicateKey(novel.title, novel.author)))
}

export function createCsvImportSession(csv, existingNovels) {
  return revalidateCsvImportRows(parseCsvRows(csv), existingNovels)
}

export function createCsvImportPreview(csv, existingNovels) {
  const session = createCsvImportSession(csv, existingNovels)
  // Keep the existing Web API representation unchanged.
  return {
    totalRows: session.totalRows,
    importableCount: session.importableCount,
    duplicateCount: session.duplicateCount,
    errorCount: session.errorCount,
    rows: session.rows.map(({ rowNumber, status, errors, duplicateReasons, novel }) => ({ rowNumber, status, errors, duplicateReasons, novel })),
  }
}

function updateCsvImportRow(session, rowNumber, update) {
  const rows = session.rows.map((row) => row.rowNumber === rowNumber ? update(row) : row)
  return classifyCsvRows(rows, session.existingKeys, session.mappings)
}

function validateCorrection(row, corrections) {
  return { ...row, corrections, ...validateCsvRow(row.raw, corrections, row.rowNumber) }
}

export function correctCsvImportRow(session, rowNumber, corrections) {
  return updateCsvImportRow(session, rowNumber, (row) => validateCorrection(row, { ...row.corrections, ...corrections }))
}

export function resetCsvImportRow(session, rowNumber) {
  return updateCsvImportRow(session, rowNumber, (row) => validateCorrection(row, {}))
}

export function setCsvImportRowSkipped(session, rowNumber, skipped) {
  return updateCsvImportRow(session, rowNumber, (row) => ({ ...row, skipped }))
}

function normalizedMappingValue(value) {
  // Preserve case and punctuation: this is an explicit mapping, never a guess.
  return String(value ?? '').trim()
}

function issueGroupKey(field, rawValue) {
  return JSON.stringify([field, normalizedMappingValue(rawValue)])
}

export function applyCsvCorrectionMapping(session, mapping) {
  const definition = correctionFields.get(mapping.field)
  if (!definition?.options) throw new Error('批量映射仅支持枚举字段')
  const normalized = { ...mapping, rawValue: normalizedMappingValue(mapping.rawValue) }
  const rows = session.rows.map((row) => normalizedMappingValue(row.raw[definition.header]) === normalized.rawValue
    ? validateCorrection(row, { ...row.corrections, [mapping.field]: mapping.mappedValue })
    : row)
  const mappings = session.mappings.filter((item) => issueGroupKey(item.field, item.rawValue) !== issueGroupKey(normalized.field, normalized.rawValue))
  return classifyCsvRows(rows, session.existingKeys, [...mappings, normalized])
}

export function aggregateCsvIssues(session) {
  const groups = new Map()
  for (const row of session.rows) {
    if (row.skipped || row.status !== 'error') continue
    for (const issue of row.issues) {
      const key = issueGroupKey(issue.field, issue.rawValue)
      if (!groups.has(key)) {
        groups.set(key, { key, field: issue.field, rawValue: normalizedMappingValue(issue.rawValue), message: issue.message, rowNumbers: [] })
      }
      groups.get(key).rowNumbers.push(row.rowNumber)
    }
  }
  return [...groups.values()].sort((a, b) => b.rowNumbers.length - a.rowNumbers.length)
}

export function paginateCsvRows(session, { status, page = 1, pageSize = 50, groupKey } = {}) {
  const rows = session.rows.filter((row) => {
    if (status === 'skipped' ? !row.skipped : row.skipped || row.status !== status) return false
    return !groupKey || row.issues.some((issue) => issueGroupKey(issue.field, issue.rawValue) === groupKey)
  })
  const size = Math.max(1, Math.min(100, Math.floor(pageSize) || 50))
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const currentPage = Math.max(1, Math.min(pageCount, Math.floor(page) || 1))
  return { rows: rows.slice((currentPage - 1) * size, currentPage * size), totalRows: rows.length, page: currentPage, pageCount }
}

export function formatCsvConfirmSummary(session) {
  return `准备导入：${session.importableCount}\n重复跳过：${session.duplicateCount}\n异常未处理跳过：${session.errorCount}\n人工跳过：${session.skippedCount}`
}

function escapeCsvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function mapNovelToCsvRow(novel) {
  const [firstCharacter, secondCharacter, ...extraCharacters] = novel.characters
  const extraCharacterNote = extraCharacters.length > 0
    ? `额外主角：${extraCharacters.map((character) => `${character.name} ${character.attribute}`).join('；')}`
    : ''
  return [
    novel.title, novel.author, firstCharacter?.name ?? '', firstCharacter?.attribute ?? '', secondCharacter?.name ?? '',
    secondCharacter?.attribute ?? '', novel.cpCategory, novel.ending, novel.status, novel.rating, novel.readCount,
    novel.tags.join('，'), [novel.notes, extraCharacterNote].filter(Boolean).join('\n'),
  ]
}

export function serializeNovelsCsv(novels) {
  const content = [CSV_HEADERS, ...novels.map(mapNovelToCsvRow)]
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\r\n')
  return `\uFEFF${content}`
}
