import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolveDatabasePath } from './databasePath.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverRoot = resolve(__dirname, '..')
const schemaPath = resolve(__dirname, 'schema.sql')

export const databasePath = resolveDatabasePath(process.env.NOVEL_BAG_DB_PATH, serverRoot)

export async function ensureDataDirectory() {
  await mkdir(dirname(databasePath), { recursive: true })
}

export async function openDatabase() {
  await ensureDataDirectory()
  const db = new DatabaseSync(databasePath)
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

export async function initializeDatabase() {
  const db = await openDatabase()
  try {
    db.exec(readFileSync(schemaPath, 'utf8'))
    return databasePath
  } finally {
    db.close()
  }
}

export function runInTransaction(db, callback) {
  db.exec('BEGIN')
  try {
    const result = callback()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--init')) {
    initializeDatabase()
      .then((path) => {
        console.log(`Database initialized: ${path}`)
      })
      .catch((error) => {
        console.error(error)
        process.exitCode = 1
      })
  }
}
