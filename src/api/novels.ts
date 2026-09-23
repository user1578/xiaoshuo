import type { CoverChange, NovelPayload } from '../types/novel'
import { resolveDataSource } from '../data/dataSource'
import { loadMobileRepository } from '../data/mobile/mobileLoader'
import type { CsvDraftInput } from '../../shared/novelCsv.mjs'
import {
  createSupabaseNovel,
  deleteSupabaseNovel,
  deleteSupabaseNovels,
  fetchSupabaseNovels,
  updateSupabaseNovel,
} from './supabaseNovels'

const NOVELS_API_URL = 'http://127.0.0.1:3001/api/novels'
const BACKUP_EXPORT_API_URL = 'http://127.0.0.1:3001/api/backup/export'
const BACKUP_EXPORT_CSV_API_URL = 'http://127.0.0.1:3001/api/backup/export.csv'
const BACKUP_IMPORT_API_URL = 'http://127.0.0.1:3001/api/backup/import'
const CSV_IMPORT_PREVIEW_API_URL = 'http://127.0.0.1:3001/api/import/csv/preview'
const CSV_IMPORT_CONFIRM_API_URL = 'http://127.0.0.1:3001/api/import/csv/confirm'
const CLOUD_READONLY_MESSAGE = '云端模式暂未开放写入'

function assertNodeLocalDataSource() {
  if (resolveDataSource() === 'supabase') {
    throw new Error(CLOUD_READONLY_MESSAGE)
  }
}

export async function fetchNovels<TNovel = unknown>(): Promise<TNovel[]> {
  const dataSource = resolveDataSource()
  if (dataSource === 'mobile') {
    return (await (await loadMobileRepository()).fetchNovels()) as TNovel[]
  }
  if (dataSource === 'supabase') {
    return fetchSupabaseNovels<TNovel>()
  }

  const response = await fetch(NOVELS_API_URL)

  if (!response.ok) {
    throw new Error(`Failed to fetch novels: ${response.status}`)
  }

  return response.json() as Promise<TNovel[]>
}

export async function createNovel<TNovel = unknown>(payload: unknown, coverChange?: CoverChange): Promise<TNovel> {
  const dataSource = resolveDataSource()
  if (dataSource === 'mobile') {
    return (await (await loadMobileRepository()).createNovel(payload as NovelPayload, coverChange)) as TNovel
  }
  if (dataSource === 'supabase') {
    return createSupabaseNovel<TNovel>(payload as Parameters<typeof createSupabaseNovel>[0])
  }

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

export async function updateNovel<TNovel = unknown>(
  id: number,
  payload: unknown,
  coverChange?: CoverChange,
): Promise<TNovel> {
  const dataSource = resolveDataSource()
  if (dataSource === 'mobile') {
    return (await (await loadMobileRepository()).updateNovel(id, payload as NovelPayload, coverChange)) as TNovel
  }
  if (dataSource === 'supabase') {
    return updateSupabaseNovel<TNovel>(id, payload as Parameters<typeof updateSupabaseNovel>[1])
  }

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
  const dataSource = resolveDataSource()
  if (dataSource === 'mobile') {
    try {
      await (await loadMobileRepository()).deleteNovel(id)
      return
    } catch (error) {
      if (options?.ignoreNotFound && error instanceof Error && error.message.includes('was not found')) return
      throw error
    }
  }
  if (dataSource === 'supabase') {
    return deleteSupabaseNovel(id, options)
  }

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

export async function deleteNovels(ids: number[]): Promise<void> {
  const dataSource = resolveDataSource()
  if (dataSource === 'mobile') {
    await (await loadMobileRepository()).deleteNovels(ids)
    return
  }
  if (dataSource === 'supabase') {
    return deleteSupabaseNovels(ids)
  }

  const deleteResults = await Promise.all(
    ids.map(async (id) => {
      try {
        await deleteNovel(id, { ignoreNotFound: true })
        return null
      } catch (deleteError) {
        return deleteError
      }
    }),
  )
  const deleteErrors = deleteResults.filter((deleteError) => deleteError !== null)

  if (deleteErrors.length > 0) {
    throw new Error(`批量删除完成，${deleteErrors.length} 本删除失败，请确认后端服务状态`)
  }
}

export async function exportNovelBackup<TBackup = unknown>(): Promise<TBackup> {
  const dataSource = resolveDataSource()
  if (dataSource === 'mobile') {
    return (await (await loadMobileRepository()).exportNovelBackup()) as TBackup
  }
  if (dataSource === 'supabase') {
    throw new Error(CLOUD_READONLY_MESSAGE)
  }

  const response = await fetch(BACKUP_EXPORT_API_URL)

  if (!response.ok) {
    throw new Error(`Failed to export novel backup: ${response.status}`)
  }

  return response.json() as Promise<TBackup>
}

export async function exportNovelCsv(): Promise<string> {
  const dataSource = resolveDataSource()
  if (dataSource === 'mobile') {
    return (await (await loadMobileRepository()).shareNovelCsv())
  }
  if (dataSource === 'supabase') {
    throw new Error(CLOUD_READONLY_MESSAGE)
  }

  const response = await fetch(BACKUP_EXPORT_CSV_API_URL)

  if (!response.ok) {
    throw new Error(`Failed to export novel CSV: ${response.status}`)
  }

  return response.text()
}

export async function importNovelBackup<TBackup = unknown>(payload: unknown): Promise<TBackup> {
  const dataSource = resolveDataSource()
  if (dataSource === 'mobile') {
    return (await (await loadMobileRepository()).importNovelBackup(payload)) as TBackup
  }
  if (dataSource === 'supabase') {
    throw new Error(CLOUD_READONLY_MESSAGE)
  }

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
  assertNodeLocalDataSource()

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
  if (resolveDataSource() === 'mobile') {
    return (await (await loadMobileRepository()).previewCsvImport(csv)) as TPreview
  }
  return postCsvImport<TPreview>(CSV_IMPORT_PREVIEW_API_URL, csv)
}

export async function confirmCsvImport<TImport = unknown>(csv: string): Promise<TImport> {
  if (resolveDataSource() === 'mobile') {
    return (await (await loadMobileRepository()).confirmCsvImport(csv)) as TImport
  }
  return postCsvImport<TImport>(CSV_IMPORT_CONFIRM_API_URL, csv)
}

export async function previewCsvCorrections(rows: CsvDraftInput[]) {
  if (resolveDataSource() !== 'mobile') throw new Error('CSV 人工修正仅在移动端本地书库中提供')
  return (await loadMobileRepository()).previewCsvCorrections(rows)
}

export async function confirmCsvCorrections(rows: CsvDraftInput[]) {
  if (resolveDataSource() !== 'mobile') throw new Error('CSV 人工修正仅在移动端本地书库中提供')
  return (await loadMobileRepository()).confirmCsvCorrections(rows)
}

export async function previewNovelBackup<TPreview = unknown>(payload: unknown): Promise<TPreview> {
  if (resolveDataSource() !== 'mobile') {
    throw new Error('JSON 备份预览仅在移动端本地书库中提供')
  }
  return (await (await loadMobileRepository()).previewNovelBackup(payload)) as TPreview
}

export async function getMobileLibraryStatus<TStatus = unknown>(): Promise<TStatus> {
  if (resolveDataSource() !== 'mobile') {
    throw new Error('本地书库状态仅在移动端提供')
  }
  return (await (await loadMobileRepository()).getLibraryStatus()) as TStatus
}

export async function resolveCustomCoverUri(path: string | null | undefined): Promise<string | null> {
  if (resolveDataSource() !== 'mobile') return null
  return (await loadMobileRepository()).resolveCustomCoverUri(path)
}

export async function shareNovelBackup(): Promise<string> {
  if (resolveDataSource() !== 'mobile') {
    throw new Error('系统分享仅在移动端本地书库中提供')
  }
  return (await loadMobileRepository()).shareNovelBackup()
}
