import { resolve } from 'node:path'

export function resolveDatabasePath(configuredPath, serverRoot) {
  return typeof configuredPath === 'string' && configuredPath.trim()
    ? configuredPath
    : resolve(serverRoot, 'data', 'novels.db')
}
