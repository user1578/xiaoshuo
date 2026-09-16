import { expect, it } from 'vitest'
import { createTemporaryCoverPreview } from './localCoverPreview'

it('creates a temporary preview through the injected object URL creator', () => {
  const previewUrl = createTemporaryCoverPreview({} as Blob, () => 'blob:temporary-cover')
  expect(previewUrl).toBe('blob:temporary-cover')
})
