import { describe, expect, it, vi } from 'vitest'
import { createMobileRepositoryLoader } from './mobileLoader'

describe('mobile repository loader', () => {
  it('does not import the mobile chunk until explicitly requested and caches the result', async () => {
    const fakeRepository = { source: 'generated-mobile-repository' }
    const importRepository = vi.fn(async () => ({ getMobileRepository: async () => fakeRepository }))
    const loader = createMobileRepositoryLoader(importRepository)

    expect(importRepository).not.toHaveBeenCalled()
    await loader.load()
    await loader.load()
    expect(importRepository).toHaveBeenCalledTimes(1)
  })
})
