import { describe, expect, it } from 'vitest'
import type { CoverInputFile } from '../../types/novel'
import { assertCoverImagePath, MobileCoverStorage, type MobileFilesystemAdapter } from './mobileCoverStorage'

type FakeFilesystem = MobileFilesystemAdapter & {
  calls: string[]
  missingOnDelete: boolean
  throwOnDelete: boolean
  throwOnGetUri: boolean
}

function createFakeFilesystem(): FakeFilesystem {
  const fake: FakeFilesystem = {
    calls: [],
    missingOnDelete: false,
    throwOnDelete: false,
    throwOnGetUri: false,
    async writeFile(options) {
      fake.calls.push(`write:${options.path}`)
    },
    async getUri(options) {
      fake.calls.push(`uri:${options.path}`)
      if (fake.throwOnGetUri) throw new Error('file does not exist')
      return { uri: `file:///private/${options.path}` }
    },
    async deleteFile(options) {
      fake.calls.push(`delete:${options.path}`)
      if (fake.missingOnDelete) throw { code: 'FILE_NOT_FOUND' }
      if (fake.throwOnDelete) throw new Error('permission denied')
    },
  }
  return fake
}

function fakeFile(overrides: Partial<CoverInputFile> = {}): CoverInputFile {
  return {
    name: 'generated-cover.webp',
    type: 'image/webp',
    size: 4,
    async arrayBuffer() {
      return new Uint8Array([1, 2, 3, 4]).buffer
    },
    ...overrides,
  }
}

const validPath = 'covers/123e4567-e89b-12d3-a456-426614174000.webp'

describe('MobileCoverStorage', () => {
  it('writes a UUID private path only for permitted image files under 10 MB', async () => {
    const filesystem = createFakeFilesystem()
    const storage = new MobileCoverStorage(filesystem, () => '123e4567-e89b-12d3-a456-426614174000')

    await expect(storage.save(fakeFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }))).rejects.toThrow('10 MB')
    await expect(storage.save(fakeFile({ type: 'image/gif' }))).rejects.toThrow('JPEG、PNG 或 WebP')
    await expect(storage.save(fakeFile({ type: 'image/webp' }))).resolves.toBe(validPath)
    expect(filesystem.calls).toEqual(['write:covers/123e4567-e89b-12d3-a456-426614174000.webp'])
  })

  it('accepts only strict canonical private paths and falls back when an image URI is unavailable', async () => {
    const filesystem = createFakeFilesystem()
    const storage = new MobileCoverStorage(filesystem, () => '123e4567-e89b-12d3-a456-426614174000', (uri) => `webview://${uri}`)
    const invalidPaths = [
      '../covers/123e4567-e89b-12d3-a456-426614174000.webp',
      'file:///private/covers/123e4567-e89b-12d3-a456-426614174000.webp',
      'covers/arbitrary-name.webp',
      'covers/123e4567-e89b-62d3-a456-426614174000.webp',
      'covers/123e4567-e89b-12d3-c456-426614174000.webp',
    ]

    expect(assertCoverImagePath(validPath)).toBe(validPath)
    invalidPaths.forEach((path) => expect(() => assertCoverImagePath(path)).toThrow('Invalid private cover path'))
    await expect(storage.resolveUri(validPath)).resolves.toBe(`webview://file:///private/${validPath}`)
    filesystem.throwOnGetUri = true
    await expect(storage.resolveUri(validPath)).resolves.toBeNull()
    expect(filesystem.calls).toEqual([`uri:${validPath}`, `uri:${validPath}`])
  })

  it('checks database references before deleting and treats a missing private file as already clean', async () => {
    const filesystem = createFakeFilesystem()
    const storage = new MobileCoverStorage(filesystem, () => '123e4567-e89b-12d3-a456-426614174000')
    const order: string[] = []

    await storage.deleteIfUnreferenced(validPath, async () => {
      order.push('reference-check')
      return false
    })
    expect(order).toEqual(['reference-check'])
    expect(filesystem.calls).toEqual([`delete:${validPath}`])

    await storage.deleteIfUnreferenced(validPath, async () => true)
    expect(filesystem.calls).toEqual([`delete:${validPath}`])

    filesystem.missingOnDelete = true
    await expect(storage.deleteIfUnreferenced(validPath, async () => false)).resolves.toBeUndefined()
  })

  it('does not broaden cleanup after a reference or deletion failure', async () => {
    const filesystem = createFakeFilesystem()
    const storage = new MobileCoverStorage(filesystem, () => '123e4567-e89b-12d3-a456-426614174000')

    await expect(storage.deleteIfUnreferenced(validPath, async () => { throw new Error('database unavailable') })).rejects.toThrow(
      'Cover cleanup failed',
    )
    expect(filesystem.calls).toEqual([])

    filesystem.throwOnDelete = true
    await expect(storage.deleteIfUnreferenced(validPath, async () => false)).rejects.toThrow('Cover cleanup failed')
    expect(filesystem.calls).toEqual([`delete:${validPath}`])
  })
})
