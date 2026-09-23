import { describe, expect, it } from 'vitest'
import * as csv from './novelCsv.mjs'

const headers = '书名,作者,主角1,主角1属性,主角2,主角2属性,CP类别,结局,阅读状态,个人评价,阅读次数,标签,备注'
function generatedRow(index, overrides = {}) {
  const values = { title: `生成书${index}`, author: '生成作者', character1Name: '甲', character1Attribute: '1', character2Name: '', character2Attribute: '', cpCategory: '1v1', ending: 'HE', status: '看完', rating: '喜欢', readCount: '1', tags: '', notes: '', ...overrides }
  return Object.values(values).map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')
}
const source = (rows) => `${headers}\n${rows.join('\n')}`

describe('CSV correction sessions', () => {
  it.each([
    ['rating', '超喜欢', '喜欢', '个人评价'],
    ['status', '完结', '看完', '阅读状态'],
    ['cpCategory', '1V1', '1v1', 'CP类别'],
    ['ending', '大团圆', 'HE', '结局'],
    ['readCount', 'abc', '3', '阅读次数'],
    ['title', '', '补上书名', '书名'],
    ['author', '', '补上作者', '作者'],
    ['character1Name', '', '补上主角', '主角1'],
    ['character1Attribute', '攻', '1', '主角1属性'],
  ])('corrects %s through the validator while preserving raw values', (field, invalid, valid, header) => {
    const original = csv.createCsvImportSession(source([generatedRow(1, { [field]: invalid })]), [])
    expect(original.rows[0].status).toBe('error')
    expect(original.rows[0].issues).toEqual(expect.arrayContaining([expect.objectContaining({ field, rawValue: invalid })]))
    const corrected = csv.correctCsvImportRow(original, 2, { [field]: valid })
    expect(corrected).toMatchObject({ importableCount: 1, errorCount: 0 })
    expect(corrected.rows[0]).toMatchObject({ raw: { [header]: invalid }, corrections: { [field]: valid }, status: 'ready' })
    expect(corrected.rows[0].originalParsed).toEqual(original.rows[0].originalParsed)
    expect(original.rows[0].corrections).toEqual({})
    const final = csv.revalidateCsvImportRows(corrected.rows, [])
    expect(final.rows[0].novel).toEqual(corrected.rows[0].novel)
    expect(csv.resetCsvImportRow(corrected, 2).rows[0].status).toBe('error')
  })

  it('keeps invalid corrections unresolved and attributes second-character errors correctly', () => {
    const session = csv.createCsvImportSession(source([generatedRow(1, { character1Name: '', character2Name: '乙', character2Attribute: '未知属性' })]), [])
    expect(session.rows[0].issues).toEqual([expect.objectContaining({ field: 'character2Attribute', rawValue: '未知属性' })])
    const invalid = csv.correctCsvImportRow(session, 2, { character2Attribute: '仍非法' })
    expect(invalid.rows[0]).toMatchObject({ status: 'error', issues: [expect.objectContaining({ rawValue: '未知属性', value: '仍非法' })] })
    expect(csv.correctCsvImportRow(invalid, 2, { character2Attribute: '0.5' }).rows[0].novel.characters).toEqual([{ name: '乙', attribute: '0.5' }])
  })

  it('normalizes corrected payloads including text, tags, notes and read counts', () => {
    const session = csv.createCsvImportSession(source([generatedRow(1, { title: '', readCount: 'abc' })]), [])
    const next = csv.correctCsvImportRow(session, 2, { title: ' 新书 ', author: ' 新作者 ', readCount: '3', tags: '甲，乙,甲', notes: ' 新备注\n第二行 ', character1Name: ' 新主角 ' })
    expect(next.rows[0].novel).toMatchObject({ title: '新书', author: '新作者', readCount: 3, tags: ['甲', '乙'], notes: '新备注\n第二行', characters: [{ name: '新主角', attribute: '1' }] })
  })

  it('retains physical CSV line numbers across blank lines and quoted newlines', () => {
    const session = csv.createCsvImportSession(`${headers}\r\n\r\n${generatedRow(1, { notes: '第一行\r\n第二行' })}\r\n${generatedRow(2, { rating: '错' })}`, [])
    expect(session.rows.map((row) => row.rowNumber)).toEqual([3, 5])
  })

  it('reuses validation results for untouched rows while refreshing duplicate classification', () => {
    const session = csv.createCsvImportSession(source([generatedRow(1, { title: '' }), generatedRow(2)]), [])
    const corrected = csv.correctCsvImportRow(session, 2, { title: '生成书2' })
    expect(corrected.rows[1].novel).toBe(session.rows[1].novel)
    expect(corrected.rows.map((row) => row.status)).toEqual(['ready', 'duplicate'])
    expect(csv.resetCsvImportRow(corrected, 2).rows.map((row) => row.status)).toEqual(['error', 'ready'])
  })
})

describe('CSV bulk mapping and aggregation', () => {
  it('maps 80 matching enum values using field + trimmed raw value only', () => {
    const session = csv.createCsvImportSession(source([
      ...Array.from({ length: 80 }, (_, i) => generatedRow(i, { rating: i % 2 ? ' 超喜欢 ' : '超喜欢', tags: '超喜欢' })),
      generatedRow(81, { status: '超喜欢' }),
      generatedRow(82, { rating: '不认识' }),
    ]), [])
    const group = csv.aggregateCsvIssues(session).find((item) => item.field === 'rating' && item.rawValue === '超喜欢')
    expect(group.rowNumbers).toHaveLength(80)
    expect(csv.paginateCsvRows(session, { status: 'error', groupKey: group.key, page: 2, pageSize: 50 })).toMatchObject({ totalRows: 80, pageCount: 2, rows: expect.any(Array) })
    const mapped = csv.applyCsvCorrectionMapping(session, { field: 'rating', rawValue: ' 超喜欢 ', mappedValue: '喜欢' })
    expect(mapped).toMatchObject({ importableCount: 80, errorCount: 2, mappings: [{ field: 'rating', rawValue: '超喜欢', mappedValue: '喜欢' }] })
    expect(mapped.rows.slice(0, 80).every((row) => row.novel.rating === '喜欢' && row.novel.tags[0] === '超喜欢')).toBe(true)
    expect(mapped.rows[80].corrections).toEqual({})
    expect(mapped.rows[81].corrections).toEqual({})
    expect(mapped.rows[80].novel).toBe(session.rows[80].novel)
    expect(csv.createCsvImportSession(source([generatedRow(1, { rating: '超喜欢' })]), []).mappings).toEqual([])
  })

  it('revalidates illegal mappings and allows per-row undo after a mapping', () => {
    const session = csv.createCsvImportSession(source([generatedRow(1, { rating: '超喜欢' }), generatedRow(2, { rating: '超喜欢' })]), [])
    const invalid = csv.applyCsvCorrectionMapping(session, { field: 'rating', rawValue: '超喜欢', mappedValue: '依然非法' })
    expect(invalid.errorCount).toBe(2)
    const valid = csv.applyCsvCorrectionMapping(invalid, { field: 'rating', rawValue: '超喜欢', mappedValue: '喜欢' })
    expect(valid.mappings).toHaveLength(1)
    expect(csv.resetCsvImportRow(valid, 2)).toMatchObject({ importableCount: 1, errorCount: 1 })
  })

  it('makes all 5000 rows accessible with exact tab counts and clamped pagination', () => {
    const session = csv.createCsvImportSession(source(Array.from({ length: 5000 }, (_, i) => generatedRow(i, { rating: '未知' }))), [])
    expect(session).toMatchObject({ totalRows: 5000, errorCount: 5000 })
    expect(csv.aggregateCsvIssues(session)[0].rowNumbers).toHaveLength(5000)
    const last = csv.paginateCsvRows(session, { status: 'error', page: 999, pageSize: 50 })
    expect(last).toMatchObject({ page: 100, pageCount: 100, totalRows: 5000 })
    expect(last.rows).toHaveLength(50)
    expect(last.rows.at(-1).rowNumber).toBe(5001)
    expect(csv.paginateCsvRows(session, { status: 'ready', page: 4 })).toMatchObject({ page: 1, pageCount: 1, rows: [] })
  })
})

describe('CSV skipping and final validation', () => {
  it('skips and restores errors without double counting; ignores skipped duplicate candidates', () => {
    const session = csv.createCsvImportSession(source([generatedRow(1, { rating: '错' }), generatedRow(2), generatedRow(2)]), [])
    const skipped = csv.setCsvImportRowSkipped(session, 2, true)
    expect(skipped).toMatchObject({ importableCount: 1, duplicateCount: 1, errorCount: 0, skippedCount: 1 })
    expect(csv.aggregateCsvIssues(skipped)).toEqual([])
    expect(csv.setCsvImportRowSkipped(skipped, 2, false).errorCount).toBe(1)
    expect(csv.setCsvImportRowSkipped(skipped, 3, true)).toMatchObject({ importableCount: 1, duplicateCount: 0, skippedCount: 2 })
  })

  it('produces a disjoint 12 / 3 / 2 / 2 confirmation summary', () => {
    let session = csv.createCsvImportSession(source([
      ...Array.from({ length: 10 }, (_, i) => generatedRow(i)),
      ...Array.from({ length: 3 }, (_, i) => generatedRow(i)),
      ...Array.from({ length: 6 }, (_, i) => generatedRow(i + 10, { rating: '错' })),
    ]), [])
    session = csv.correctCsvImportRow(session, 15, { rating: '喜欢' })
    session = csv.correctCsvImportRow(session, 16, { rating: '喜欢' })
    session = csv.setCsvImportRowSkipped(session, 19, true)
    session = csv.setCsvImportRowSkipped(session, 20, true)
    expect(csv.revalidateCsvImportRows(session.rows, [])).toMatchObject({ totalRows: 19, importableCount: 12, duplicateCount: 3, errorCount: 2, skippedCount: 2 })
    expect(csv.formatCsvConfirmSummary(session)).toBe('准备导入：12\n重复跳过：3\n异常未处理跳过：2\n人工跳过：2')
  })

  it('never trusts supplied ready status or novel payloads and rechecks database duplicates', () => {
    const session = csv.createCsvImportSession(source([generatedRow(1), generatedRow(2, { rating: '非法' })]), [])
    const forged = session.rows.map((row) => ({ ...row, status: 'ready', issues: [], errors: [], novel: { ...row.novel, rating: '喜欢' } }))
    const final = csv.revalidateCsvImportRows(forged, [{ title: '《生成书1》', author: '生成作者' }])
    expect(final).toMatchObject({ importableCount: 0, duplicateCount: 1, errorCount: 1 })
  })
})
