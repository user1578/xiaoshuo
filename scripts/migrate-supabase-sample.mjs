import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SAMPLE_LIMIT = 5
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

async function readBackup(backupPath) {
  let backup

  try {
    const source = await readFile(backupPath, 'utf8')
    backup = JSON.parse(source)
  } catch (error) {
    throw new Error(`Unable to read or parse backup JSON at ${backupPath}: ${error.message}`)
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
  return data.id
}

async function getOrCreateTag(supabase, userId, name) {
  const { data, error } = await supabase
    .from('tags')
    .upsert({ user_id: userId, name }, { onConflict: 'user_id,name' })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to upsert tag "${name}": ${error.message}`)
  return data.id
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

  for (const tagName of uniqueTags) {
    const tagId = await getOrCreateTag(supabase, userId, tagName)
    const { error } = await supabase.from('novel_tags').insert({ novel_id: novelId, tag_id: tagId })
    if (error) throw new Error(`Failed to link tag "${tagName}" to novel ${novelId}: ${error.message}`)
  }

  return uniqueTags.length
}

async function main() {
  const env = await loadLocalEnv()
  const supabaseUrl = requireEnv(env, 'SUPABASE_URL')
  const supabaseAnonKey = requireEnv(env, 'SUPABASE_ANON_KEY')
  const email = requireEnv(env, 'SUPABASE_EMAIL')
  const password = requireEnv(env, 'SUPABASE_PASSWORD')
  const backupPath = requireEnv(env, 'NOVEL_BACKUP_JSON')

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

  const backup = await readBackup(backupPath)
  const sampleNovels = backup.novels.slice(0, SAMPLE_LIMIT)

  if (sampleNovels.length === 0) {
    throw new Error('Backup JSON contains no novels to migrate.')
  }

  console.log(`Loaded ${backup.novels.length} novels from backup.`)
  console.log(`Migrating first ${sampleNovels.length} novels only.`)

  let insertedCount = 0
  let skippedCount = 0

  for (const [index, novel] of sampleNovels.entries()) {
    assertNovelShape(novel, index)

    const title = normalizeString(novel.title)
    const authorName = normalizeString(novel.author)
    const existingNovel = await getExistingNovel(supabase, userId, title, authorName)

    if (existingNovel) {
      skippedCount += 1
      console.log(`Skipped existing novel: ${title} / ${authorName}`)
      continue
    }

    const authorId = await getOrCreateAuthor(supabase, userId, authorName)
    const novelId = await insertNovel(supabase, userId, novel, authorId)
    const characterCount = await insertCharacters(supabase, novelId, novel.characters)
    const tagCount = await insertTags(supabase, userId, novelId, novel.tags)

    insertedCount += 1
    console.log(`Inserted: ${title} / ${authorName} (${characterCount} characters, ${tagCount} tags)`)
  }

  console.log(`Done. Inserted ${insertedCount}, skipped ${skippedCount}.`)
}

main().catch((error) => {
  console.error(`Migration failed: ${error.message}`)
  process.exitCode = 1
})
