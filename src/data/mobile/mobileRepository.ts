import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { CoverChange, Novel, NovelPayload } from '../../types/novel'
import { createCsvImportSession, revalidateCsvImportRows, serializeNovelsCsv, type CsvDraftInput, type CsvImportSession } from '../../../shared/novelCsv.mjs'
import {
  exportMobileBackup,
  previewMobileBackup,
  restoreMobileBackup,
  validateMobileBackup,
  type MobileBackupPreview,
  type MobileBackupRestoreResult,
  type PortableNovelBackup,
} from './mobileBackup'
import { MobileCoverStorage } from './mobileCoverStorage'
import { openMobileDatabase } from './mobileDatabase'
import { MobileNovelRepository, type MobileDeleteResult, type StoredNovelPayload } from './mobileNovelRepository'

type MobileNovelStore = Pick<
  MobileNovelRepository,
  | 'createNovels'
  | 'createNovel'
  | 'deleteNovel'
  | 'deleteNovels'
  | 'getCoverPath'
  | 'getLibraryStatus'
  | 'isCoverPathReferenced'
  | 'listNovels'
  | 'replaceAllFromBackup'
  | 'updateNovel'
>

type MobileCoverStore = Pick<MobileCoverStorage, 'deleteIfUnreferenced' | 'resolveUri' | 'save'>

type BackupFilesystem = Pick<typeof Filesystem, 'getUri' | 'writeFile'>
type ShareAdapter = Pick<typeof Share, 'share'>

export type MobileCsvImportResult = { importedAt: string; importedCount: number; duplicateCount: number; errorCount: number; skippedCount: number; novels: Novel[] }

export type MobileRepository = {
  fetchNovels(): Promise<Novel[]>
  createNovel(payload: NovelPayload, coverChange?: CoverChange): Promise<Novel>
  updateNovel(id: number, payload: NovelPayload, coverChange?: CoverChange): Promise<Novel>
  deleteNovel(id: number): Promise<MobileDeleteResult>
  deleteNovels(ids: number[]): Promise<MobileDeleteResult>
  getLibraryStatus(): ReturnType<MobileNovelRepository['getLibraryStatus']>
  previewNovelBackup(raw: unknown): Promise<MobileBackupPreview>
  importNovelBackup(raw: unknown): Promise<MobileBackupRestoreResult>
  previewCsvImport(csv: string): Promise<CsvImportSession>
  confirmCsvImport(csv: string): Promise<MobileCsvImportResult>
  previewCsvCorrections(rows: CsvDraftInput[]): Promise<CsvImportSession>
  confirmCsvCorrections(rows: CsvDraftInput[]): Promise<MobileCsvImportResult>
  exportNovelBackup(): Promise<PortableNovelBackup>
  shareNovelBackup(): Promise<string>
  shareNovelCsv(): Promise<string>
  resolveCustomCoverUri(path: string | null | undefined): Promise<string | null>
}

export type MobileRepositoryDependencies = {
  novels: MobileNovelStore
  covers: MobileCoverStore
  filesystem: BackupFilesystem
  share: ShareAdapter
}

function withCoverPath(payload: NovelPayload, coverImagePath: string | null): StoredNovelPayload {
  return { ...payload, coverImagePath }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createMobileRepository(dependencies: MobileRepositoryDependencies): MobileRepository {
  const importCsvPreview = async (preview: CsvImportSession): Promise<MobileCsvImportResult> => {
    const ready = preview.rows.filter((row) => !row.skipped && row.status === 'ready').map((row) => row.novel as StoredNovelPayload)
    await dependencies.novels.createNovels(ready)
    return {
      importedAt: new Date().toISOString(),
      importedCount: ready.length,
      duplicateCount: preview.duplicateCount,
      errorCount: preview.errorCount,
      skippedCount: preview.skippedCount,
      novels: await dependencies.novels.listNovels(),
    }
  }

  const cleanupReleasedPaths = async (paths: string[]): Promise<void> => {
    await Promise.all(
      paths.map(async (path) => {
        try {
          await dependencies.covers.deleteIfUnreferenced(path, () => dependencies.novels.isCoverPathReferenced(path))
        } catch {
          // Database commit has already succeeded; file cleanup is intentionally best effort.
        }
      }),
    )
  }

  const cleanupStagedPath = async (path: string): Promise<void> => {
    try {
      await dependencies.covers.deleteIfUnreferenced(path, () => dependencies.novels.isCoverPathReferenced(path))
    } catch {
      // A failed database write must not replace its original error with best-effort cleanup failure.
    }
  }

  const writeBackupForSharing = async (backup: PortableNovelBackup): Promise<string> => {
    const date = new Date().toISOString().slice(0, 10)
    const path = `novelbag-backup-${date}.json`
    await dependencies.filesystem.writeFile({
      path,
      data: JSON.stringify(backup, null, 2),
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    return (await dependencies.filesystem.getUri({ path, directory: Directory.Cache })).uri
  }

  const writeCsvForSharing = async (): Promise<string> => {
    const date = new Date().toISOString().slice(0, 10)
    const path = `novel-export-${date}.csv`
    await dependencies.filesystem.writeFile({
      path,
      data: serializeNovelsCsv(await dependencies.novels.listNovels()),
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    return (await dependencies.filesystem.getUri({ path, directory: Directory.Cache })).uri
  }

  return {
    fetchNovels: () => dependencies.novels.listNovels(),

    async createNovel(payload, coverChange = { kind: 'keep' }) {
      const stagedPath = coverChange.kind === 'replace' ? await dependencies.covers.save(coverChange.file) : null
      try {
        return await dependencies.novels.createNovel(withCoverPath(payload, stagedPath))
      } catch (error) {
        if (stagedPath) await cleanupStagedPath(stagedPath)
        throw error
      }
    },

    async updateNovel(id, payload, coverChange = { kind: 'keep' }) {
      const existingPath = await dependencies.novels.getCoverPath(id)
      const stagedPath = coverChange.kind === 'replace' ? await dependencies.covers.save(coverChange.file) : null
      const nextPath = coverChange.kind === 'remove' ? null : (stagedPath ?? existingPath)
      try {
        const result = await dependencies.novels.updateNovel(id, withCoverPath(payload, nextPath))
        await cleanupReleasedPaths(result.releasedCoverPaths)
        return result.novel
      } catch (error) {
        if (stagedPath) await cleanupStagedPath(stagedPath)
        throw error
      }
    },

    async deleteNovel(id) {
      const result = await dependencies.novels.deleteNovel(id)
      await cleanupReleasedPaths(result.releasedCoverPaths)
      return result
    },

    async deleteNovels(ids) {
      const result = await dependencies.novels.deleteNovels(ids)
      await cleanupReleasedPaths(result.releasedCoverPaths)
      return result
    },

    getLibraryStatus: () => dependencies.novels.getLibraryStatus(),

    async previewNovelBackup(raw) {
      const status = await dependencies.novels.getLibraryStatus()
      return previewMobileBackup(raw, status.novelCount)
    },

    async importNovelBackup(raw) {
      const validation = validateMobileBackup(raw)
      if (validation.issues.length > 0 || validation.parsed === null) {
        throw new Error(`Mobile backup validation failed: ${validation.issues.map((issue) => issue.path).join(', ')}`)
      }
      const result = await restoreMobileBackup(dependencies.novels, validation.parsed)
      await cleanupReleasedPaths(result.releasedCoverPaths)
      return result
    },

    async previewCsvImport(csv) {
      return createCsvImportSession(csv, await dependencies.novels.listNovels())
    },

    async confirmCsvImport(csv) {
      return importCsvPreview(createCsvImportSession(csv, await dependencies.novels.listNovels()))
    },

    async previewCsvCorrections(rows) {
      return revalidateCsvImportRows(rows, await dependencies.novels.listNovels())
    },

    async confirmCsvCorrections(rows) {
      // Rebuild from raw cells + explicit corrections; never trust UI payloads or statuses.
      return importCsvPreview(revalidateCsvImportRows(rows, await dependencies.novels.listNovels()))
    },

    exportNovelBackup: () => exportMobileBackup(dependencies.novels),

    async shareNovelBackup() {
      const backup = await exportMobileBackup(dependencies.novels)
      const uri = await writeBackupForSharing(backup)
      await dependencies.share.share({
        title: '小说袋数据备份',
        dialogTitle: '分享小说袋数据备份',
        files: [uri],
      })
      return uri
    },

    async shareNovelCsv() {
      const uri = await writeCsvForSharing()
      await dependencies.share.share({
        title: '小说袋 CSV 导出',
        dialogTitle: '分享小说袋 CSV 导出',
        files: [uri],
      })
      return uri
    },

    resolveCustomCoverUri: (path) => dependencies.covers.resolveUri(path),
  }
}

let mobileRepositoryPromise: Promise<MobileRepository> | undefined

async function initializeMobileRepository(): Promise<MobileRepository> {
  const database = await openMobileDatabase()
  return createMobileRepository({
    novels: new MobileNovelRepository(database),
    covers: new MobileCoverStorage(),
    filesystem: Filesystem,
    share: Share,
  })
}

export function getMobileRepository(): Promise<MobileRepository> {
  mobileRepositoryPromise ??= initializeMobileRepository().catch((error: unknown) => {
    mobileRepositoryPromise = undefined
    throw new Error(`本地书库初始化失败: ${errorMessage(error)}`, { cause: error })
  })
  return mobileRepositoryPromise
}
