import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const supportedCovers = ['portrait', 'apple', 'cat', 'book', 'flower', 'moon', 'cloud', 'line']
const refreshCovers = supportedCovers.filter((cover) => cover !== 'book')

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const databasePath = resolve(projectRoot, 'server', 'data', 'novels.db')

function stableHash(value) {
  let hash = 2166136261

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function pickCover(title, author) {
  const hash = stableHash(`${title}\u0000${author}`)
  return refreshCovers[hash % refreshCovers.length]
}

function countCovers(db) {
  return db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(cover), ''), '(empty)') AS cover, COUNT(*) AS count
       FROM novels
       GROUP BY COALESCE(NULLIF(TRIM(cover), ''), '(empty)')
       ORDER BY count DESC, cover ASC`,
    )
    .all()
}

function printCoverCounts(title, counts) {
  console.log(title)
  for (const row of counts) {
    console.log(`  ${row.cover}: ${row.count}`)
  }
}

console.log('Before running this script, export a JSON backup from the backup page.')
console.log(`Database: ${databasePath}`)
console.log(`Supported covers: ${supportedCovers.join(', ')}`)
console.log(`Refresh target covers: ${refreshCovers.join(', ')}`)

const db = new DatabaseSync(databasePath)

try {
  db.exec('PRAGMA foreign_keys = ON')
  const targets = db
    .prepare(
      `SELECT novels.id, novels.title, authors.name AS author, novels.cover
       FROM novels
       INNER JOIN authors ON authors.id = novels.author_id
       WHERE novels.cover = 'book' OR novels.cover IS NULL OR TRIM(novels.cover) = ''
       ORDER BY novels.id ASC`,
    )
    .all()

  printCoverCounts('Cover counts before refresh:', countCovers(db))

  const updateCover = db.prepare('UPDATE novels SET cover = ? WHERE id = ?')
  const assignedCounts = new Map()

  db.exec('BEGIN')
  try {
    for (const novel of targets) {
      const cover = pickCover(novel.title, novel.author)
      updateCover.run(cover, novel.id)
      assignedCounts.set(cover, (assignedCounts.get(cover) ?? 0) + 1)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  console.log(`Matched records: ${targets.length}`)
  console.log(`Updated records: ${targets.length}`)
  console.log('Assigned cover counts:')
  for (const cover of refreshCovers) {
    console.log(`  ${cover}: ${assignedCounts.get(cover) ?? 0}`)
  }

  printCoverCounts('Cover counts after refresh:', countCovers(db))
} finally {
  db.close()
}
