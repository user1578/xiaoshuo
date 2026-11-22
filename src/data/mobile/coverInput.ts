import type { CoverInputFile } from '../../types/novel'

const MAX_COVER_BYTES = 10 * 1024 * 1024
const MIME_TO_EXTENSION = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

export const COVER_IMAGE_ACCEPT = [...MIME_TO_EXTENSION.keys()].join(',')

export function coverFileExtension(file: Pick<CoverInputFile, 'size' | 'type'>): string {
  if (file.size > MAX_COVER_BYTES) throw new Error('自定义封面不能超过 10 MB')
  const extension = MIME_TO_EXTENSION.get(file.type)
  if (!extension) throw new Error('自定义封面只支持 JPEG、PNG 或 WebP 图片')
  return extension
}
