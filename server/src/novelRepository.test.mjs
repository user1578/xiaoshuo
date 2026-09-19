import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { confirmCsvImport, createNovel, exportNovelsCsv, listNovels, previewCsvImport } from './novelRepository.mjs'

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
const headers = '书名,作者,主角1,主角1属性,主角2,主角2属性,CP类别,结局,阅读状态,个人评价,阅读次数,标签,备注'

function createTemporaryDatabase() {
  const database = new DatabaseSync(':memory:')
  database.exec('PRAGMA foreign_keys = ON')
  database.exec(schema)
  return database
}

describe('Node repository CSV integration', () => {
  it('keeps preview statuses, confirm append semantics, and writes no duplicate or error rows', () => {
    const database = createTemporaryDatabase()
    createNovel(database, { title: '已存在', author: '作者', characters: [{ name: '甲', attribute: '1' }], cpCategory: '1v1', ending: 'HE', status: '看完', rating: '喜欢', readCount: 1, tags: [], notes: '', cover: 'book', favorite: false })
    const csv = `${headers}\n已存在,作者,甲,1,,,,,,,1,,\n新增,作者乙,乙,1,,,,,,,2,标签,备注\n错误,作者丙,,,,,,,,,1,,`

    expect(previewCsvImport(database, { csv })).toMatchObject({ importableCount: 1, duplicateCount: 1, errorCount: 1 })
    expect(confirmCsvImport(database, { csv })).toMatchObject({ importedCount: 1, duplicateCount: 1, errorCount: 1 })
    expect(listNovels(database).map((novel) => novel.title)).toEqual(['新增', '已存在'])
    database.close()
  })

  it('exports shared CSV with one BOM and preserved special fields', () => {
    const database = createTemporaryDatabase()
    createNovel(database, { title: '含,逗号', author: '作者', characters: [{ name: '主角一', attribute: '1' }, { name: '主角二', attribute: '0' }], cpCategory: '1v1', ending: 'HE', status: '看完', rating: '喜欢', readCount: 3, tags: ['甲', '乙'], notes: '有"引号\n换行', cover: 'book', favorite: false })
    const csv = exportNovelsCsv(database)

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv.slice(1, 2)).not.toBe('\uFEFF')
    expect(csv).toContain('"含,逗号"')
    expect(csv).toContain('"有""引号\n换行"')
    database.close()
  })
})
