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
