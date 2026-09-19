import { describe, expect, it } from 'vitest'
import { createCsvImportPreview, serializeNovelsCsv } from './novelCsv.mjs'

const headers = '书名,作者,主角1,主角1属性,主角2,主角2属性,CP类别,结局,阅读状态,个人评价,阅读次数,标签,备注'
const validRow = '《测试书》,作者甲,主角甲,1,主角乙,0,1v1,HE,看完,喜欢,2,校园，救赎,"第一行\n第二行"'

describe('shared novel CSV rules', () => {
  it('serializes exactly one BOM and quotes commas, quotes, and newlines', () => {
    const csv = serializeNovelsCsv([{
      title: '测试,书', author: '作者', characters: [{ name: '主角"甲', attribute: '1' }], cpCategory: '1v1',
      ending: 'HE', status: '看完', rating: '喜欢', readCount: 2, tags: ['甲', '乙'], notes: '第一行\n第二行',
    }])

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv.slice(1, 2)).not.toBe('\uFEFF')
    expect(csv).toContain('"测试,书"')
    expect(csv).toContain('"主角""甲"')
    expect(csv).toContain('"第一行\n第二行"')
  })

  it('accepts CRLF and LF CSV with required headers, characters, tags, and defaults', () => {
    for (const newline of ['\r\n', '\n']) {
      const preview = createCsvImportPreview(`${headers}${newline}${validRow}`, [])
      expect(preview).toMatchObject({ totalRows: 1, importableCount: 1, duplicateCount: 0, errorCount: 0 })
      expect(preview.rows[0].novel).toMatchObject({
        characters: [{ name: '主角甲', attribute: '1' }, { name: '主角乙', attribute: '0' }],
        tags: ['校园', '救赎'],
      })
    }
  })

  it('reports header and enum errors without making rows importable', () => {
    expect(() => createCsvImportPreview('书名,作者\n测试,作者', [])).toThrow('CSV missing required headers')
    const preview = createCsvImportPreview(`${headers}\n测试,作者,主角,1,,,错误CP,HE,看完,喜欢,1,,`, [])
    expect(preview.rows[0]).toMatchObject({ status: 'error', errors: ['CP类别 只能是 1v1 / 无CP / NP'] })
  })

  it('detects normalized database and CSV duplicates while retaining preview counts', () => {
    const duplicateExisting = createCsvImportPreview(`${headers}\n《测试书》,Ａｕｔｈｏｒ,主角,1,,,,,,,1,,`, [{ title: ' 测试书 ', author: 'Author' }])
    const duplicateWithin = createCsvImportPreview(`${headers}\n测试,作者,主角,1,,,,,,,1,,\n《测试》,作者,主角,1,,,,,,,1,,`, [])

    expect(duplicateExisting).toMatchObject({ duplicateCount: 1, importableCount: 0 })
    expect(duplicateWithin).toMatchObject({ duplicateCount: 1, importableCount: 1 })
  })

  it('round-trips the supported CSV representation while recording extra characters in notes', () => {
    const csv = serializeNovelsCsv([{
      title: '往返书', author: '往返作者', characters: [{ name: '一', attribute: '1' }, { name: '二', attribute: '0' }, { name: '三', attribute: '0.5' }],
      cpCategory: 'NP', ending: 'OE', status: '荒废', rating: '一般', readCount: 4, tags: ['甲', '乙'], notes: '原备注',
    }])
    const preview = createCsvImportPreview(csv, [])

    expect(preview.rows[0]).toMatchObject({ status: 'ready', novel: { title: '往返书', author: '往返作者', characters: [{ name: '一', attribute: '1' }, { name: '二', attribute: '0' }], tags: ['甲', '乙'] } })
    expect(preview.rows[0].novel.notes).toContain('额外主角：三 0.5')
  })
})
