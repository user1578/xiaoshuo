import { supabase } from './supabaseClient'

type SupabaseAuthor = {
  name: string
}

type SupabaseCharacter = {
  name: string
  attribute: string
  sort_order: number
}

type SupabaseTag = {
  tags: {
    name: string
  } | null
}

type SupabaseNovelPayload = {
  title: string
  author: string
  characters: {
    name: string
    attribute: string
  }[]
  cpCategory: string
  ending: string
  status: string
  rating: string
  readCount: number
  tags: string[]
  notes: string
  createdAt: string
  updatedAt: string
  cover: string
  favorite: boolean
}

type SupabaseNovelRow = {
  id: number
  title: string
  cp_category: string
  ending: string
  status: string
  rating: string
  read_count: number
  notes: string
  cover: string
  favorite: boolean
  created_at: string
  updated_at: string
  authors: SupabaseAuthor | null
  characters: SupabaseCharacter[] | null
  novel_tags: SupabaseTag[] | null
}

function mapSupabaseNovel(row: SupabaseNovelRow) {
  return {
    id: row.id,
    title: row.title,
    author: row.authors?.name ?? '',
    characters: [...(row.characters ?? [])]
      .sort((first, second) => first.sort_order - second.sort_order)
      .map((character) => ({
        name: character.name,
        attribute: character.attribute,
      })),
    cpCategory: row.cp_category,
    ending: row.ending,
    status: row.status,
    rating: row.rating,
    readCount: row.read_count,
    tags: (row.novel_tags ?? [])
      .map((tagLink) => tagLink.tags?.name)
      .filter((tag): tag is string => Boolean(tag))
      .sort((firstTag, secondTag) => firstTag.localeCompare(secondTag, 'zh-Hans-CN')),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cover: row.cover,
    favorite: row.favorite,
  }
}

function assertSupabaseError(stage: string, error: { message: string } | null) {
  if (error) {
    throw new Error(`${stage}: ${error.message}`)
  }
}

function normalizeName(value: string) {
  return value.trim()
}

async function getCurrentSupabaseUserId(action: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  assertSupabaseError(`Failed to get current Supabase user for ${action}`, userError)

  const userId = userData.user?.id

  if (!userId) {
    throw new Error(`Failed to ${action}: user is not signed in`)
  }

  return userId
}

async function fetchSupabaseNovelById<TNovel = unknown>(id: number): Promise<TNovel> {
  const { data, error } = await supabase
    .from('novels')
    .select(
      `
        id,
        title,
        cp_category,
        ending,
        status,
        rating,
        read_count,
        notes,
        cover,
        favorite,
        created_at,
        updated_at,
        authors(name),
        characters(name, attribute, sort_order),
        novel_tags(tags(name))
      `,
    )
    .eq('id', id)
    .single<SupabaseNovelRow>()

  assertSupabaseError('Failed to fetch created Supabase novel', error)

  if (!data) {
    throw new Error('Failed to fetch created Supabase novel: no row returned')
  }

  return mapSupabaseNovel(data) as TNovel
}

export async function fetchSupabaseNovels<TNovel = unknown>(): Promise<TNovel[]> {
  const { data, error } = await supabase
    .from('novels')
    .select(
      `
        id,
        title,
        cp_category,
        ending,
        status,
        rating,
        read_count,
        notes,
        cover,
        favorite,
        created_at,
        updated_at,
        authors(name),
        characters(name, attribute, sort_order),
        novel_tags(tags(name))
      `,
    )
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .returns<SupabaseNovelRow[]>()

  if (error) {
    throw new Error(`Failed to fetch Supabase novels: ${error.message}`)
  }

  return (data ?? []).map(mapSupabaseNovel) as TNovel[]
}

export async function createSupabaseNovel<TNovel = unknown>(payload: SupabaseNovelPayload): Promise<TNovel> {
  const userId = await getCurrentSupabaseUserId('create Supabase novel')

  const authorName = normalizeName(payload.author)

  if (!authorName) {
    throw new Error('Failed to create Supabase novel: author is required')
  }

  const { data: author, error: authorError } = await supabase
    .from('authors')
    .upsert({ name: authorName, user_id: userId }, { onConflict: 'user_id,name' })
    .select('id')
    .single<{ id: number }>()
  assertSupabaseError('Failed to upsert Supabase author', authorError)

  if (!author) {
    throw new Error('Failed to upsert Supabase author: no row returned')
  }

  const { data: novel, error: novelError } = await supabase
    .from('novels')
    .insert({
      author_id: author.id,
      cover: payload.cover,
      cp_category: payload.cpCategory,
      created_at: payload.createdAt,
      ending: payload.ending,
      favorite: payload.favorite,
      notes: payload.notes,
      rating: payload.rating,
      read_count: payload.readCount,
      status: payload.status,
      title: payload.title,
      updated_at: payload.updatedAt,
      user_id: userId,
    })
    .select('id')
    .single<{ id: number }>()
  assertSupabaseError('Failed to insert Supabase novel', novelError)

  if (!novel) {
    throw new Error('Failed to insert Supabase novel: no row returned')
  }

  const characterRows = payload.characters
    .map((character, index) => ({
      attribute: character.attribute,
      name: normalizeName(character.name),
      novel_id: novel.id,
      sort_order: index,
    }))
    .filter((character) => character.name.length > 0)

  if (characterRows.length > 0) {
    const { error: charactersError } = await supabase.from('characters').insert(characterRows)
    assertSupabaseError('Failed to insert Supabase characters', charactersError)
  }

  const tagNames = Array.from(new Set(payload.tags.map(normalizeName).filter(Boolean)))

  if (tagNames.length > 0) {
    const { data: tags, error: tagsError } = await supabase
      .from('tags')
      .upsert(
        tagNames.map((name) => ({ name, user_id: userId })),
        { onConflict: 'user_id,name' },
      )
      .select('id')
      .returns<{ id: number }[]>()
    assertSupabaseError('Failed to upsert Supabase tags', tagsError)

    const tagLinks = (tags ?? []).map((tag) => ({
      novel_id: novel.id,
      tag_id: tag.id,
    }))

    if (tagLinks.length > 0) {
      const { error: novelTagsError } = await supabase.from('novel_tags').insert(tagLinks)
      assertSupabaseError('Failed to insert Supabase novel tags', novelTagsError)
    }
  }

  return fetchSupabaseNovelById<TNovel>(novel.id)
}

export async function updateSupabaseNovel<TNovel = unknown>(
  id: number,
  payload: SupabaseNovelPayload,
): Promise<TNovel> {
  const userId = await getCurrentSupabaseUserId('update Supabase novel')
  const authorName = normalizeName(payload.author)

  if (!authorName) {
    throw new Error('Failed to update Supabase novel: author is required')
  }

  const { data: author, error: authorError } = await supabase
    .from('authors')
    .upsert({ name: authorName, user_id: userId }, { onConflict: 'user_id,name' })
    .select('id')
    .single<{ id: number }>()
  assertSupabaseError('Failed to upsert Supabase author for update', authorError)

  if (!author) {
    throw new Error('Failed to upsert Supabase author for update: no row returned')
  }

  const { data: novel, error: novelError } = await supabase
    .from('novels')
    .update({
      author_id: author.id,
      cover: payload.cover,
      cp_category: payload.cpCategory,
      created_at: payload.createdAt,
      ending: payload.ending,
      favorite: payload.favorite,
      notes: payload.notes,
      rating: payload.rating,
      read_count: payload.readCount,
      status: payload.status,
      title: payload.title,
      updated_at: payload.updatedAt,
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .single<{ id: number }>()
  assertSupabaseError('Failed to update Supabase novel', novelError)

  if (!novel) {
    throw new Error('Failed to update Supabase novel: no row returned')
  }

  const { error: deleteCharactersError } = await supabase.from('characters').delete().eq('novel_id', id)
  assertSupabaseError('Failed to delete existing Supabase characters', deleteCharactersError)

  const characterRows = payload.characters
    .map((character, index) => ({
      attribute: character.attribute,
      name: normalizeName(character.name),
      novel_id: id,
      sort_order: index,
    }))
    .filter((character) => character.name.length > 0)

  if (characterRows.length > 0) {
    const { error: charactersError } = await supabase.from('characters').insert(characterRows)
    assertSupabaseError('Failed to insert updated Supabase characters', charactersError)
  }

  const { error: deleteNovelTagsError } = await supabase.from('novel_tags').delete().eq('novel_id', id)
  assertSupabaseError('Failed to delete existing Supabase novel tags', deleteNovelTagsError)

  const tagNames = Array.from(new Set(payload.tags.map(normalizeName).filter(Boolean)))

  if (tagNames.length > 0) {
    const { data: tags, error: tagsError } = await supabase
      .from('tags')
      .upsert(
        tagNames.map((name) => ({ name, user_id: userId })),
        { onConflict: 'user_id,name' },
      )
      .select('id')
      .returns<{ id: number }[]>()
    assertSupabaseError('Failed to upsert Supabase tags for update', tagsError)

    const tagLinks = (tags ?? []).map((tag) => ({
      novel_id: id,
      tag_id: tag.id,
    }))

    if (tagLinks.length > 0) {
      const { error: novelTagsError } = await supabase.from('novel_tags').insert(tagLinks)
      assertSupabaseError('Failed to insert updated Supabase novel tags', novelTagsError)
    }
  }

  return fetchSupabaseNovelById<TNovel>(id)
}
