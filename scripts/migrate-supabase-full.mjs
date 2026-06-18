import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { isAbsolute, resolve } from 'node:path'

const envPath = resolve(process.cwd(), '.env.local')

function parseEnvValue(value) {
  const trimmed = value.trim()

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

async function loadLocalEnv() {
  let source

  try {
    source = await readFile(envPath, 'utf8')
  } catch (error) {
    throw new Error(`Unable to read .env.local at ${envPath}: ${error.message}`)
  }

  const env = {}

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1)
    if (key) env[key] = parseEnvValue(value)
  }

  return env
}

function requireEnv(env, key) {
  const value = env[key]

  if (!value) {
    throw new Error(`Missing required .env.local value: ${key}`)
  }

  return value
}

function resolveBackupPath(backupPath) {
  return isAbsolute(backupPath) ? backupPath : resolve(process.cwd(), backupPath)
}

async function readBackup(backupPath) {
  const resolvedBackupPath = resolveBackupPath(backupPath)
  let backup

  try {
    const source = await readFile(resolvedBackupPath, 'utf8')
    backup = JSON.parse(source)
  } catch (error) {
    throw new Error(`Unable to read or parse NOVEL_BACKUP_JSON: ${error.message}`)
  }

  if (!backup || !Array.isArray(backup.novels)) {
    throw new Error('Backup JSON must contain a novels array.')
  }

  return backup
}

function normalizeString(value, fallback = '') {
  if (value === undefined || value === null) return fallback
  return String(value).trim()
}

function normalizeInteger(value, fallback = 0) {
  const number = Number.parseInt(String(value), 10)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1'
}

function assertNovelShape(novel, index) {
  if (!novel || typeof novel !== 'object') {
    throw new Error(`novels[${index}] is not an object.`)
  }

  if (!normalizeString(novel.title)) {
    throw new Error(`novels[${index}].title is required.`)
  }

  if (!normalizeString(novel.author)) {
    throw new Error(`novels[${index}].author is required.`)
  }

  if (!Array.isArray(novel.characters)) {
    throw new Error(`novels[${index}].characters must be an array.`)
  }
}

async function requireConfirmation(totalCount, existingNovelCount) {
  console.log(`Backup novels to migrate: ${totalCount}`)
  console.log(`Current Supabase novels before migration: ${existingNovelCount}`)
  console.log('This script inserts only missing novels and never deletes or overwrites existing data.')

  const readline = createInterface({ input, output })

  try {
    const answer = await readline.question('Type YES to start the full Supabase migration: ')

    if (answer !== 'YES') {
      console.log('Migration cancelled. No data was inserted.')
      return false
    }

    return true
  } finally {
    readline.close()
  }
}

async function getCurrentNovelCount(supabase) {
  const { count, error } = await supabase.from('novels').select('id', { count: 'exact', head: true })
  if (error) throw new Error(`Failed to count Supabase novels: ${error.message}`)
  return count ?? 0
}

async function getTableCount(supabase, tableName) {
  const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`Failed to count Supabase ${tableName}: ${error.message}`)
  return count ?? 0
}

async function getExistingNovel(supabase, userId, title, authorName) {
  const { data, error } = await supabase
    .from('novels')
    .select('id,title,authors!inner(name)')
    .eq('user_id', userId)
    .eq('title', title)
    .eq('authors.name', authorName)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Failed to check duplicate novel "${title}": ${error.message}`)
  return data
}

async function getOrCreateAuthor(supabase, userId, name) {
  const { data, error } = await supabase
    .from('authors')
    .upsert({ user_id: userId, name }, { onConflict: 'user_id,name' })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to upsert author "${name}": ${error.message}`)
  if (!data) throw new Error(`Failed to upsert author "${name}": no row returned`)
  return data.id
}

async function getOrCreateTags(supabase, userId, tagNames) {
  if (tagNames.length === 0) return []

  const { data, error } = await supabase
    .from('tags')
    .upsert(
      tagNames.map((name) => ({ user_id: userId, name })),
      { onConflict: 'user_id,name' },
    )
    .select('id,name')

  if (error) throw new Error(`Failed to upsert tags: ${error.message}`)
  return data ?? []
}

async function insertNovel(supabase, userId, novel, authorId) {
  const today = new Date().toISOString().slice(0, 10)
  const payload = {
    user_id: userId,
    title: normalizeString(novel.title),
    author_id: authorId,
    cp_category: normalizeString(novel.cpCategory, '1v1'),
    ending: normalizeString(novel.ending, '其他'),
    status: normalizeString(novel.status, '看完'),
    rating: normalizeString(novel.rating, '未评价'),
    read_count: normalizeInteger(novel.readCount, 0),
    notes: normalizeString(novel.notes),
    cover: normalizeString(novel.cover, 'book'),
    favorite: normalizeBoolean(novel.favorite),
    created_at: normalizeString(novel.createdAt, today),
    updated_at: normalizeString(novel.updatedAt, today),
  }

  const { data, error } = await supabase.from('novels').insert(payload).select('id').single()

  if (error) throw new Error(`Failed to insert novel "${payload.title}": ${error.message}`)
  if (!data) throw new Error(`Failed to insert novel "${payload.title}": no row returned`)
  return data.id
}

async function insertCharacters(supabase, novelId, characters) {
  const rows = characters
    .filter((character) => character && normalizeString(character.name))
    .map((character, index) => ({
      novel_id: novelId,
      name: normalizeString(character.name),
      attribute: normalizeString(character.attribute, '其他'),
      sort_order: index,
    }))

  if (rows.length === 0) return 0

  const { error } = await supabase.from('characters').insert(rows)
  if (error) throw new Error(`Failed to insert characters for novel ${novelId}: ${error.message}`)

  return rows.length
}

async function insertTags(supabase, userId, novelId, tags) {
  const uniqueTags = [
    ...new Set((Array.isArray(tags) ? tags : []).map((tag) => normalizeString(tag)).filter(Boolean)),
  ]
  const tagRows = await getOrCreateTags(supabase, userId, uniqueTags)

  if (tagRows.length === 0) return 0

  const { error } = await supabase.from('novel_tags').insert(
    tagRows.map((tag) => ({
      novel_id: novelId,
      tag_id: tag.id,
    })),
  )

  if (error) throw new Error(`Failed to link tags to novel ${novelId}: ${error.message}`)
  return tagRows.length
}

async function insertMissingNovel(supabase, userId, novel) {
  const title = normalizeString(novel.title)
  const authorName = normalizeString(novel.author)
  const existingNovel = await getExistingNovel(supabase, userId, title, authorName)

  if (existingNovel) {
    return { inserted: false, title, authorName }
  }

  const authorId = await getOrCreateAuthor(supabase, userId, authorName)
  const novelId = await insertNovel(supabase, userId, novel, authorId)
  const characterCount = await insertCharacters(supabase, novelId, novel.characters)
  const tagCount = await insertTags(supabase, userId, novelId, novel.tags)

  return { authorName, characterCount, inserted: true, tagCount, title }
}

async function printFinalCounts(supabase) {
  const [novels, authors, characters, tags, novelTags] = await Promise.all([
    getTableCount(supabase, 'novels'),
    getTableCount(supabase, 'authors'),
    getTableCount(supabase, 'characters'),
    getTableCount(supabase, 'tags'),
    getTableCount(supabase, 'novel_tags'),
  ])

  console.log(`Supabase final novels count: ${novels}`)
  console.log(`Supabase authors count: ${authors}`)
  console.log(`Supabase characters count: ${characters}`)
  console.log(`Supabase tags count: ${tags}`)
  console.log(`Supabase novel_tags count: ${novelTags}`)
}

async function main() {
  const env = await loadLocalEnv()
  const supabaseUrl = requireEnv(env, 'SUPABASE_URL')
  const supabaseAnonKey = requireEnv(env, 'SUPABASE_ANON_KEY')
  const email = requireEnv(env, 'SUPABASE_EMAIL')
  const password = requireEnv(env, 'SUPABASE_PASSWORD')
  const backupPath = requireEnv(env, 'NOVEL_BACKUP_JSON')
  const backup = await readBackup(backupPath)

  if (backup.novels.length === 0) {
    throw new Error('Backup JSON contains no novels to migrate.')
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError) {
    throw new Error(`Supabase login failed: ${signInError.message}`)
  }

  const userId = signInData.user?.id
  if (!userId) {
    throw new Error('Supabase login succeeded but no user id was returned.')
  }

  const existingNovelCount = await getCurrentNovelCount(supabase)
  const confirmed = await requireConfirmation(backup.novels.length, existingNovelCount)

  if (!confirmed) return

  let insertedCount = 0
  let skippedCount = 0
  let failedCount = 0

  for (const [index, novel] of backup.novels.entries()) {
    try {
      assertNovelShape(novel, index)

      const result = await insertMissingNovel(supabase, userId, novel)

      if (!result.inserted) {
        skippedCount += 1
        console.log(`Skipped duplicate: ${result.title} / ${result.authorName}`)
        continue
      }

      insertedCount += 1
      console.log(
        `Inserted: ${result.title} / ${result.authorName} (${result.characterCount} characters, ${result.tagCount} tags)`,
      )
    } catch (error) {
      failedCount += 1
      const title = normalizeString(novel?.title, `novels[${index}]`)
      const authorName = normalizeString(novel?.author, 'unknown author')
      console.error(`Failed: ${title} / ${authorName}: ${error.message}`)
    }
  }

  console.log(`JSON total novels: ${backup.novels.length}`)
  console.log(`Inserted novels: ${insertedCount}`)
  console.log(`Skipped duplicates: ${skippedCount}`)
  console.log(`Failed novels: ${failedCount}`)
  await printFinalCounts(supabase)

  if (failedCount > 0) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(`Migration failed: ${error.message}`)
  process.exitCode = 1
})
