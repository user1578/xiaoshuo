import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import type { CoverInputFile } from '../../types/novel'

export type MobileFilesystemAdapter = {
  writeFile(options: { path: string; data: string; directory: Directory; recursive: boolean }): Promise<unknown>
  getUri(options: { path: string; directory: Directory }): Promise<{ uri: string }>
  deleteFile(options: { path: string; directory: Directory }): Promise<unknown>
}

const MAX_COVER_BYTES = 10 * 1024 * 1024
const MIME_TO_EXTENSION: Record<string, 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const COVER_PATH_PATTERN = /^covers\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isMissingFileError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'FILE_NOT_FOUND') {
    return true
  }
  return /not found|does not exist/i.test(errorMessage(error))
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export function assertCoverImagePath(path: string): string {
  if (!COVER_PATH_PATTERN.test(path)) {
    throw new Error('Invalid private cover path')
  }
  return path
}

export class MobileCoverStorage {
  private readonly filesystem: MobileFilesystemAdapter
  private readonly createUuid: () => string
  private readonly convertFileSrc: (uri: string) => string

  constructor(
    filesystem: MobileFilesystemAdapter = Filesystem,
    createUuid: () => string = () => crypto.randomUUID(),
    convertFileSrc: (uri: string) => string = (uri) => Capacitor.convertFileSrc(uri),
  ) {
    this.filesystem = filesystem
    this.createUuid = createUuid
    this.convertFileSrc = convertFileSrc
  }

  async save(file: CoverInputFile): Promise<string> {
    if (file.size > MAX_COVER_BYTES) {
      throw new Error('自定义封面不能超过 10 MB')
    }
    const extension = MIME_TO_EXTENSION[file.type]
    if (!extension) {
      throw new Error('自定义封面只支持 JPEG、PNG 或 WebP 图片')
    }

    const path = assertCoverImagePath(`covers/${this.createUuid()}.${extension}`)
    const data = arrayBufferToBase64(await file.arrayBuffer())
    await this.filesystem.writeFile({
      path,
      data,
      directory: Directory.Data,
      recursive: true,
    })
    return path
  }

  async resolveUri(relativePath: string | null | undefined): Promise<string | null> {
    if (!relativePath) return null
    const path = assertCoverImagePath(relativePath)

    try {
      const result = await this.filesystem.getUri({ path, directory: Directory.Data })
      return this.convertFileSrc(result.uri)
    } catch {
      return null
    }
  }

  async deleteIfUnreferenced(relativePath: string, isReferenced: () => Promise<boolean>): Promise<void> {
    const path = assertCoverImagePath(relativePath)
    let referenced: boolean
    try {
      referenced = await isReferenced()
    } catch (error) {
      throw new Error(`Cover cleanup failed: ${errorMessage(error)}`, { cause: error })
    }
    if (referenced) return

    try {
      await this.filesystem.deleteFile({ path, directory: Directory.Data })
    } catch (error) {
      if (isMissingFileError(error)) return
      throw new Error(`Cover cleanup failed: ${errorMessage(error)}`, { cause: error })
    }
  }
}
