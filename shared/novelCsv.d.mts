export type CsvNovel = {
  title: string
  author: string
  characters: { name: string; attribute: '1' | '0' | '0.5' | '其他' }[]
  cpCategory: '1v1' | '无CP' | 'NP'
  ending: 'HE' | 'BE' | 'OE' | '未完结' | '未知' | '坑' | '其他'
  status: '看完' | '荒废'
  rating: '喜欢' | '一般' | '不喜欢' | '未评价'
  readCount: number
  tags: string[]
  notes: string
  createdAt?: string
  updatedAt?: string
  cover?: string
  favorite?: boolean
}
export type CsvPreviewRow = { rowNumber: number; status: 'ready' | 'duplicate' | 'error'; errors: string[]; duplicateReasons: string[]; novel: CsvNovel }
export type CsvImportPreview = { totalRows: number; importableCount: number; duplicateCount: number; errorCount: number; rows: CsvPreviewRow[] }
export const CSV_REQUIRED_HEADERS: string[]
export const CSV_OPTIONAL_HEADERS: string[]
export const CSV_HEADERS: string[]
export function parseNovelsCsv(text: string): string[][]
export function normalizeNovelDuplicateText(value: unknown, options?: { stripBookMarks?: boolean }): string
export function novelDuplicateKey(title: unknown, author: unknown): string
export function createCsvImportPreview(csv: string, existingNovels: Pick<CsvNovel, 'title' | 'author'>[]): CsvImportPreview
export function serializeNovelsCsv(novels: CsvNovel[]): string

export type CsvCorrectionField = 'title' | 'author' | 'character1Name' | 'character1Attribute' | 'character2Name' | 'character2Attribute' | 'cpCategory' | 'ending' | 'status' | 'rating' | 'readCount' | 'tags' | 'notes'
export type CsvCorrections = Partial<Record<CsvCorrectionField, string>>
export type CsvDraftInput = { rowNumber: number; raw: Record<string, string>; corrections?: CsvCorrections; skipped?: boolean }
export type CsvIssue = { field: CsvCorrectionField; rawValue: string; value: string; message: string }
export type CsvImportDraftRow = CsvPreviewRow & {
  raw: Record<string, string>
  originalParsed: CsvNovel
  corrections: CsvCorrections
  issues: CsvIssue[]
  skipped: boolean
}
export type CsvCorrectionMapping = { field: CsvCorrectionField; rawValue: string; mappedValue: string }
export type CsvIssueGroup = { key: string; field: CsvCorrectionField; rawValue: string; message: string; rowNumbers: number[] }
export type CsvImportSession = Omit<CsvImportPreview, 'rows'> & {
  rows: CsvImportDraftRow[]
  skippedCount: number
  existingKeys: string[]
  mappings: CsvCorrectionMapping[]
}
export type CsvImportTab = CsvPreviewRow['status'] | 'skipped'
export const CSV_CORRECTION_FIELDS: { field: CsvCorrectionField; header: string; options?: string[] }[]
export function parseCsvRows(csv: string): Pick<CsvDraftInput, 'rowNumber' | 'raw'>[]
export function applyCsvCorrections(raw: Record<string, string>, corrections?: CsvCorrections): Record<string, string>
export function validateCsvRow(raw: Record<string, string>, corrections?: CsvCorrections, rowNumber?: number): { rowNumber: number; novel: CsvNovel; errors: string[]; issues: CsvIssue[] }
export function createCsvImportSession(csv: string, existingNovels: Pick<CsvNovel, 'title' | 'author'>[]): CsvImportSession
export function revalidateCsvImportRows(rows: CsvDraftInput[], existingNovels: Pick<CsvNovel, 'title' | 'author'>[]): CsvImportSession
export function correctCsvImportRow(session: CsvImportSession, rowNumber: number, corrections: CsvCorrections): CsvImportSession
export function resetCsvImportRow(session: CsvImportSession, rowNumber: number): CsvImportSession
export function setCsvImportRowSkipped(session: CsvImportSession, rowNumber: number, skipped: boolean): CsvImportSession
export function applyCsvCorrectionMapping(session: CsvImportSession, mapping: CsvCorrectionMapping): CsvImportSession
export function aggregateCsvIssues(session: CsvImportSession): CsvIssueGroup[]
export function paginateCsvRows(session: CsvImportSession, options: { status: CsvImportTab; page?: number; pageSize?: number; groupKey?: string | null }): { rows: CsvImportDraftRow[]; totalRows: number; page: number; pageCount: number }
export function formatCsvConfirmSummary(session: Pick<CsvImportSession, 'importableCount' | 'duplicateCount' | 'errorCount' | 'skippedCount'>): string
