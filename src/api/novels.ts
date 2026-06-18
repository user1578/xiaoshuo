import { isSupabaseDataSource } from './supabaseClient'
import { createSupabaseNovel, fetchSupabaseNovels, updateSupabaseNovel } from './supabaseNovels'

const NOVELS_API_URL = 'http://127.0.0.1:3001/api/novels'
const BACKUP_EXPORT_API_URL = 'http://127.0.0.1:3001/api/backup/export'
const BACKUP_EXPORT_CSV_API_URL = 'http://127.0.0.1:3001/api/backup/export.csv'
const BACKUP_IMPORT_API_URL = 'http://127.0.0.1:3001/api/backup/import'
const CSV_IMPORT_PREVIEW_API_URL = 'http://127.0.0.1:3001/api/import/csv/preview'
const CSV_IMPORT_CONFIRM_API_URL = 'http://127.0.0.1:3001/api/import/csv/confirm'
const CLOUD_READONLY_MESSAGE = '云端模式暂未开放写入'

function assertLocalWriteEnabled() {
  if (isSupabaseDataSource()) {
    throw new Error(CLOUD_READONLY_MESSAGE)
  }
}

export async function fetchNovels<TNovel = unknown>(): Promise<TNovel[]> {
  if (isSupabaseDataSource()) {
    return fetchSupabaseNovels<TNovel>()
  }

  const response = await fetch(NOVELS_API_URL)

  if (!response.ok) {
    throw new Error(`Failed to fetch novels: ${response.status}`)
  }

  return response.json() as Promise<TNovel[]>
}

export async function createNovel<TNovel = unknown>(payload: unknown): Promise<TNovel> {
  if (isSupabaseDataSource()) {
    return createSupabaseNovel<TNovel>(payload as Parameters<typeof createSupabaseNovel>[0])
  }

  assertLocalWriteEnabled()

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
  if (isSupabaseDataSource()) {
    return updateSupabaseNovel<TNovel>(id, payload as Parameters<typeof updateSupabaseNovel>[1])
  }

  assertLocalWriteEnabled()

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

export async function deleteNovel(id: number, options?: { ignoreNotFound?: boolean }): Promise<void> {
  assertLocalWriteEnabled()

  const response = await fetch(`${NOVELS_API_URL}/${id}`, {
    method: 'DELETE',
  })

  if (response.status === 404 && options?.ignoreNotFound) {
    return
  }

  if (!response.ok) {
    throw new Error(`Failed to delete novel: ${response.status}`)
  }
}

export async function exportNovelBackup<TBackup = unknown>(): Promise<TBackup> {
  assertLocalWriteEnabled()

  const response = await fetch(BACKUP_EXPORT_API_URL)

  if (!response.ok) {
    throw new Error(`Failed to export novel backup: ${response.status}`)
  }

  return response.json() as Promise<TBackup>
}

export async function exportNovelCsv(): Promise<string> {
  assertLocalWriteEnabled()

  const response = await fetch(BACKUP_EXPORT_CSV_API_URL)

  if (!response.ok) {
    throw new Error(`Failed to export novel CSV: ${response.status}`)
  }

  return response.text()
}

export async function importNovelBackup<TBackup = unknown>(payload: unknown): Promise<TBackup> {
  assertLocalWriteEnabled()

  const response = await fetch(BACKUP_IMPORT_API_URL, {
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? `Failed to import novel backup: ${response.status}`)
  }

  return response.json() as Promise<TBackup>
}

async function postCsvImport<TResponse>(url: string, csv: string): Promise<TResponse> {
  assertLocalWriteEnabled()

  const response = await fetch(url, {
    body: JSON.stringify({ csv }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? `CSV import request failed: ${response.status}`)
  }

  return response.json() as Promise<TResponse>
}

export async function previewCsvImport<TPreview = unknown>(csv: string): Promise<TPreview> {
  return postCsvImport<TPreview>(CSV_IMPORT_PREVIEW_API_URL, csv)
}

export async function confirmCsvImport<TImport = unknown>(csv: string): Promise<TImport> {
  return postCsvImport<TImport>(CSV_IMPORT_CONFIRM_API_URL, csv)
}
