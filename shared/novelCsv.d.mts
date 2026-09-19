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
