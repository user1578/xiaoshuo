# Android Local Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将小说袋打包为可离线运行的 Android APK，使原生运行时以手机 SQLite 和私有封面目录为唯一数据源，同时保持现有 Web local 与 Supabase 两条路径。

**Architecture:** `src/data/dataSource.ts` 在原生环境优先解析为 `mobile`，统一 API 门面据此动态加载 mobile repository；非原生的 Supabase 和 Node API 路径继续复用当前实现。移动数据层以可测试的异步 SQL 接口隔离 Capacitor 插件，使用 `PRAGMA user_version` 迁移规范化 schema，并将图片路径与 SQLite 事务后的文件清理解耦。

**Tech Stack:** React 19、TypeScript、Vite、Vitest、Capacitor 8、`@capacitor-community/sqlite` 8.x、`@capacitor/filesystem`、`@capacitor/share`、Node `node:sqlite`（仅测试适配器）。

**Spec:** `docs/superpowers/specs/2026-09-16-android-local-storage-design.md`

## Global Constraints

- 只在 `android-local-storage` 分支工作；不修改 `main` 或 `android-mobile-redesign`，不 push、部署、自动 commit 或自动 stage。
- Android 正式永久 App ID 为 `com.novelbag.app`；不得在后续重构中修改它，否则会产生新的 SQLite 与私有 `covers/` 沙箱。
- Native 必须优先使用 `mobile`；Web + `VITE_DATA_SOURCE=supabase` 继续使用 Supabase；其他 Web 继续使用 Node local API。
- React 页面只能调用统一数据访问门面，不直接初始化 Capacitor、SQLite、Filesystem、Share、Supabase 或 localhost API。
- 只有 `resolveDataSource() === 'mobile'` 时才通过动态 `import()` 加载 mobile repository、SQLite、Filesystem 和 Share；两条 Web 路径启动时不得初始化这些原生模块。
- 移动 schema 使用 authors、novels、characters、tags、novel_tags 与 `PRAGMA user_version`；升级不得删库重建。
- 禁止在 SQLite、JSON、长期状态或路径字段中保存 base64、Blob/Object URL、`content://`、`file://` 或设备绝对路径。
- 真实约 425 本备份、数据库、CSV、图片均不得被读取、移动、修改、导入、删除或作为测试 fixture；所有测试数据自动生成。
- JSON 不打包自定义封面；恢复一律将 `cover_image_path` 写为 `NULL`，并在 UI 中明确说明备份限制和默认 CoverArt 回退。
- 不安装 Android Studio、Android SDK、JDK、模拟器或签名工具；若 `cap sync`、Gradle、APK 或设备验证时工具链仍缺失，停止该原生验证阶段并报告。
- Web local/Supabase 功能、默认八套 CoverArt、搜索、筛选、统计、随机、CRUD、查重、CSV 和主题均不得被删除或改写为 mobile 专用行为。

---

## File Structure

| Path | Responsibility |
| --- | --- |
| `package.json`, `package-lock.json` | 锁定互相兼容的 Capacitor 8 与官方插件依赖，提供 Android 脚本。 |
| `capacitor.config.ts` | 固定 `com.novelbag.app`、应用名和 `dist` Web 产物目录。 |
| `.gitignore`, `android/` | 保留 Android 工程源码，忽略机器路径、构建产物、keystore 与运行时数据。 |
| `src/data/dataSource.ts` | 唯一的数据源解析规则及可注入的测试入口。 |
| `src/data/mobile/sqlTypes.ts` | 不依赖 Capacitor 的异步 SQL、事务、封面文件和分享接口。 |
| `src/data/mobile/mobileMigrations.ts` | v1 schema、索引和严格的 user_version 迁移。 |
| `src/data/mobile/mobileDatabase.ts` | 原生 SQLite 连接初始化、迁移与连接生命周期。 |
| `src/data/mobile/testSupport/nodeMobileDatabase.ts` | 只供 Vitest 使用的 Node 内存 SQLite adapter，绝不进入生产模块。 |
| `src/data/mobile/mobileNovelRepository.ts` | 规范化 CRUD、批量关系读取、author/tag 清理与事务结果。 |
| `src/data/mobile/mobileBackup.ts` | JSON parse、严格验证、preview、portable export 与 restore orchestration。 |
| `src/data/mobile/mobileCoverStorage.ts` | 私有 `covers/` 路径验证、文件写入、URI 解析和安全删除。 |
| `src/data/mobile/mobileRepository.ts` | 组合 database、repository、backup、cover、share 的 native-only 高层实现。 |
| `src/data/mobile/mobileLoader.ts` | mobile-only chunk 的缓存动态加载入口。 |
| `src/api/novels.ts`, `src/api/supabaseClient.ts` | 保留现有 Web API，并将 mobile 路径转入动态 loader。 |
| `src/types/novel.ts` | 可选运行时封面路径、封面变更意图、portable backup 与 preview 类型。 |
| `src/components/NovelCover.tsx` | 有自定义封面时渲染安全 URI，否则渲染既有 CoverArt。 |
| `src/App.tsx`, `src/components/mobile/*`, `src/App.css`, `src/components/mobile/mobile.css` | 统一门面调用、移动空库导入、严格 preview/confirm 恢复、封面表单与数据安全说明。 |
| `src/data/**/*.test.ts`, `src/components/**/*.test.ts` | 纯逻辑、schema、事务、导入、封面与数据源回归测试。 |

## Task 1: Lock Capacitor Configuration and Android Project Skeleton

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `capacitor.config.ts`
- Modify: `.gitignore`
- Create: `android/` via `npx cap add android`

**Interfaces:**
- Produces the fixed config consumed by all later native tasks: `appId: 'com.novelbag.app'`, `appName: '小说袋'`, `webDir: 'dist'`.
- Produces scripts `android:sync`, `android:open`, and `android:build` without changing `dev`, `test`, `lint`, or `build`.

- [ ] **Step 1: Record the resolved Capacitor compatibility set before changing dependencies**

Run:

```powershell
npm view @capacitor/core@8 version peerDependencies
npm view @capacitor/android@8 peerDependencies
npm view @capacitor-community/sqlite@8 peerDependencies
npm view @capacitor/filesystem@8 peerDependencies
npm view @capacitor/share@8 peerDependencies
```

Expected: all selected packages declare Capacitor 8-compatible peer ranges. Record the resolved package versions from `package-lock.json` in the implementation report; do not treat an unverified Android toolchain version as a code failure.

- [ ] **Step 2: Install the compatible native packages**

Run:

```powershell
npm.cmd install @capacitor/core@^8 @capacitor/android@^8 @capacitor-community/sqlite@^8 @capacitor/filesystem@^8 @capacitor/share@^8
npm.cmd install --save-dev @capacitor/cli@^8
```

Expected: `package.json` and `package-lock.json` contain one compatible Capacitor 8 major line with no forced peer override.

- [ ] **Step 3: Add Capacitor config and scripts**

Create `capacitor.config.ts` with the immutable ID and build output:

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.novelbag.app',
  appName: '小说袋',
  webDir: 'dist',
}

export default config
```

Add these scripts while preserving every existing one:

```json
"android:sync": "npm run build && cap sync android",
"android:open": "cap open android",
"android:build": "npm run build && cap sync android && cd android && gradlew.bat assembleDebug"
```

- [ ] **Step 4: Add native artifact ignore rules**

Append only these Android-specific exclusions to `.gitignore`:

```gitignore
# Android local/build artifacts
android/local.properties
android/.gradle/
android/build/
android/app/build/
android/**/*.keystore
android/**/*.jks
android/**/*.db
android/**/*.db-shm
android/**/*.db-wal
```

Do not ignore `android/` wholesale; generated Android source must remain reviewable.

- [ ] **Step 5: Verify the existing Web bundle before adding Android platform files**

Run:

```powershell
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

Expected: all three pass; `dist/index.html` exists for Capacitor.

- [ ] **Step 6: Create the Android project without building an APK**

Run:

```powershell
npx cap add android
```

Expected: `android/` exists and its generated application ID is `com.novelbag.app`. Do not run Gradle or install SDK components in this task.

- [ ] **Step 7: Review configuration-only changes**

Run:

```powershell
git diff --check
git status --short
git diff -- package.json capacitor.config.ts .gitignore android
```

Expected: no whitespace errors, no `local.properties`, keystore, database, SDK path, real backup, or build directory appears in the change set. Do not stage or commit.

## Task 2: Build and Test the Single Data-Source Resolver

**Files:**
- Create: `src/data/dataSource.ts`
- Create: `src/data/dataSource.test.ts`
- Modify: `src/api/supabaseClient.ts`

**Interfaces:**
- Produces `DataSource = 'mobile' | 'supabase' | 'local'`.
- Produces `resolveDataSource(options?)`, `isMobileDataSource()` and `isSupabaseDataSource()`.
- Later tasks consume the resolver; no component or repository repeats environment parsing.

- [ ] **Step 1: Write failing resolver tests**

Create `src/data/dataSource.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveDataSource } from './dataSource'

describe('resolveDataSource', () => {
  it('selects mobile before an inherited Supabase environment value', () => {
    expect(resolveDataSource({ isNativePlatform: () => true, viteDataSource: 'supabase' })).toBe('mobile')
  })

  it('selects Supabase only on Web when explicitly configured', () => {
    expect(resolveDataSource({ isNativePlatform: () => false, viteDataSource: 'supabase' })).toBe('supabase')
  })

  it('selects Node local API by default on Web', () => {
    expect(resolveDataSource({ isNativePlatform: () => false, viteDataSource: undefined })).toBe('local')
  })
})
```

- [ ] **Step 2: Run the test to verify the missing module fails**

Run: `npm.cmd run test -- src/data/dataSource.test.ts`

Expected: FAIL because `./dataSource` does not yet exist.

- [ ] **Step 3: Implement the resolver with an injected test seam**

Create `src/data/dataSource.ts`:

```ts
import { Capacitor } from '@capacitor/core'

export type DataSource = 'mobile' | 'supabase' | 'local'

type ResolveOptions = {
  isNativePlatform?: () => boolean
  viteDataSource?: string | undefined
}

export function resolveDataSource(options: ResolveOptions = {}): DataSource {
  const isNativePlatform = options.isNativePlatform ?? (() => Capacitor.isNativePlatform())
  const viteDataSource = options.viteDataSource ?? import.meta.env.VITE_DATA_SOURCE

  if (isNativePlatform()) return 'mobile'
  return viteDataSource === 'supabase' ? 'supabase' : 'local'
}

export function isMobileDataSource(): boolean {
  return resolveDataSource() === 'mobile'
}

export function isSupabaseDataSource(): boolean {
  return resolveDataSource() === 'supabase'
}
```

Update `src/api/supabaseClient.ts` to import `isSupabaseDataSource` from this module instead of reading `import.meta.env` itself. Keep its localhost dummy client construction only for non-Supabase Web mode; no Supabase method may be called when the resolver returns `mobile`.

- [ ] **Step 4: Run focused and project tests**

Run:

```powershell
npm.cmd run test -- src/data/dataSource.test.ts
npm.cmd run test
```

Expected: all resolver cases pass and existing tests remain green.

- [ ] **Step 5: Review the decision boundary**

Run:

```powershell
rg -n "VITE_DATA_SOURCE|isNativePlatform\(|isNativePlatform\(\)|isSupabaseDataSource" src
git diff --check
```

Expected: the only raw `VITE_DATA_SOURCE` read is in `src/data/dataSource.ts`; callers consume exported helpers.

## Task 3: Create the Testable Mobile SQL Interface and v1 Migration

**Files:**
- Create: `src/data/mobile/sqlTypes.ts`
- Create: `src/data/mobile/mobileMigrations.ts`
- Create: `src/data/mobile/mobileDatabase.ts`
- Create: `src/data/mobile/testSupport/nodeMobileDatabase.ts`
- Create: `src/data/mobile/mobileMigrations.test.ts`

**Interfaces:**
- Produces `MobileSqlDatabase` with `execute`, `run`, `query`, `beginTransaction`, `commitTransaction`, and `rollbackTransaction`.
- Produces `MOBILE_SCHEMA_VERSION = 1`, `enableMobileForeignKeys(database)`, and `migrateMobileDatabase(database)`.
- Produces native-only `openMobileDatabase()` for later `mobileRepository.ts`.

- [ ] **Step 1: Write failing migration and rollback tests against an in-memory adapter**

Create tests that exercise the interface, including this core shape:

```ts
it('enables foreign keys before the v1 transaction and creates schema once', async () => {
  const database = new NodeMobileDatabase()
  await enableMobileForeignKeys(database)
  expect(await database.scalar<number>('PRAGMA foreign_keys')).toBe(1)

  await migrateMobileDatabase(database)

  expect(await database.scalar<number>('PRAGMA user_version')).toBe(1)
  expect(await database.scalar<number>('PRAGMA foreign_keys')).toBe(1)
  expect(await database.tableNames()).toEqual(expect.arrayContaining(['authors', 'novels', 'characters', 'tags', 'novel_tags']))
  expect(database.calls.indexOf('PRAGMA foreign_keys = ON')).toBeLessThan(database.calls.indexOf('BEGIN TRANSACTION'))

  await migrateMobileDatabase(database)
  expect(await database.scalar<number>('PRAGMA user_version')).toBe(1)
})

it('does not advance user_version when v1 DDL fails', async () => {
  const database = new NodeMobileDatabase({ failWhenSqlIncludes: 'CREATE TABLE IF NOT EXISTS tags' })
  await enableMobileForeignKeys(database)
  await expect(migrateMobileDatabase(database)).rejects.toThrow('migration 0 -> 1 failed')
  expect(await database.scalar<number>('PRAGMA foreign_keys')).toBe(1)
  expect(await database.scalar<number>('PRAGMA user_version')).toBe(0)
})
```

- [ ] **Step 2: Run the migration test to verify it fails**

Run: `npm.cmd run test -- src/data/mobile/mobileMigrations.test.ts`

Expected: FAIL because the SQL interfaces and migration do not exist.

- [ ] **Step 3: Implement the portable SQL contract and Node-only test adapter**

Create `sqlTypes.ts` with these contract types:

```ts
export type SqlValue = string | number | null
export type SqlRow = Record<string, unknown>

export interface MobileSqlDatabase {
  execute(statements: string): Promise<void>
  run(statement: string, values?: SqlValue[]): Promise<{ changes: number; lastInsertRowId?: number }>
  query<TRow extends SqlRow>(statement: string, values?: SqlValue[]): Promise<TRow[]>
  beginTransaction(): Promise<void>
  commitTransaction(): Promise<void>
  rollbackTransaction(): Promise<void>
}
```

Implement `NodeMobileDatabase` only under `testSupport/` with `DatabaseSync` from `node:sqlite`, promise-wrapped methods, a public `calls: string[]` log that records `PRAGMA foreign_keys = ON`, `BEGIN TRANSACTION`, `COMMIT` and `ROLLBACK` in execution order, and an optional `failWhenSqlIncludes` test hook. Keep every import of `node:sqlite` out of production source files.

- [ ] **Step 4: Implement transactional migration v1**

In `mobileMigrations.ts`, implement `enableMobileForeignKeys(database)` before any migration transaction. It executes `PRAGMA foreign_keys = ON`, immediately queries `PRAGMA foreign_keys`, and throws if the returned value is not `1`. Then build one migration array for `0 -> 1` that:

1. starts a transaction;
2. executes all five `CREATE TABLE` statements after foreign keys have already been enabled and verified;
3. creates indices for `novels.author_id`, `characters.novel_id` and `novel_tags.tag_id`;
4. includes `cover_image_path TEXT NULL`, `read_count >= 0`, the allowed business enums and `AUTOINCREMENT` on `novels.id`;
5. sets `PRAGMA user_version = 1` only after all statements succeed;
6. commits once, or rolls back and throws `migration 0 -> 1 failed: ${error instanceof Error ? error.message : String(error)}`.

Use `INTEGER PRIMARY KEY AUTOINCREMENT` for `novels.id`, so explicit restored IDs advance SQLite’s sequence and later generated IDs exceed the greatest preserved ID.

- [ ] **Step 5: Implement the native connection manager without Web side effects**

In `mobileDatabase.ts`, import `@capacitor-community/sqlite` only in this mobile-only module. Create a singleton `initializationPromise`; it creates/retrieves `novelbag.db`, opens it, invokes `enableMobileForeignKeys` and verifies the result before calling `migrateMobileDatabase`, then returns the adapter. The required order is `open connection → PRAGMA foreign_keys = ON → verify PRAGMA foreign_keys == 1 → BEGIN TRANSACTION → schema/index migration → PRAGMA user_version = 1 → COMMIT`. On migration failure, rollback leaves `user_version` unchanged. Do not call `openMobileDatabase()` at module evaluation time.

- [ ] **Step 6: Run migration verification**

Run:

```powershell
npm.cmd run test -- src/data/mobile/mobileMigrations.test.ts
npm.cmd run lint
```

Expected: v1 is idempotent, foreign keys are enabled and verified before `BEGIN TRANSACTION`, forced failure rolls back its version, and the production module contains no Node SQLite import.

## Task 4: Implement and Test Mobile Repository Create/List Round Trips

**Files:**
- Modify: `src/types/novel.ts`
- Create: `src/data/mobile/mobileNovelRepository.ts`
- Create: `src/data/mobile/mobileNovelRepository.test.ts`

**Interfaces:**
- Produces `StoredNovelPayload = NovelPayload & { coverImagePath?: string | null }`.
- Produces `MobileNovelRepository` with `listNovels()`, `getLibraryStatus()`, `createNovel(payload)`, `getNovelById(id)`, and `getCoverPath(id)`.
- Later CRUD and backup tasks consume these exact methods.

- [ ] **Step 1: Extend shared types and write failing create/list tests**

Add this optional internal field to `Novel`; keep it optional so existing Web mock records, Supabase rows and Node API payloads remain type-compatible:

```ts
coverImagePath?: string | null
```

Create a generated test fixture with no real titles or authors, then assert:

```ts
it('round-trips authors, ordered characters, deduplicated tags and optional cover paths', async () => {
  const repository = await createRepositoryForTest()
  const created = await repository.createNovel(makeNovelPayload({
    characters: [{ name: '角色二', attribute: '0' }, { name: '角色一', attribute: '1' }],
    tags: ['幻想', '幻想', '短篇'],
    coverImagePath: 'covers/123e4567-e89b-12d3-a456-426614174000.webp',
  }))

  expect(created.coverImagePath).toBe('covers/123e4567-e89b-12d3-a456-426614174000.webp')
  expect((await repository.listNovels())[0].characters).toEqual(created.characters)
  expect((await repository.listNovels())[0].tags).toEqual(['幻想', '短篇'])
})
```

- [ ] **Step 2: Run the repository test to verify it fails**

Run: `npm.cmd run test -- src/data/mobile/mobileNovelRepository.test.ts`

Expected: FAIL because `MobileNovelRepository` does not yet exist.

- [ ] **Step 3: Implement parameterized insert and efficient aggregate reads**

Implement these repository details:

- `createNovel` starts one transaction, obtains or inserts an author, inserts the novel with a bound `cover_image_path`, bulk-inserts ordered characters and links deduplicated trimmed tags.
- `listNovels` uses one novels/authors query, one characters query ordered by `novel_id, sort_order, id`, and one tags join query. Group related rows by `novel_id` in memory before returning `Novel[]`.
- `getLibraryStatus` returns `{ novelCount, authorCount, tagCount, schemaVersion }` from direct count/pragma queries.
- Values use only `?` placeholders and `SqlValue[]`; never interpolate title, author, tag or path.

- [ ] **Step 4: Add author/tag de-duplication and default-cover assertions**

Add a test that creates two generated books with the same author and overlapping tags. Assert `authorCount === 1`, each tag has one row, and an input without `coverImagePath` returns `coverImagePath: null` while retaining its `cover` CoverStyle.

- [ ] **Step 5: Run focused repository tests**

Run:

```powershell
npm.cmd run test -- src/data/mobile/mobileNovelRepository.test.ts
npm.cmd run test
```

Expected: real in-memory SQL validates the round trip, relation order, tags, author de-duplication and default cover behavior.

## Task 5: Implement Repository Update/Delete Transactions and Metadata Cleanup

**Files:**
- Modify: `src/data/mobile/mobileNovelRepository.ts`
- Modify: `src/data/mobile/mobileNovelRepository.test.ts`

**Interfaces:**
- Produces `updateNovel(id, payload): Promise<{ novel: Novel; releasedCoverPaths: string[] }>`.
- Produces `deleteNovel(id)` and `deleteNovels(ids)` returning `{ deletedIds: number[]; releasedCoverPaths: string[] }` only after a successful database commit.
- Later cover orchestration consumes `releasedCoverPaths` after commit.

- [ ] **Step 1: Write failing update, single-delete and bulk-delete tests**

Test the transactional contract with generated data:

```ts
it('cleans unreferenced authors and tags in the same bulk-delete transaction', async () => {
  const repository = await createRepositoryForTest()
  const first = await repository.createNovel(makeNovelPayload({ author: '共享作者', tags: ['保留标签', '删除标签'] }))
  const second = await repository.createNovel(makeNovelPayload({ author: '共享作者', tags: ['保留标签'] }))

  await repository.deleteNovels([first.id])
  expect(await repository.getLibraryStatus()).toMatchObject({ novelCount: 1, authorCount: 1, tagCount: 1 })

  await repository.deleteNovel(second.id)
  expect(await repository.getLibraryStatus()).toMatchObject({ novelCount: 0, authorCount: 0, tagCount: 0 })
})
```

Add an update test that replaces author, characters, tags and `coverImagePath`, then verifies the returned `releasedCoverPaths` contains only the former valid path.

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `npm.cmd run test -- src/data/mobile/mobileNovelRepository.test.ts`

Expected: FAIL because the update/delete methods and cleanup behavior are absent.

- [ ] **Step 3: Implement update and deletion in explicit transactions**

Within each operation’s one database transaction:

1. read the existing novel and fail as not found without changing state;
2. replace base row, character rows and tag relations as necessary;
3. for deletes, remove `novel_tags`, `characters`, then novels;
4. execute exact orphan cleanup SQL before commit:

```sql
DELETE FROM authors
WHERE NOT EXISTS (SELECT 1 FROM novels WHERE novels.author_id = authors.id);

DELETE FROM tags
WHERE NOT EXISTS (SELECT 1 FROM novel_tags WHERE novel_tags.tag_id = tags.id);
```

5. commit; only after commit return the previous cover paths whose database references were removed.

On any SQL failure, roll back and return no released cover path. Do not call Filesystem from this repository.

- [ ] **Step 4: Add rollback injection coverage**

Configure `NodeMobileDatabase` to throw during a relation insert/delete. Assert the original novel count, author count, tag count and book contents stay unchanged after the rejected operation.

- [ ] **Step 5: Run repository regression tests**

Run:

```powershell
npm.cmd run test -- src/data/mobile/mobileNovelRepository.test.ts
npm.cmd run lint
git diff --check
```

Expected: update/delete operations are atomic, authors/tags are cleaned inside the database transaction, and filesystem work is still absent from SQL code.

## Task 6: Build Strict, Portable JSON Parsing and Preview

**Files:**
- Create: `src/data/mobile/mobileBackup.ts`
- Create: `src/data/mobile/mobileBackup.test.ts`
- Modify: `src/types/novel.ts`

**Interfaces:**
- Produces `PortableNovelBackup`, `PortableBackupNovel`, `ParsedMobileBackup`, `BackupValidationIssue`, `MobileBackupValidationResult`, and `MobileBackupPreview`.
- Produces `validateMobileBackup(raw): MobileBackupValidationResult`, where `parsed` is `ParsedMobileBackup | null`, and `previewMobileBackup(raw, targetCount)` returning `canRestore`, source/valid/error counts and duplicate warnings without writing SQL.
- Only a result with `issues.length === 0` and `parsed !== null` may supply `ParsedMobileBackup` to `restoreMobileBackup`; illegal business data must never produce a restoreable parsed value.

- [ ] **Step 1: Define portable backup types and write failing validation tests**

Add types that explicitly exclude `coverImagePath` from `PortableBackupNovel` and permit only this optional metadata:

```ts
coverImage?: { kind: 'local'; included: false }
```

Create tests for these cases:

```ts
it('accepts date-only and ISO datetimes without changing their strings', () => {
  const validation = validateMobileBackup(makeBackup([{ createdAt: '2026-06-10', updatedAt: '2026-06-10T12:30:00.000Z' }]))
  expect(validation.issues).toEqual([])
  expect(validation.parsed?.novels[0]).toMatchObject({ createdAt: '2026-06-10', updatedAt: '2026-06-10T12:30:00.000Z' })
})

it('reports the exact novel and field for invalid id and invalid date', () => {
  const preview = previewMobileBackup(makeBackup([{ id: 0, createdAt: '2026-15-40' }]), 3)
  expect(preview.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining(['novels[0].id', 'novels[0].createdAt']))
  expect(preview.canRestore).toBe(false)
})
```

Include tests for nonempty title/author, characters array/name/attribute, CP, ending normalization, status, rating, cover, boolean favorite, nonnegative integer `readCount`, string tags/notes, count mismatch, duplicate backup IDs, and duplicate normalized title+author warning.

- [ ] **Step 2: Run validation tests to verify they fail**

Run: `npm.cmd run test -- src/data/mobile/mobileBackup.test.ts`

Expected: FAIL because parser and types are missing.

- [ ] **Step 3: Implement the validation result and strict type boundary**

Implement `validateMobileBackup(raw: unknown): MobileBackupValidationResult` with this exact result shape:

```ts
type MobileBackupValidationResult = {
  parsed: ParsedMobileBackup | null
  issues: BackupValidationIssue[]
  duplicateNovelKeys: string[]
}
```

The validator has this behavior:

- require a top-level object containing a `novels` array;
- when `id` is present, require an internally unique positive integer（唯一的正整数）and preserve it exactly; when absent, represent it as `undefined` so SQLite generates it during restore;
- preserve valid `YYYY-MM-DD` and valid ISO-8601 datetime source strings exactly; do not instantiate a date-only value and reformat it through a timezone;
- reject every other date with a `BackupValidationIssue` whose `path` includes `novels[index].createdAt` or `updatedAt`;
- convert only explicitly supported legacy ending values through one shared `normalizeImportedEnding` function; reject all unknown enums;
- strip `coverImagePath` and any unknown input properties from output; retain only `coverImage: { kind: 'local', included: false }` metadata;
- collect all issues before returning; if any issue exists, return `parsed: null`; only when all records are valid return `parsed` with the sanitized `ParsedMobileBackup`.

- [ ] **Step 4: Implement preview without persistence**

`previewMobileBackup` must compute:

```ts
{
  sourceCount: number,
  validCount: number,
  errorCount: number,
  targetCount: number,
  duplicateNovelKeys: string[],
  issues: BackupValidationIssue[],
  canRestore: boolean,
}
```

Make `previewMobileBackup(raw, targetCount)` call `validateMobileBackup(raw)` and use its result. Set `canRestore` only when `issues.length === 0 && parsed !== null`; duplicate normalized title+author keys remain warnings, not automatic merges or invalidation. Do not expose a separate unchecked parser to repository or UI code.

- [ ] **Step 5: Run parser/preview tests**

Run:

```powershell
npm.cmd run test -- src/data/mobile/mobileBackup.test.ts
npm.cmd run test
```

Expected: bad JSON models cannot become importable and valid date values retain their exact source text.

## Task 7: Implement Backup Restore, Export, ID Preservation and Rollback

**Files:**
- Modify: `src/data/mobile/mobileNovelRepository.ts`
- Modify: `src/data/mobile/mobileBackup.ts`
- Modify: `src/data/mobile/mobileBackup.test.ts`

**Interfaces:**
- Produces `restoreMobileBackup(repository, parsedBackup): Promise<{ importedAt: string; count: number; novels: Novel[]; releasedCoverPaths: string[] }>`.
- Produces `exportMobileBackup(repository): Promise<PortableNovelBackup>`.
- Requires `ParsedMobileBackup` obtained only from a `MobileBackupValidationResult` where `issues.length === 0` and `parsed !== null`; raw files and invalid validation results cannot reach this method.

- [ ] **Step 1: Write failing restore/export and sequence tests**

Add these representative tests:

```ts
it('restores valid explicit ids and allocates the next created id above the maximum', async () => {
  const repository = await createRepositoryForTest()
  const validation = validateMobileBackup(makeBackup([{ id: 17 }, { id: 42 }]))
  if (!validation.parsed) throw new Error('fixture must be valid')
  await restoreMobileBackup(repository, validation.parsed)

  const created = await repository.createNovel(makeNovelPayload())
  expect(created.id).toBeGreaterThan(42)
})

it('rolls back a replacement restore if a relation write fails', async () => {
  const repository = await createRepositoryForTest({ failWhenSqlIncludes: 'INSERT INTO novel_tags' })
  await repository.createNovel(makeNovelPayload({ title: '恢复前记录' }))
  const validation = validateMobileBackup(makeBackup([{ tags: ['触发失败'] }]))
  if (!validation.parsed) throw new Error('fixture must be valid')

  await expect(restoreMobileBackup(repository, validation.parsed)).rejects.toThrow()
  expect((await repository.listNovels()).map((novel) => novel.title)).toEqual(['恢复前记录'])
})
```

Add a generated 425-like test that imports 425 generated records, exports them, parses the export, restores into a fresh in-memory repository and compares normalized structured fields. It must not read a fixture from disk.

Add this mixed ID ordering test, keeping characters/tags on every generated record so relation mapping is exercised:

```ts
it('restores mixed missing and explicit ids without primary-key collisions', async () => {
  const repository = await createRepositoryForTest()
  const validation = validateMobileBackup(makeBackup([
    { id: undefined, title: '自动一' },
    { id: 1, title: '显式一' },
    { id: undefined, title: '自动二' },
    { id: 42, title: '显式四二' },
  ]))
  if (!validation.parsed) throw new Error('fixture must be valid')

  await restoreMobileBackup(repository, validation.parsed)
  const restored = await repository.listNovels()
  expect(restored.find((novel) => novel.title === '显式一')?.id).toBe(1)
  expect(restored.find((novel) => novel.title === '显式四二')?.id).toBe(42)
  expect(new Set(restored.map((novel) => novel.id)).size).toBe(4)
  expect((await repository.createNovel(makeNovelPayload())).id).toBeGreaterThan(Math.max(...restored.map((novel) => novel.id)))
})
```

- [ ] **Step 2: Run restore tests to verify they fail**

Run: `npm.cmd run test -- src/data/mobile/mobileBackup.test.ts`

Expected: FAIL because restore/export orchestration does not exist.

- [ ] **Step 3: Implement one-transaction replacement restore**

In repository code, use the following transaction sequence only after parser success:

```text
BEGIN
DELETE FROM novel_tags
DELETE FROM characters
DELETE FROM novels
DELETE FROM tags
DELETE FROM authors
INSERT authors/novels/characters/tags/novel_tags from validated records
COMMIT
```

Before the transaction, read existing valid `cover_image_path` values into memory solely as candidates for later cleanup. Split the validated backup into explicit-ID and missing-ID records while preserving each record’s characters, tags and source data. In the first pass, insert every `id !== undefined` record with that explicit ID, creating its author, characters, tags and relations against the final explicit novel ID. In the second pass, insert every missing-ID record with the id column omitted, capture SQLite’s generated novel ID, then create its characters, tags and relations against that generated ID. Never insert a missing-ID record before explicit-ID records, regardless of original backup order. Always set `cover_image_path` to `NULL` during both passes, regardless of `coverImage` metadata. On any error, roll back before returning an error. After commit, return the pre-read paths as `releasedCoverPaths`; do not delete a database file, call `deleteDatabase`, or mutate files before commit.

- [ ] **Step 4: Implement portable export**

Read all models through `listNovels`, construct `{ exportedAt, count, novels }`, remove `coverImagePath` from every object, and add `{ kind: 'local', included: false }` only for entries that had a non-null custom path. Keep all structured business fields including `id`; do not add image bytes or absolute paths.

- [ ] **Step 5: Run round-trip, rollback and large-import tests**

Run:

```powershell
npm.cmd run test -- src/data/mobile/mobileBackup.test.ts
npm.cmd run test
npm.cmd run lint
```

Expected: 425 generated records import in one transaction, injected failure preserves the preexisting library, IDs are preserved/generated correctly, and export is portable.

## Task 8: Implement Private Cover Storage and Post-Commit Cleanup

**Files:**
- Create: `src/data/mobile/mobileCoverStorage.ts`
- Create: `src/data/mobile/mobileCoverStorage.test.ts`
- Modify: `src/types/novel.ts`

**Interfaces:**
- Produces `CoverChange = { kind: 'keep' } | { kind: 'replace'; file: CoverInputFile } | { kind: 'remove' }`.
- Produces `MobileCoverStorage.save(file)`, `resolveUri(relativePath)`, `deleteIfUnreferenced(relativePath, isReferenced)` and `assertCoverImagePath(path)`.
- `CoverInputFile` is structural (`name`, `type`, `size`, `arrayBuffer`) so browser `File` is accepted while Vitest can use generated fake files.

- [ ] **Step 1: Write failing validation and operation-order tests**

Create a fake filesystem adapter recording calls. Test:

```ts
it('writes a UUID private path only for permitted image files under 10 MB', async () => {
  const storage = new MobileCoverStorage(fakeFilesystem, () => '123e4567-e89b-12d3-a456-426614174000')
  await expect(storage.save(fakeFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }))).rejects.toThrow('10 MB')

  await expect(storage.save(fakeFile({ type: 'image/gif' }))).rejects.toThrow('JPEG、PNG 或 WebP')
  await expect(storage.save(fakeFile({ type: 'image/webp' }))).resolves.toBe('covers/123e4567-e89b-12d3-a456-426614174000.webp')
})
```

Test invalid path rejection (`../`, `file://`, arbitrary names, malformed UUIDs, wrong UUID variant/version nibble), `getUri` fallback behavior, and that an old image’s delete call occurs only after an injected successful database update callback.

- [ ] **Step 2: Run cover tests to verify they fail**

Run: `npm.cmd run test -- src/data/mobile/mobileCoverStorage.test.ts`

Expected: FAIL because storage abstractions are missing.

- [ ] **Step 3: Implement the filesystem adapter and strict path policy**

Implement with `@capacitor/filesystem` in the mobile-only module:

- accept exactly `image/jpeg`, `image/png`, `image/webp` and enforce `size <= 10 * 1024 * 1024`;
- map MIME to `.jpg`, `.png`, `.webp`; use `crypto.randomUUID()`; write under `Directory.Data` at `covers/<uuid>.<ext>`;
- encode binary only transiently for `Filesystem.writeFile`; never return encoding data;
- validate with the strict canonical UUID path rule `/^covers\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i` before `getUri` or delete; this rejects loose 36-character hex-and-hyphen strings that are not canonical UUIDs;
- resolve a display URI through `Filesystem.getUri` and `Capacitor.convertFileSrc`;
- treat a missing file during cleanup as already clean; reject every other invalid path before any filesystem call.

- [ ] **Step 4: Add storage-only cleanup safety tests**

Test `deleteIfUnreferenced(relativePath, isReferenced)` with a fake repository predicate. The method must call the predicate before `deleteFile`, delete only when the predicate resolves `false`, and treat a missing private file as already clean. A predicate error or Filesystem deletion error must reject as a cleanup error without attempting a broader path. The database/cover orchestration sequence itself is implemented and tested by the native composition layer in Task 9.

- [ ] **Step 5: Run cover tests**

Run:

```powershell
npm.cmd run test -- src/data/mobile/mobileCoverStorage.test.ts
npm.cmd run test
```

Expected: tests demonstrate that persistent storage keeps only safe relative paths and never deletes an old cover before SQL commit.

## Task 9: Compose the Native Repository and Dynamically Route the Unified API

**Files:**
- Create: `src/data/mobile/mobileRepository.ts`
- Create: `src/data/mobile/mobileLoader.ts`
- Modify: `src/api/novels.ts`
- Modify: `src/api/supabaseClient.ts`
- Create: `src/data/mobile/mobileLoader.test.ts`

**Interfaces:**
- Produces native methods `fetchNovels`, `createNovel`, `updateNovel`, `deleteNovel`, `deleteNovels`, `getLibraryStatus`, `previewNovelBackup`, `importNovelBackup`, `exportNovelBackup`, `shareNovelBackup`, and `resolveCustomCoverUri`.
- Produces `loadMobileRepository()` which resolves only when called from a `mobile` data-source branch.
- Existing `src/api/novels.ts` public signatures remain usable by `App.tsx`; `createNovel` and `updateNovel` gain an optional `CoverChange` argument that Web paths ignore.

- [ ] **Step 1: Write a failing loader test with an injected import function**

Design `createMobileRepositoryLoader(importRepository)` so its behavior is testable without real Capacitor:

```ts
it('does not import the mobile chunk until explicitly requested and caches the result', async () => {
  const importRepository = vi.fn(async () => ({ getMobileRepository: async () => fakeRepository }))
  const loader = createMobileRepositoryLoader(importRepository)

  expect(importRepository).not.toHaveBeenCalled()
  await loader.load()
  await loader.load()
  expect(importRepository).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the loader test to verify it fails**

Run: `npm.cmd run test -- src/data/mobile/mobileLoader.test.ts`

Expected: FAIL because the loader does not exist.

- [ ] **Step 3: Implement native composition and cleanup callbacks**

`getMobileRepository()` must lazily call `openMobileDatabase()`, then construct `MobileNovelRepository`, `MobileCoverStorage`, backup functions and Share adapter exactly once. It must:

- stage replacement cover files before repository create/update;
- clean a newly staged cover when database write rejects;
- process returned released cover paths only after repository commit and a reference query;
- export portable JSON to `Directory.Cache` and return a shareable URI through `Share.share`;
- expose initialization errors unchanged enough for UI to show “本地书库初始化失败”.

Implement these sequences in this composition layer, not in the SQL repository or Filesystem wrapper:

```text
create:  storage.save(new file) → repository.createNovel(path) → cleanup new path on DB failure
replace: storage.save(new file) → repository.updateNovel(new path) → delete unreferenced old path after commit
remove:  repository.updateNovel(NULL) → delete unreferenced old path after commit
delete:  repository.deleteNovel(s) → delete returned unreferenced paths after commit
restore: repository.restoreMobileBackup(...) → delete returned pre-restore paths only after commit and reference checks
```

- [ ] **Step 4: Update the API facade with explicit three-way routing**

For every public operation in `src/api/novels.ts`, branch once on `resolveDataSource()`:

```ts
if (resolveDataSource() === 'mobile') {
  return (await loadMobileRepository()).fetchNovels()
}
if (resolveDataSource() === 'supabase') {
  return fetchSupabaseNovels()
}
return fetchNodeLocalApi()
```

Apply equivalent routing to create/update/delete/bulk delete, JSON preview/import/export, library status and `resolveCustomCoverUri`. Keep current HTTP URLs and Supabase implementations byte-for-byte where their behavior is unchanged. Mobile CSV calls must throw the clear message `移动端 CSV 导入导出将在后续版本提供` rather than fetch Node endpoints.

- [ ] **Step 5: Verify Web paths do not initialize mobile code**

Run:

```powershell
npm.cmd run test -- src/data/dataSource.test.ts src/data/mobile/mobileLoader.test.ts
npm.cmd run build -- --manifest
rg -n "openMobileDatabase\(\)|Filesystem\." src/App.tsx src/components src/api
$manifest = Get-Content 'dist/.vite/manifest.json' -Raw | ConvertFrom-Json
$entry = $manifest.psobject.Properties.Value | Where-Object { $_.isEntry } | Select-Object -First 1
$entryFile = Join-Path 'dist' $entry.file
Select-String -Path $entryFile -Pattern '@capacitor-community/sqlite|@capacitor/filesystem|@capacitor/share' -Quiet
$mobileChunks = $manifest.psobject.Properties.Value | Where-Object { $_.src -match 'src/data/mobile/' }
$mobileChunks | ForEach-Object { Join-Path 'dist' $_.file } | ForEach-Object { Select-String -Path $_ -Pattern '@capacitor-community/sqlite|@capacitor/filesystem|@capacitor/share' }
```

Expected: the app/components have no native initialization, `openMobileDatabase()` appears only in the mobile composition module, and Vite emits a manifest-linked dynamic mobile chunk. The `Select-String -Quiet` check on the Web entry must be `False`; the mobile chunk inspection must locate the three native plugin identifiers only in the dynamic mobile chunk chain. If Vite’s optimized output removes package identifier strings, inspect the manifest’s entry/dynamic-import graph and the chunk source map instead; do not accept an unverified claim that the plugins are absent from the Web entry.

## Task 10: Integrate Portable Covers, Backup Preview and Mobile Data Management UI

**Files:**
- Create: `src/components/NovelCover.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/mobile/MobileHome.tsx`
- Modify: `src/components/mobile/MobileProfile.tsx`
- Modify: `src/components/mobile/MobileLibrary.tsx`
- Modify: `src/components/mobile/MobileAuthors.tsx`
- Modify: `src/components/mobile/MobileNovelDetail.tsx`
- Modify: `src/App.css`
- Modify: `src/components/mobile/mobile.css`
- Create: `src/components/NovelCover.test.ts`

**Interfaces:**
- `NovelCover({ novel, size })` replaces direct UI use of `CoverArt` for persisted novels.
- `NovelFormView` submits `NovelPayload` and an explicit `CoverChange`; it never writes a temporary object URL to a model.
- `BackupView` receives unified API results and renders JSON preview before confirmation.

- [ ] **Step 1: Write failing pure cover fallback tests**

Extract a pure helper from `NovelCover`, then test it without a DOM renderer:

```ts
it('uses the default artwork when no custom relative path is present', () => {
  expect(selectNovelCover({ cover: 'book', coverImagePath: null })).toEqual({ kind: 'default', cover: 'book' })
})

it('uses a resolved custom URI only for valid storage paths', () => {
  expect(selectNovelCover({ cover: 'book', coverImagePath: 'covers/123e4567-e89b-12d3-a456-426614174000.png' }, 'capacitor://image')).toEqual({ kind: 'image', src: 'capacitor://image' })
})
```

- [ ] **Step 2: Run the cover component test to verify it fails**

Run: `npm.cmd run test -- src/components/NovelCover.test.ts`

Expected: FAIL because `NovelCover` and its helper do not exist.

- [ ] **Step 3: Implement `NovelCover` and replace persisted-novel call sites**

`NovelCover` receives a `Novel` and existing `CoverArtSize`; it asynchronously calls the unified `resolveCustomCoverUri` API only when `coverImagePath` is valid. It does not import Capacitor or `mobileCoverStorage`. While resolving, after failure, or with no custom path, it renders `<CoverArt cover={novel.cover} size={size} />`. Replace persisted-novel display points in `App.tsx`, `MobileHome`, `MobileLibrary`, `MobileAuthors` and `MobileNovelDetail`; leave the underlying `CoverArt` component and its eight artwork variants intact.

- [ ] **Step 4: Update form cover state without changing Web persistence**

In `NovelFormView`, retain object URLs only for immediate preview and revoke them on replacement/unmount. Store a `CoverChange` state initialized to `keep`; selecting a validated file changes it to `replace`, and “使用默认封面” changes it to `remove` for existing custom covers. Change `onCreateNovel`/`onUpdateNovel` callbacks to pass this separate argument. The unified API ignores it for Node local/Supabase and sends it only through the mobile loader.

- [ ] **Step 5: Implement mobile JSON preview and accurate empty/data-management states**

Update `BackupView` to:

1. read the selected JSON with `File.text()`;
2. call the unified preview API;
3. display source/valid/error/duplicate/target counts and per-record errors;
4. disable confirmation when `canRestore` is false;
5. show “这将替换手机当前书库。” only for a nonempty mobile library;
6. call import only after an explicit confirmation;
7. show “自定义封面图片未包含在 JSON 数据备份中。” for mobile export and restore.

Pass presentation data from `App.tsx` to `MobileHome` and `MobileProfile` rather than having them evaluate environment flags. On a zero-book mobile library, expose both “导入现有书库” and “添加第一本”. In mobile profile show counts, initialization/schema status, import/export, theme and about; do not render cloud sync/login/logout content.

Add this data-safety copy exactly once in the native data-management presentation:

```text
卸载 App 或清除应用数据会删除手机书库和本地封面。
JSON 备份可恢复小说的结构化数据；自定义封面图片未包含在当前备份中，恢复后会使用默认封面。
```

- [ ] **Step 6: Preserve CSV and desktop behavior**

Keep existing Web JSON Blob download and CSV preview/import/export UI behavior. For mobile render a non-actionable CSV note with the same clear deferred message from Task 9; do not remove desktop controls and do not issue any mobile Node API request.

- [ ] **Step 7: Run UI-adjacent checks**

Run:

```powershell
npm.cmd run test -- src/components/NovelCover.test.ts
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

Expected: TypeScript verifies all form/API signatures, default artwork still compiles, and no UI module has gained direct SQLite/Filesystem/Supabase calls.

## Task 11: Run Full Web Regression and Review the Final Change Set

**Files:**
- Modify only files required by Tasks 1–10.

**Interfaces:**
- No new public interfaces. This task verifies completed data, UI, and Web compatibility.

- [ ] **Step 1: Run the complete automated suite**

Run:

```powershell
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

Expected: tests cover resolver, migration, CRUD, author/tag cleanup, generated 425-like restore, invalid rollback, IDs, dates, export/import, cover storage and fallback.

- [ ] **Step 2: Run focused static safety scans**

Run:

```powershell
rg -n "coverImagePath|content://|file://|data:image|URL\.createObjectURL" src
rg -n "@capacitor-community/sqlite|@capacitor/filesystem|@capacitor/share" src
rg -n "127\.0\.0\.1:3001|supabase" src/api src/App.tsx
```

Expected: long-lived path fields are handled only by the mobile storage/repository boundary; object URLs occur only for short-lived form previews; mobile paths do not lead to Node/Supabase calls; native plugin imports stay inside mobile-only chunks.

- [ ] **Step 3: Verify Web modes without accessing real local or cloud data**

For Web local, use an automatically generated temporary test database only if the existing Node API already supports selecting a safe temporary database path. Start that isolated server, then verify loading/search/filter/author/stats/random/backup screens render without importing, creating, editing or deleting records. Never open, copy, move, query or otherwise read `server/data/novels.db` or any real 425/427-book database. If the current Node API cannot select a temporary database safely, skip this manual local check and state exactly `因真实数据隔离约束未执行 Web local 手工回归` in the final report; do not alter the server only to access a real database.

For Supabase, only when an already-established account/session is available, verify the existing login/read-only navigation path without creating, editing or deleting cloud records. Do not print credentials. A missing network/session or remote failure is an environment observation and must not be attributed to Android storage code failure.

- [ ] **Step 4: Inspect Git scope and sensitive files**

Run:

```powershell
git diff --check
git status --short
git diff --stat
git diff -- .gitignore package.json capacitor.config.ts src android
```

Expected: no `.env`, `*.db`, `*.db-wal`, `*.db-shm`, real JSON/CSV/images, `android/local.properties`, `android/.gradle`, Android build output, JKS/keystore, SDK path or credential is included. Do not stage or commit.

## Task 12: Conditional Android Sync, Debug APK and Device Verification

**Files:**
- Modify generated Android config only when required by the resolved Capacitor/SQLite 8 compatibility instructions.
- Expected artifact when toolchain is complete: `android/app/build/outputs/apk/debug/app-debug.apk`.

**Interfaces:**
- No application API changes. This is a native build and behavior verification gate.

- [ ] **Step 1: Re-check the actual toolchain before running any native command**

Run:

```powershell
java -version
where.exe java
adb version
where.exe adb
$env:ANDROID_HOME
$env:ANDROID_SDK_ROOT
Test-Path "$env:LOCALAPPDATA\Android\Sdk"
npm ls @capacitor/core @capacitor/android @capacitor-community/sqlite @capacitor/filesystem @capacitor/share
```

Expected: a JDK and Android SDK/adb satisfying the resolved package compatibility matrix are available. If Java remains 8, `adb` is unavailable, SDK paths are absent, or the required Android platform is missing, stop this task and report each missing item; do not install anything and do not claim APK verification.

- [ ] **Step 2: Apply only package-required Android project settings when the toolchain is ready**

Inspect the resolved SQLite plugin Android requirements and generated Gradle files. Keep `com.novelbag.app` unchanged. Apply only the required `minSdk`, `compileSdk`, `targetSdk`, AGP/JDK compatibility and manifest backup/extraction settings; do not add `MANAGE_EXTERNAL_STORAGE`, broad media permissions, network services, analytics, ad SDKs or signing credentials.

- [ ] **Step 3: Synchronize Capacitor assets**

Run: `npx cap sync android`

Expected: Vite `dist` copies into Android assets and the native SQLite/Filesystem/Share plugin registrations complete without a Node/Supabase endpoint configured for runtime use.

- [ ] **Step 4: Build the debug APK**

Run: `./android/gradlew.bat assembleDebug`

Expected: success and a file at `android/app/build/outputs/apk/debug/app-debug.apk`. Confirm with:

```powershell
Get-Item android/app/build/outputs/apk/debug/app-debug.apk
```

- [ ] **Step 5: Verify on an available emulator or physical device**

Install with `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`, then verify without any real 425-book import:

1. first launch is not blank and does not show a Supabase login;
2. flight mode still permits empty library, add, edit, delete, bulk delete, search, filters, authors, stats, random, details and theme;
3. empty library exposes “导入现有书库”; a generated JSON preview/import shows correct count;
4. invalid generated JSON leaves the database unchanged;
5. a small valid selected JPEG/PNG/WebP persists after restart, replacement keeps the old file until DB success, and delete removes the released image;
6. force-stop/relaunch retains SQLite data and valid image display;
7. JSON export opens Share and warns that custom images are excluded.

- [ ] **Step 6: Capture final verification evidence without publishing**

Run:

```powershell
git diff --check
git status --short --branch
git diff --stat
```

Report the branch, package versions, exact environment state, automated test results, `cap sync`/Gradle/APK outcome, device checks performed, Web regression outcome, the APK path only if it exists, and the explicit fact that real 425-book data was not accessed or modified. Do not commit, push, deploy, sign, or share the APK.
