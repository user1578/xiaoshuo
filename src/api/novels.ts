const NOVELS_API_URL = 'http://127.0.0.1:3001/api/novels'

export async function fetchNovels<TNovel = unknown>(): Promise<TNovel[]> {
  const response = await fetch(NOVELS_API_URL)

  if (!response.ok) {
    throw new Error(`Failed to fetch novels: ${response.status}`)
  }

  return response.json() as Promise<TNovel[]>
}

export async function createNovel<TNovel = unknown>(payload: unknown): Promise<TNovel> {
  const response = await fetch(NOVELS_API_URL, {
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(`Failed to create novel: ${response.status}`)
  }

  return response.json() as Promise<TNovel>
}

export async function updateNovel<TNovel = unknown>(id: number, payload: unknown): Promise<TNovel> {
  const response = await fetch(`${NOVELS_API_URL}/${id}`, {
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  })

  if (!response.ok) {
    throw new Error(`Failed to update novel: ${response.status}`)
  }

  return response.json() as Promise<TNovel>
}
