const NOVELS_API_URL = 'http://127.0.0.1:3001/api/novels'

export async function fetchNovels<TNovel = unknown>(): Promise<TNovel[]> {
  const response = await fetch(NOVELS_API_URL)

  if (!response.ok) {
    throw new Error(`Failed to fetch novels: ${response.status}`)
  }

  return response.json() as Promise<TNovel[]>
}
