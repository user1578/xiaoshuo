import type { Character, CoverStyle, Novel } from '../../types/novel'

declare const parsedMobileBackupBrand: unique symbol

export type PortableCoverMetadata = {
  kind: 'local'
  included: false
}

export type PortableBackupNovel = Omit<Novel, 'id' | 'coverImagePath'> & {
  id?: number
  coverImage?: PortableCoverMetadata
}

export type PortableNovelBackup = {
  exportedAt?: string
  count: number
  novels: PortableBackupNovel[]
}

export type ParsedMobileBackup = PortableNovelBackup & {
  readonly [parsedMobileBackupBrand]: true
}

export type BackupValidationIssue = {
  path: string
  message: string
}

export type MobileBackupValidationResult = {
  parsed: ParsedMobileBackup | null
  issues: BackupValidationIssue[]
  duplicateNovelKeys: string[]
}

export type MobileBackupPreview = {
  sourceCount: number
  validCount: number
  errorCount: number
  targetCount: number
  duplicateNovelKeys: string[]
  issues: BackupValidationIssue[]
  canRestore: boolean
}

export type MobileBackupRestoreResult = {
  importedAt: string
  count: number
  novels: Novel[]
  releasedCoverPaths: string[]
}

type MobileBackupRepository = {
  listNovels(): Promise<Novel[]>
  replaceAllFromBackup(backupNovels: PortableBackupNovel[]): Promise<{
    count: number
    novels: Novel[]
    releasedCoverPaths: string[]
  }>
}

const CHARACTER_ATTRIBUTES = new Set<Character['attribute']>(['1', '0', '0.5', '其他'])
const CP_CATEGORIES = new Set<Novel['cpCategory']>(['1v1', '无CP', 'NP'])
const ENDINGS = new Set<Novel['ending']>(['HE', 'BE', 'OE', '坑', '其他'])
const STATUSES = new Set<Novel['status']>(['看完', '荒废'])
const RATINGS = new Set<Novel['rating']>(['喜欢', '一般', '不喜欢', '未评价'])
const COVERS = new Set<CoverStyle>(['portrait', 'apple', 'cat', 'book', 'flower', 'moon', 'cloud', 'line'])
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function addIssue(issues: BackupValidationIssue[], path: string, message: string) {
  issues.push({ path, message })
}

function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isSupportedDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (isValidDateOnly(value)) return true
  if (!ISO_DATETIME_PATTERN.test(value) || !isValidDateOnly(value.slice(0, 10))) return false
  return Number.isFinite(Date.parse(value))
}

export function normalizeImportedEnding(value: unknown): Novel['ending'] | null {
  if (value === '未完结') return '坑'
  if (value === '未知') return '其他'
  return typeof value === 'string' && ENDINGS.has(value as Novel['ending']) ? (value as Novel['ending']) : null
}

function readNonEmptyString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: BackupValidationIssue[],
): string | null {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    addIssue(issues, path, 'must be a nonempty string')
    return null
  }
  return value.trim()
}

function readCharacters(
  value: unknown,
  path: string,
  issues: BackupValidationIssue[],
): Character[] | null {
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'must be an array')
    return null
  }

  const characters: Character[] = []
  const issueCount = issues.length
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(item)) {
      addIssue(issues, itemPath, 'must be an object')
      return
    }
    const name = readNonEmptyString(item, 'name', `${itemPath}.name`, issues)
    const attribute = item.attribute
    if (typeof attribute !== 'string' || !CHARACTER_ATTRIBUTES.has(attribute as Character['attribute'])) {
      addIssue(issues, `${itemPath}.attribute`, 'is not an allowed character attribute')
      return
    }
    if (name) characters.push({ name, attribute: attribute as Character['attribute'] })
  })

  return issues.length === issueCount ? characters : null
}

function readTags(value: unknown, path: string, issues: BackupValidationIssue[]): string[] | null {
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'must be an array')
    return null
  }

  const tags: string[] = []
  const issueCount = issues.length
  value.forEach((tag, index) => {
    if (typeof tag !== 'string') {
      addIssue(issues, `${path}[${index}]`, 'must be a string')
      return
    }
    tags.push(tag.trim())
  })
  return issues.length === issueCount ? tags : null
}

function readCoverImage(value: unknown, path: string, issues: BackupValidationIssue[]): PortableCoverMetadata | undefined {
  if (value === undefined) return undefined
  if (isRecord(value) && value.kind === 'local' && value.included === false) {
    return { kind: 'local', included: false }
  }
  addIssue(issues, path, 'must be { kind: "local", included: false } when present')
  return undefined
}

function parseNovel(
  rawNovel: unknown,
  index: number,
  issues: BackupValidationIssue[],
): PortableBackupNovel | null {
  const path = `novels[${index}]`
  if (!isRecord(rawNovel)) {
    addIssue(issues, path, 'must be an object')
    return null
  }

  const issueCount = issues.length
  let id: number | undefined
  if (hasOwn(rawNovel, 'id')) {
    if (typeof rawNovel.id !== 'number' || !Number.isInteger(rawNovel.id) || rawNovel.id <= 0) {
      addIssue(issues, `${path}.id`, 'must be a positive integer when present')
    } else {
      id = rawNovel.id
    }
  }

  const title = readNonEmptyString(rawNovel, 'title', `${path}.title`, issues)
  const author = readNonEmptyString(rawNovel, 'author', `${path}.author`, issues)
  const characters = readCharacters(rawNovel.characters, `${path}.characters`, issues)
  const cpCategory = rawNovel.cpCategory
  if (typeof cpCategory !== 'string' || !CP_CATEGORIES.has(cpCategory as Novel['cpCategory'])) {
    addIssue(issues, `${path}.cpCategory`, 'is not an allowed CP category')
  }
  const ending = normalizeImportedEnding(rawNovel.ending)
  if (!ending) addIssue(issues, `${path}.ending`, 'is not an allowed ending')
  const status = rawNovel.status
  if (typeof status !== 'string' || !STATUSES.has(status as Novel['status'])) {
    addIssue(issues, `${path}.status`, 'is not an allowed read status')
  }
  const rating = rawNovel.rating
  if (typeof rating !== 'string' || !RATINGS.has(rating as Novel['rating'])) {
    addIssue(issues, `${path}.rating`, 'is not an allowed rating')
  }
  const readCount = rawNovel.readCount
  if (typeof readCount !== 'number' || !Number.isInteger(readCount) || readCount < 0) {
    addIssue(issues, `${path}.readCount`, 'must be a nonnegative integer')
  }
  const tags = readTags(rawNovel.tags, `${path}.tags`, issues)
  const notes = rawNovel.notes
  if (typeof notes !== 'string') addIssue(issues, `${path}.notes`, 'must be a string')
  const createdAt = rawNovel.createdAt
  if (!isSupportedDate(createdAt)) addIssue(issues, `${path}.createdAt`, 'must be YYYY-MM-DD or an ISO-8601 datetime')
  const updatedAt = rawNovel.updatedAt
  if (!isSupportedDate(updatedAt)) addIssue(issues, `${path}.updatedAt`, 'must be YYYY-MM-DD or an ISO-8601 datetime')
  const cover = rawNovel.cover
  if (typeof cover !== 'string' || !COVERS.has(cover as CoverStyle)) {
    addIssue(issues, `${path}.cover`, 'is not an allowed CoverArt style')
  }
  const favorite = rawNovel.favorite
  if (typeof favorite !== 'boolean') addIssue(issues, `${path}.favorite`, 'must be a boolean')
  const coverImage = readCoverImage(rawNovel.coverImage, `${path}.coverImage`, issues)

  if (
    issues.length !== issueCount ||
    title === null ||
    author === null ||
    characters === null ||
    tags === null ||
    !ending ||
    typeof cpCategory !== 'string' ||
    typeof status !== 'string' ||
    typeof rating !== 'string' ||
    typeof readCount !== 'number' ||
    typeof notes !== 'string' ||
    !isSupportedDate(createdAt) ||
    !isSupportedDate(updatedAt) ||
    typeof cover !== 'string' ||
    typeof favorite !== 'boolean'
  ) {
    return null
  }

  return {
    ...(id === undefined ? {} : { id }),
    title,
    author,
    characters,
    cpCategory: cpCategory as Novel['cpCategory'],
    ending,
    status: status as Novel['status'],
    rating: rating as Novel['rating'],
    readCount,
    tags,
    notes,
    createdAt,
    updatedAt,
    cover: cover as CoverStyle,
    favorite,
    ...(coverImage ? { coverImage } : {}),
  }
}

function sourceNovelCount(raw: unknown): number {
  return isRecord(raw) && Array.isArray(raw.novels) ? raw.novels.length : 0
}

export function validateMobileBackup(raw: unknown): MobileBackupValidationResult {
  const issues: BackupValidationIssue[] = []
  const duplicateNovelKeys: string[] = []
  if (!isRecord(raw)) {
    addIssue(issues, 'backup', 'must be an object containing a novels array')
    return { parsed: null, issues, duplicateNovelKeys }
  }
  if (!Array.isArray(raw.novels)) {
    addIssue(issues, 'novels', 'must be an array')
    return { parsed: null, issues, duplicateNovelKeys }
  }
  if (hasOwn(raw, 'count')) {
    if (typeof raw.count !== 'number' || !Number.isInteger(raw.count) || raw.count !== raw.novels.length) {
      addIssue(issues, 'count', 'must equal the novels array length')
    }
  }
  if (hasOwn(raw, 'exportedAt') && !isSupportedDate(raw.exportedAt)) {
    addIssue(issues, 'exportedAt', 'must be YYYY-MM-DD or an ISO-8601 datetime when present')
  }

  const parsedNovels: PortableBackupNovel[] = []
  const seenIds = new Map<number, number>()
  const normalizedNovelKeys = new Map<string, number>()
  raw.novels.forEach((novel, index) => {
    const parsedNovel = parseNovel(novel, index, issues)
    if (!parsedNovel) return

    if (parsedNovel.id !== undefined) {
      const originalIndex = seenIds.get(parsedNovel.id)
      if (originalIndex !== undefined) {
        addIssue(issues, `novels[${originalIndex}].id`, 'duplicates another backup ID')
        addIssue(issues, `novels[${index}].id`, 'duplicates another backup ID')
      } else {
        seenIds.set(parsedNovel.id, index)
      }
    }
    const normalizedKey = `${parsedNovel.title.toLocaleLowerCase()}\u0000${parsedNovel.author.toLocaleLowerCase()}`
    if (normalizedNovelKeys.has(normalizedKey)) {
      duplicateNovelKeys.push(normalizedKey)
    } else {
      normalizedNovelKeys.set(normalizedKey, index)
    }
    parsedNovels.push(parsedNovel)
  })

  if (issues.length > 0) {
    return { parsed: null, issues, duplicateNovelKeys }
  }

  return {
    parsed: {
      count: parsedNovels.length,
      ...(typeof raw.exportedAt === 'string' ? { exportedAt: raw.exportedAt } : {}),
      novels: parsedNovels,
    } as ParsedMobileBackup,
    issues,
    duplicateNovelKeys,
  }
}

export function previewMobileBackup(raw: unknown, targetCount: number): MobileBackupPreview {
  const validation = validateMobileBackup(raw)
  const sourceCount = sourceNovelCount(raw)
  const invalidNovelIndexes = new Set(
    validation.issues
      .map((issue) => /^novels\[(\d+)\]/.exec(issue.path)?.[1])
      .filter((index): index is string => index !== undefined),
  )

  return {
    sourceCount,
    validCount: validation.parsed?.novels.length ?? Math.max(0, sourceCount - invalidNovelIndexes.size),
    errorCount: validation.issues.length,
    targetCount,
    duplicateNovelKeys: validation.duplicateNovelKeys,
    issues: validation.issues,
    canRestore: validation.issues.length === 0 && validation.parsed !== null,
  }
}

export async function restoreMobileBackup(
  repository: MobileBackupRepository,
  parsedBackup: ParsedMobileBackup,
): Promise<MobileBackupRestoreResult> {
  const result = await repository.replaceAllFromBackup(parsedBackup.novels)

  return {
    importedAt: new Date().toISOString(),
    count: result.count,
    novels: result.novels,
    releasedCoverPaths: result.releasedCoverPaths,
  }
}

export async function exportMobileBackup(repository: Pick<MobileBackupRepository, 'listNovels'>): Promise<PortableNovelBackup> {
  const novels = await repository.listNovels()
  const portableNovels = novels.map((novel) => {
    const { coverImagePath, ...portableNovel } = novel
    return {
      ...portableNovel,
      ...(coverImagePath ? { coverImage: { kind: 'local' as const, included: false as const } } : {}),
    }
  })

  return {
    exportedAt: new Date().toISOString(),
    count: portableNovels.length,
    novels: portableNovels,
  }
}
