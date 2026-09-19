import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { resolveDatabasePath } from './databasePath.mjs'

describe('resolveDatabasePath', () => {
  it('uses an explicit generated temporary database path unchanged', () => {
    expect(resolveDatabasePath('D:/temp/generated.db', 'D:/workspace/server')).toBe('D:/temp/generated.db')
  })

  it('derives the default database string without opening it', () => {
    expect(resolveDatabasePath(undefined, 'D:/workspace/server')).toBe(resolve('D:/workspace/server', 'data', 'novels.db'))
  })
})
