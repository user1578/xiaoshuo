import type { MobileSqlDatabase, SqlRow } from './sqlTypes'

export const MOBILE_SCHEMA_VERSION = 1

const schemaV1Statements = [
  `CREATE TABLE IF NOT EXISTS authors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS novels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    cp_category TEXT NOT NULL CHECK (cp_category IN ('1v1', '无CP', 'NP')),
    ending TEXT NOT NULL CHECK (ending IN ('HE', 'BE', 'OE', '未完结', '未知', '坑', '其他')),
    status TEXT NOT NULL CHECK (status IN ('看完', '荒废')),
    rating TEXT NOT NULL CHECK (rating IN ('喜欢', '一般', '不喜欢', '未评价')),
    read_count INTEGER NOT NULL DEFAULT 0 CHECK (read_count >= 0),
    notes TEXT NOT NULL DEFAULT '',
    cover TEXT NOT NULL DEFAULT 'book',
    cover_image_path TEXT NULL,
    favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (author_id) REFERENCES authors(id)
  )`,
  `CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    novel_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    attribute TEXT NOT NULL CHECK (attribute IN ('1', '0', '0.5', '其他')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS novel_tags (
    novel_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    PRIMARY KEY (novel_id, tag_id),
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS idx_novels_author_id ON novels(author_id)',
  'CREATE INDEX IF NOT EXISTS idx_characters_novel_id ON characters(novel_id)',
  'CREATE INDEX IF NOT EXISTS idx_novel_tags_tag_id ON novel_tags(tag_id)',
]

function pragmaValue(row: SqlRow | undefined, name: string): number {
  const value = row?.[name]
  return typeof value === 'number' ? value : Number(value)
}

export async function enableMobileForeignKeys(database: MobileSqlDatabase): Promise<void> {
  await database.execute('PRAGMA foreign_keys = ON')
  const rows = await database.query<SqlRow>('PRAGMA foreign_keys')

  if (pragmaValue(rows[0], 'foreign_keys') !== 1) {
    throw new Error('SQLite foreign key enforcement could not be enabled')
  }
}

export async function migrateMobileDatabase(database: MobileSqlDatabase): Promise<void> {
  const versionRows = await database.query<SqlRow>('PRAGMA user_version')
  const currentVersion = pragmaValue(versionRows[0], 'user_version')

  if (currentVersion >= MOBILE_SCHEMA_VERSION) return
  if (currentVersion !== 0) {
    throw new Error(`Unsupported mobile SQLite schema version: ${currentVersion}`)
  }

  await database.beginTransaction()
  try {
    for (const statement of schemaV1Statements) {
      await database.execute(statement)
    }
    await database.execute(`PRAGMA user_version = ${MOBILE_SCHEMA_VERSION}`)
    await database.commitTransaction()
  } catch (error) {
    await database.rollbackTransaction()
    throw new Error(`migration 0 -> 1 failed: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}
