import type { MobileRepository } from './mobileRepository'

export function createMobileRepositoryLoader<T>(
  importRepository: () => Promise<{ getMobileRepository: () => Promise<T> }>,
) {
  let repositoryPromise: Promise<T> | undefined

  return {
    load(): Promise<T> {
      repositoryPromise ??= importRepository()
        .then(({ getMobileRepository }) => getMobileRepository())
        .catch((error: unknown) => {
          repositoryPromise = undefined
          throw error
        })
      return repositoryPromise
    },
  }
}

const nativeLoader = createMobileRepositoryLoader(() => import('./mobileRepository'))

export function loadMobileRepository(): Promise<MobileRepository> {
  return nativeLoader.load()
}
