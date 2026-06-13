import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { initializeDatabase, openDatabase } from './db.mjs'
import { clearAllNovels, createNovel } from './novelRepository.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..', '..')
const appPath = resolve(projectRoot, 'src', 'App.tsx')

function extractNovelsArray(source) {
  const marker = 'const novels: Novel[] = '
  const start = source.indexOf(marker)
  if (start === -1) throw new Error('Cannot find novels mock data in src/App.tsx')

  const arrayStart = source.indexOf('[', start + marker.length)
  if (arrayStart === -1) throw new Error('Cannot find novels array start in src/App.tsx')

  let depth = 0
  let quote = null
  let escaped = false

  for (let index = arrayStart; index < source.length; index += 1) {
    const character = source[index]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === quote) {
        quote = null
      }
      continue
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character
      continue
    }

    if (character === '[') depth += 1
    if (character === ']') depth -= 1

    if (depth === 0) return source.slice(arrayStart, index + 1)
  }

  throw new Error('Cannot find novels array end in src/App.tsx')
}

function normalizeLegacyNovel(novel) {
  return {
    title: novel.title,
    author: novel.author,
    characters: novel.characters,
    cpCategory: novel.cpCategory,
    ending: novel.ending,
    status: novel.status,
    rating: novel.rating,
    readCount: novel.readCount,
    tags: novel.tags,
    notes: novel.notes,
    createdAt: novel.createdAt,
    updatedAt: novel.updatedAt,
    cover: novel.cover,
    favorite: novel.favorite,
  }
}

await initializeDatabase()

const source = await readFile(appPath, 'utf8')
const arrayText = extractNovelsArray(source)
const mockNovels = Function(`"use strict"; return (${arrayText});`)()

const db = await openDatabase()
try {
  clearAllNovels(db)
  mockNovels.forEach((novel) => createNovel(db, normalizeLegacyNovel(novel)))
  console.log(`Seeded ${mockNovels.length} novels into SQLite.`)
} finally {
  db.close()
}
