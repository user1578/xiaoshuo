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

export function parseNovelsCsv(text) {
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
  ].filter((character) => character.name).map((character, index) => ({
    name: character.name,
    attribute: normalizeCsvOptionalEnum(character.attribute, CHARACTER_ATTRIBUTES, '其他', `主角${index + 1}属性`, errors),
  }))
  if (characters.length === 0) errors.push('至少需要填写一个主角')
  const readCountText = csvCell(record, '阅读次数')
  const readCount = readCountText ? Number(readCountText) : 1
  if (!Number.isInteger(readCount) || readCount < 0) errors.push('阅读次数必须是非负整数')
  const now = new Date().toISOString().slice(0, 10)
  return {
    rowNumber,
    novel: {
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
      cover: pickStableCover(title, author),
      favorite: false,
      createdAt: now,
      updatedAt: now,
    },
    errors,
  }
}

export function createCsvImportPreview(csv, existingNovels) {
  if (typeof csv !== 'string' || csv.trim() === '') throw new Error('CSV content is required')
  const rows = parseNovelsCsv(csv)
  if (rows.length === 0) throw new Error('CSV is empty')
  const headers = rows[0].map((header) => header.trim())
  const missingHeaders = CSV_REQUIRED_HEADERS.filter((header) => !headers.includes(header))
  const allowedHeaders = new Set(CSV_HEADERS)
  const unsupportedHeaders = headers.filter((header) => header && !allowedHeaders.has(header))
  if (missingHeaders.length > 0) throw new Error(`CSV missing required headers: ${missingHeaders.join(', ')}`)
  if (unsupportedHeaders.length > 0) throw new Error(`CSV has unsupported headers: ${unsupportedHeaders.join(', ')}`)
  const existingKeys = new Set(existingNovels.map((novel) => novelDuplicateKey(novel.title, novel.author)))
  const seenImportKeys = new Set()
  const previewRows = rows.slice(1).map((cells, index) => {
    const record = Object.fromEntries(headers.map((header, headerIndex) => [header, cells[headerIndex] ?? '']))
    const mapped = mapCsvRecord(record, index + 2)
    const key = novelDuplicateKey(mapped.novel.title, mapped.novel.author)
    const duplicateReasons = []
    if (mapped.novel.title && mapped.novel.author && existingKeys.has(key)) duplicateReasons.push('数据库已存在相同书名和作者')
    if (mapped.novel.title && mapped.novel.author && seenImportKeys.has(key)) duplicateReasons.push('CSV 中重复书名和作者')
    const status = mapped.errors.length > 0 ? 'error' : duplicateReasons.length > 0 ? 'duplicate' : 'ready'
    if (status === 'ready') seenImportKeys.add(key)
    return { rowNumber: mapped.rowNumber, status, errors: mapped.errors, duplicateReasons, novel: mapped.novel }
  })
  return {
    totalRows: previewRows.length,
    importableCount: previewRows.filter((row) => row.status === 'ready').length,
    duplicateCount: previewRows.filter((row) => row.status === 'duplicate').length,
    errorCount: previewRows.filter((row) => row.status === 'error').length,
    rows: previewRows,
  }
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
