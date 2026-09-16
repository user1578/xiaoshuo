# 小说袋手机端 UI 第一阶段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Execution status (2026-09-16):** Complete. The checklist remains as the implementation record; final test, build, responsive QA, and Git-audit evidence is reported with the delivery.

**Goal:** Deliver a mobile-first 小说袋 UI with four navigation tabs, independent mobile details, four persistent themes, and no data-layer changes.

**Architecture:** `App.tsx` remains the owner of data, filters, CRUD, duplicate checks, views, selected novel, and selected author. `src/components/mobile/` receives state and callbacks for presentation only; `src/theme/` owns theme metadata and CSS variables. Mobile details use `activeView: 'detail'` plus an in-memory return view rather than a router, while desktop keeps `DetailModal`.

**Tech Stack:** React 19, TypeScript, Vite, lucide-react, CSS variables, Vitest (dev-only tests).

**Spec:** `docs/superpowers/specs/2026-09-16-android-mobile-redesign-design.md`

## Global Constraints

- Work only on `android-mobile-redesign`; do not commit, push, deploy, or change Git history.
- Do not modify `src/api/*`, `server/*`, `supabase/*`, SQLite/Supabase schemas, real novel data, Vercel, or local/Supabase CRUD behavior.
- Do not add React Router, Capacitor, Android, SQLite Android, reader fields, or mock novels as formal data.
- `mockNovels` may remain an internal development example only; a real empty or failed load must show an empty/error state from `novels: []`.
- A selected local image may only be an in-memory `URL.createObjectURL` preview; it must not enter `Novel.cover`, any CRUD payload, API request, database, Supabase state, or persisted storage.
- Mobile is <=1080px. Verify 375px, 390px, 430px and a desktop viewport; preserve existing desktop `DetailModal`.

---

### Task 1: Establish shared types and a testable mobile state boundary

**Files:**
- Create: `src/types/novel.ts`
- Create: `src/components/mobile/mobileState.ts`
- Create: `src/components/mobile/mobileState.test.ts`
- Modify: `src/App.tsx:48-153`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: the existing `Novel`, `CoverStyle`, `FilterState`, and `View` declarations in `App.tsx`.
- Produces: `Novel`, `NovelPayload`, `CoverStyle`, `FilterState`, `View`, `DetailReturnView`, and `pickNextNovelId<T extends { id: number }>()` for the root and mobile components.

- [ ] **Step 1: Add a failing test for deterministic random selection and detail-return validation.**

```ts
import { describe, expect, it } from 'vitest'
import { detailReturnView, pickNextNovelId } from './mobileState'

describe('pickNextNovelId', () => {
  it('excludes the previous ID when another novel exists', () => {
    expect(pickNextNovelId([{ id: 1 }, { id: 2 }], 1, () => 0)).toBe(2)
  })
})

describe('detailReturnView', () => {
  it('keeps navigable list and home views but rejects detail and edit', () => {
    expect(detailReturnView('authors')).toBe('authors')
    expect(detailReturnView('detail')).toBe('home')
    expect(detailReturnView('edit')).toBe('home')
  })
})
```

- [ ] **Step 2: Add Vitest and run the new test to verify that it fails because the module does not exist.**

Run: `npm.cmd install --save-dev vitest` then add `"test": "vitest run"` to `package.json`, then run `npm.cmd run test -- src/components/mobile/mobileState.test.ts`.

Expected: FAIL with a missing `./mobileState` module before implementation.

- [ ] **Step 3: Move the current domain types to `src/types/novel.ts` and implement the smallest pure helpers.**

```ts
export type View = 'home' | 'all' | 'recent' | 'authors' | 'finished' | 'liked' | 'abandoned' | 'stats' | 'backup' | 'new' | 'edit' | 'cp-1v1' | 'cp-none' | 'cp-np' | 'profile' | 'detail'
export type DetailReturnView = Exclude<View, 'detail' | 'edit' | 'new' | 'profile'>

export function pickNextNovelId<T extends { id: number }>(novels: T[], previousId: number | null, random = Math.random) {
  const candidates = novels.length > 1 && previousId !== null ? novels.filter((novel) => novel.id !== previousId) : novels
  return candidates.length === 0 ? null : candidates[Math.floor(random() * candidates.length)]?.id ?? null
}

export function detailReturnView(view: View): DetailReturnView {
  return view === 'detail' || view === 'edit' || view === 'new' || view === 'profile' ? 'home' : view
}
```

- [ ] **Step 4: Run the focused test and TypeScript build to verify the shared types have no stale local declarations.**

Run: `npm.cmd run test -- src/components/mobile/mobileState.test.ts` and `npm.cmd run build`.

Expected: both commands PASS.

- [ ] **Step 5: Inspect only the task files and leave them unstaged.**

Run: `git diff -- src/App.tsx src/types/novel.ts src/components/mobile/mobileState.ts src/components/mobile/mobileState.test.ts package.json package-lock.json`.

Expected: types move without an API edit; no commit because the user prohibited commits.

### Task 2: Add the persistent four-theme system and shared cover primitive

**Files:**
- Create: `src/theme/themes.ts`
- Create: `src/components/CoverArt.tsx`
- Create: `src/components/mobile/ThemeSelector.tsx`
- Create: `src/theme/themes.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `CoverStyle` from `src/types/novel.ts` and the current CSS `cover-*` classes.
- Produces: `ThemeId`, `themes`, `readStoredTheme()`, `isThemeId()`, `ThemeSelector`, and a reusable `CoverArt` with `feature | wall | detail | thumb` size support.

- [ ] **Step 1: Write failing theme tests for default, invalid stored value, and valid stored value.**

```ts
import { expect, it } from 'vitest'
import { readStoredTheme } from './themes'

it('uses blue-red for an absent or invalid stored theme', () => {
  expect(readStoredTheme(null)).toBe('blue-red')
  expect(readStoredTheme('neon')).toBe('blue-red')
})

it('restores a valid stored theme', () => {
  expect(readStoredTheme('mist-wine')).toBe('mist-wine')
})
```

- [ ] **Step 2: Run the focused theme test and observe the expected missing-module failure.**

Run: `npm.cmd run test -- src/theme/themes.test.ts`.

Expected: FAIL because `src/theme/themes.ts` is not present.

- [ ] **Step 3: Implement the four color definitions, root persistence, selector, and extracted cover component.**

```ts
export const themeIds = ['blue-red', 'mono', 'mist-wine', 'charcoal'] as const
export type ThemeId = (typeof themeIds)[number]
export const readStoredTheme = (value: string | null): ThemeId => themeIds.includes(value as ThemeId) ? value as ThemeId : 'blue-red'
```

In `App.tsx`, initialize with `readStoredTheme(localStorage.getItem('novel-bag-theme'))`; in an effect set `document.documentElement.dataset.theme` and `localStorage.setItem('novel-bag-theme', theme)`. Define semantic variables under `:root` and each `:root[data-theme='…']`, then map the current legacy color variables to those semantic tokens. `ThemeSelector` renders four labelled buttons with four swatches from `themes` and calls `onThemeChange(theme.id)`.

- [ ] **Step 4: Run theme tests, lint, and build.**

Run: `npm.cmd run test -- src/theme/themes.test.ts`, `npm.cmd run lint`, `npm.cmd run build`.

Expected: PASS; theme changes are visual only and `CoverArt` keeps existing desktop visuals.

- [ ] **Step 5: Inspect the task diff and verify no theme value reaches a novel payload.**

Run: `rg -n "novel-bag-theme|data-theme|ThemeSelector|cover:" src/App.tsx src/theme src/components`.

Expected: only UI state and CSS token paths mention themes; `NovelPayload.cover` remains `CoverStyle`.

### Task 3: Make root state safe for failed loads and mobile detail return flows

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `src/components/mobile/mobileState.test.ts`

**Interfaces:**
- Consumes: `pickNextNovelId`, `detailReturnView`, shared `View`/`DetailReturnView`, current `createNovel`, `updateNovel`, and `deleteNovel` callbacks.
- Produces: `openMobileDetail(novel, source)`, `returnFromMobileDetail()`, `openEdit(novel)`, and detail-aware save/delete handlers for mobile components.

- [ ] **Step 1: Extend the failing helper test with the one-item random case.**

```ts
it('returns the only novel ID when the library has one book', () => {
  expect(pickNextNovelId([{ id: 7 }], 7, () => 0.8)).toBe(7)
})
```

- [ ] **Step 2: Run the focused test and confirm it fails before changing the helper.**

Run: `npm.cmd run test -- src/components/mobile/mobileState.test.ts`.

Expected: FAIL until the implementation handles the one-item candidate list.

- [ ] **Step 3: Replace formal mock initialization and wire the detail state in `App.tsx`.**

```ts
const [novels, setNovels] = useState<Novel[]>([])
const [detailReturnTo, setDetailReturnTo] = useState<DetailReturnView>('home')
const [homeRandomNovelId, setHomeRandomNovelId] = useState<number | null>(null)

const openMobileDetail = (novel: Novel, source: View) => {
  setSelectedNovel(novel)
  setDetailReturnTo(detailReturnView(source))
  setActiveView('detail')
}

const returnFromMobileDetail = () => {
  setSelectedNovel(null)
  setActiveView(detailReturnTo)
}
```

Use an effect that assigns `homeRandomNovelId` only when it is null and `novels.length > 0`. The refresh handler calls `pickNextNovelId` and updates `lastRandomNovelId`; it never calls `Math.random` during render. On an API failure preserve `novels: []`, set the error text, and render a retry/error state instead of setting `mockNovels`.

- [ ] **Step 4: Update create/edit/delete destinations without changing CRUD calls, then run focused tests and build.**

Run: `npm.cmd run test -- src/components/mobile/mobileState.test.ts` and `npm.cmd run build`.

Expected: PASS. Edit from detail returns to the latest selected novel in `detail`; delete from detail clears selection and returns to `detailReturnTo`; non-detail flows retain their existing destinations.

- [ ] **Step 5: Search root state for prohibited fallback behavior.**

Run: `rg -n "setNovels\(mockNovels\)|useState<Novel\[]>\(mockNovels\)|mockNovels\[0\]" src/App.tsx`.

Expected: no failed-load or formal-library path uses mock data.

### Task 4: Build mobile navigation, header, more drawer, and responsive shell

**Files:**
- Create: `src/components/mobile/MobileTopBar.tsx`
- Create: `src/components/mobile/MobileBottomNav.tsx`
- Create: `src/components/mobile/MobileMoreDrawer.tsx`
- Create: `src/components/mobile/mobile.css`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `View`, `ThemeId`, active view, drawer state, and `onNavigate(view)` supplied by `App.tsx`.
- Produces: a mobile-only shell with four primary tabs and the legacy view mappings exposed in the drawer.

- [ ] **Step 1: Write a failing test for the drawer’s required legacy destinations.**

```ts
import { mobileMoreViews } from './MobileMoreDrawer'

it('keeps every low-frequency legacy category reachable', () => {
  expect(mobileMoreViews.map((item) => item.id)).toEqual([
    'recent', 'finished', 'liked', 'abandoned', 'stats', 'cp-1v1', 'cp-none', 'cp-np',
  ])
})
```

- [ ] **Step 2: Run the focused test and verify the named export is absent.**

Run: `npm.cmd run test -- src/components/mobile/mobileState.test.ts`.

Expected: FAIL because `MobileMoreDrawer` does not export `mobileMoreViews`.

- [ ] **Step 3: Implement the shell and connect it to `App.tsx`.**

```tsx
export const mobileMoreViews = [
  { id: 'recent', label: '最近添加' }, { id: 'finished', label: '看完' },
  { id: 'liked', label: '喜欢' }, { id: 'abandoned', label: '荒废' },
  { id: 'stats', label: '统计' }, { id: 'cp-1v1', label: '1v1' },
  { id: 'cp-none', label: '无CP' }, { id: 'cp-np', label: 'NP' },
] satisfies { id: View; label: string }[]
```

Wrap the current desktop topbar/layout/footer in a desktop-only container. Render a sibling `.mobile-shell` that contains the new top bar, active mobile page, drawer, and bottom nav. The nav IDs are exactly `home`, `all`, `authors`, `profile`; the header/drawer has `aria-expanded`, an overlay close action, and a close-on-navigation callback.

- [ ] **Step 4: Add responsive CSS and verify the shell test, lint, and build.**

Run: `npm.cmd run test -- src/components/mobile/mobileState.test.ts`, `npm.cmd run lint`, `npm.cmd run build`.

Expected: PASS. At <=1080px `.desktop-shell` is hidden and `.mobile-shell` is visible; above it the opposite is true. Main mobile content includes `padding-bottom: calc(88px + env(safe-area-inset-bottom))`.

- [ ] **Step 5: Inspect accessibility and responsive selectors.**

Run: `rg -n "mobile-shell|safe-area|aria-expanded|mobileMoreViews" src/App.tsx src/components/mobile`.

Expected: a labelled four-tab nav and an accessible closeable drawer are present.

### Task 5: Implement mobile home and library presentation without new business state

**Files:**
- Create: `src/components/mobile/MobileHome.tsx`
- Create: `src/components/mobile/MobileLibrary.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/mobile/mobile.css`

**Interfaces:**
- Consumes: root `novels`, `visibleNovels`, statistics, query, filters, selected random novel, `CoverArt`, and navigation/detail callbacks.
- Produces: simple mobile cards whose clicks route through `openMobileDetail`, and no data writes.

- [ ] **Step 1: Add a failing test proving mobile home renders a supplied random novel rather than selecting during render.**

```ts
import { MobileHome } from './MobileHome'

it('receives the currently selected random novel as a prop', () => {
  expect(MobileHome).toBeTypeOf('function')
})
```

- [ ] **Step 2: Run the test and observe the missing component failure.**

Run: `npm.cmd run test -- src/components/mobile/mobileState.test.ts`.

Expected: FAIL because `MobileHome.tsx` is absent.

- [ ] **Step 3: Build the two presentation components and wire their callbacks.**

```tsx
<MobileHome
  randomNovel={homeRandomNovel}
  recentNovels={recentNovels.slice(0, 5)}
  stats={stats}
  query={query}
  onQueryChange={setQuery}
  onRefreshRandom={refreshHomeRandomNovel}
  onOpenNovel={(novel) => openMobileDetail(novel, 'home')}
/>
```

`MobileLibrary` receives `visibleNovels`, current view, query, filter state, and callbacks. It renders status Chips (`all`, `finished`, `liked`, `abandoned`), a filter trigger that reuses `FilterPanel`, a “批量管理” control that exposes the existing `LibraryView` bulk delete behavior, and a floating `new` action. Cards show cover, title, author, <=3 tags, state, and an explicit details affordance.

- [ ] **Step 4: Run focused tests, lint, and build.**

Run: `npm.cmd run test -- src/components/mobile/mobileState.test.ts`, `npm.cmd run lint`, `npm.cmd run build`.

Expected: PASS. The random card uses `homeRandomNovel`, never `mockNovels`; normal typing/filtering does not choose a new random title.

- [ ] **Step 5: Confirm the page retains required entry points.**

Run: `rg -n "换一本|查看详情|批量管理|新增小说|最近添加" src/components/mobile`.

Expected: all five labels and their event handlers are present.

### Task 6: Implement authors, profile, independent mobile detail, and mobile form preview

**Files:**
- Create: `src/components/mobile/MobileAuthors.tsx`
- Create: `src/components/mobile/MobileProfile.tsx`
- Create: `src/components/mobile/MobileNovelDetail.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/mobile/mobile.css`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: root authors/selectedAuthor, selected novel, detail return handlers, `BackupView`, theme selector, `CoverArt`, and existing form callbacks.
- Produces: independent mobile views which reuse source data and never invoke the API directly.

- [ ] **Step 1: Add a failing helper test for a detail delete return destination.**

```ts
it('uses the author list as the delete destination when it was the detail source', () => {
  expect(detailReturnView('authors')).toBe('authors')
})
```

- [ ] **Step 2: Run the focused test and verify it fails until the type-safe return helper is wired.**

Run: `npm.cmd run test -- src/components/mobile/mobileState.test.ts`.

Expected: FAIL if the helper is not imported or no longer preserves `authors`.

- [ ] **Step 3: Implement the views and integrate the mobile-only branches.**

```tsx
<MobileNovelDetail
  novel={selectedNovel}
  onBack={returnFromMobileDetail}
  onEdit={() => openEdit(selectedNovel)}
  onDelete={handleDeleteFromMobileDetail}
/>
```

`MobileAuthors` shows three `CoverArt` thumbnails per author and opens a selected author’s existing works list. `MobileProfile` links to the existing `BackupView`, renders `ThemeSelector`, opens the existing About modal, and preserves cloud logout. `MobileNovelDetail` confirms deletion, shows its own error text on a rejected delete, and calls the root handler only after confirmation. Do not render `DetailModal` while `activeView === 'detail'`.

In `NovelFormView`, add `localCoverPreviewUrl` state, revoke it in a cleanup effect, and render a file input/ref and preview image. `buildPayload()` must continue to assign only `previewNovel.cover`; no local preview variable may appear in its returned object.

- [ ] **Step 4: Run tests, lint, and build.**

Run: `npm.cmd run test`, `npm.cmd run lint`, `npm.cmd run build`.

Expected: PASS. Detail edit keeps the updated novel selected after save; successful detail deletion leaves `activeView` at its source and clears `selectedNovel`.

- [ ] **Step 5: Search for prohibited image persistence.**

Run: `rg -n "createObjectURL|localCoverPreview|base64|FileReader|payload" src/App.tsx src/components/mobile`.

Expected: only `createObjectURL`/preview markup and cleanup mention the local preview; no payload, API, or storage call carries it.

### Task 7: Complete responsive visual QA, functional regression, and delivery evidence

**Files:**
- Modify: `src/components/mobile/mobile.css`
- Modify: `src/App.css`
- Modify: `src/index.css`
- Modify: `docs/superpowers/specs/2026-09-16-android-mobile-redesign-design.md` only if implementation exposes an inaccuracy

**Interfaces:**
- Consumes: finished mobile shell and existing desktop layout.
- Produces: a verified responsive UI and an evidence-based final report; no API/schema/data change.

- [ ] **Step 1: Add a failing assertion for all four supported themes.**

```ts
import { themeIds } from '../../theme/themes'

it('exposes exactly the four approved themes', () => {
  expect(themeIds).toEqual(['blue-red', 'mono', 'mist-wine', 'charcoal'])
})
```

- [ ] **Step 2: Run the focused test and correct any token/configuration mismatch.**

Run: `npm.cmd run test -- src/components/mobile/mobileState.test.ts src/theme/themes.test.ts`.

Expected: PASS only after the theme IDs exactly match the approved four values.

- [ ] **Step 3: Start the Vite app and inspect 375px, 390px, 430px, and desktop.**

Run: `npm.cmd run dev -- --host 127.0.0.1`.

At each mobile width, inspect no horizontal scrolling, card/label separation, visible search, safe-area bottom padding, drawer bounds, scrollable form, scrollable detail, all four themes, local-image preview/disclaimer, and all required feature entry points. On desktop inspect the original sidebar/workspace and `DetailModal`.

- [ ] **Step 4: Run the final automated validation.**

Run: `npm.cmd run test`, `npm.cmd run lint`, `npm.cmd run build`, `git diff --check`, `git branch --show-current`, `git status --short`, `git diff --stat`.

Expected: test/lint/build/diff check PASS, branch is `android-mobile-redesign`, and only approved source/style/test/doc/package files changed.

- [ ] **Step 5: Perform a sensitive-file staging audit without staging or committing.**

Run: `git status --short; git ls-files --others --exclude-standard | rg "(^|/)(\.env|.*\.db(-shm|-wal)?|.*\.json|.*\.csv)$"`.

Expected: no secret, database, backup, CSV, `dist`, or `node_modules` file is added by this task. Report any pre-existing unrelated file separately.

## Self-Review

- **Spec coverage:** Tasks 1-3 cover state, errors, detail return, random behavior, and test infrastructure. Tasks 2 and 7 cover all themes and tokenized CSS. Tasks 4-6 cover every mobile navigation/page/form/detail requirement and preserve desktop behavior. Task 7 covers viewport, functional, build, Git, and sensitive-file acceptance evidence.
- **Placeholder scan:** This plan has no deferred requirements; each task names its files, interface, failing test, commands, expected result, and no-commit rule.
- **Type consistency:** `View`/`DetailReturnView` originate in `src/types/novel.ts`; `mobileState`, root callbacks, and mobile components import that single definition. `Novel.cover` remains `CoverStyle` throughout.
