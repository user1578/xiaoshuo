import { describe, expect, it } from 'vitest'
import { enableMobileForeignKeys, migrateMobileDatabase } from './mobileMigrations'
import { NodeMobileDatabase } from './testSupport/nodeMobileDatabase'

describe('mobile database migration', () => {
  it('enables foreign keys before the v1 transaction and creates schema once', async () => {
    const database = new NodeMobileDatabase()

    await enableMobileForeignKeys(database)
    expect(await database.scalar<number>('PRAGMA foreign_keys')).toBe(1)

    await migrateMobileDatabase(database)

    expect(await database.scalar<number>('PRAGMA user_version')).toBe(1)
    expect(await database.scalar<number>('PRAGMA foreign_keys')).toBe(1)
    expect(await database.tableNames()).toEqual(
      expect.arrayContaining(['authors', 'novels', 'characters', 'tags', 'novel_tags']),
    )
    expect(database.calls.indexOf('PRAGMA foreign_keys = ON')).toBeLessThan(database.calls.indexOf('BEGIN TRANSACTION'))

    await migrateMobileDatabase(database)
    expect(await database.scalar<number>('PRAGMA user_version')).toBe(1)
  })

  it('does not advance user_version when v1 DDL fails', async () => {
    const database = new NodeMobileDatabase({ failWhenSqlIncludes: 'CREATE TABLE IF NOT EXISTS tags' })

    await enableMobileForeignKeys(database)

    await expect(migrateMobileDatabase(database)).rejects.toThrow('migration 0 -> 1 failed')
    expect(await database.scalar<number>('PRAGMA foreign_keys')).toBe(1)
    expect(await database.scalar<number>('PRAGMA user_version')).toBe(0)
  })
})
