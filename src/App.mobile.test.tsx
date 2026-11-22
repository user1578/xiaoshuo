// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Area, CropperProps } from 'react-easy-crop'
import App from './App'
import { MobileCoverStorage } from './data/mobile/mobileCoverStorage'
import type { CoverChange, Novel, NovelPayload } from './types/novel'

const { loadRepository, installBackHandler } = vi.hoisted(() => ({
  loadRepository: vi.fn(),
  installBackHandler: vi.fn(),
}))

vi.mock('./data/dataSource', () => ({
  resolveDataSource: () => 'mobile',
  isSupabaseDataSource: () => false,
}))
vi.mock('./data/mobile/mobileLoader', () => ({ loadMobileRepository: loadRepository }))
vi.mock('./components/mobile/useAndroidBack', () => ({ useAndroidBack: installBackHandler }))
// Layout and image decoding are exercised in the real browser smoke check.
vi.mock('react-easy-crop', async () => {
  const { useEffect, useRef } = await import('react')
  return {
    default: function CropFixture({ image, setImageRef, onCropAreaChange }: CropperProps) {
      const imageRef = useRef<HTMLImageElement>(null)
      useEffect(() => {
        const area: Area = { x: 80, y: 40, width: 300, height: 400 }
        const image = imageRef.current
        if (!image) return
        Object.defineProperties(image, { naturalWidth: { value: 1000 }, naturalHeight: { value: 1000 } })
        setImageRef?.({ current: image })
        onCropAreaChange?.({ x: 8, y: 4, width: 30, height: 40 }, area)
      }, [onCropAreaChange, setImageRef])
      return <img alt="" ref={imageRef} src={image} />
    },
  }
})

const oldCover = 'covers/123e4567-e89b-42d3-a456-426614174000.png'
const generatedCover = 'blob:generated-original-cover'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j8z8AAAAASUVORK5CYII=', 'base64')

function makeNovel(id: number): Novel {
  return {
    id, title: `${id % 2 ? 'Generated match' : 'Generated extra'} ${id}`, author: 'Generated author',
    createdAt: '2026-11-22', updatedAt: id === 1 ? '2026-12-01' : '2026-11-22',
    characters: [], cpCategory: id === 3 ? 'NP' : '1v1', ending: 'HE',
    status: id === 2 ? '荒废' : '看完', rating: id === 5 || id === 1 ? '喜欢' : '一般',
    readCount: 1, tags: [], notes: '', cover: 'book', favorite: false,
    coverImagePath: id === 5 ? oldCover : null,
  }
}

let root: Root
let container: HTMLDivElement
let records: Novel[]
const createNovel = vi.fn()
const updateNovel = vi.fn()
const deleteNovels = vi.fn()

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  records = [3, 1, 5, 2, 7, 6, 4].map(makeNovel)
  createNovel.mockReset()
  updateNovel.mockReset()
  updateNovel.mockImplementation(async (id: number, payload: NovelPayload) => {
    const index = records.findIndex((novel) => novel.id === id)
    const novel = { ...records[index], ...payload }
    records[index] = novel
    return novel
  })
  deleteNovels.mockReset()
  deleteNovels.mockImplementation(async (ids: number[]) => {
    records = records.filter((novel) => !ids.includes(novel.id))
  })
  installBackHandler.mockClear()
  loadRepository.mockResolvedValue({
    fetchNovels: async () => records.slice(),
    getLibraryStatus: async () => ({ novelCount: records.length, schemaVersion: 1 }),
    resolveCustomCoverUri: async () => generatedCover,
    createNovel,
    updateNovel,
    deleteNovels,
  })
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  await act(async () => root.render(<App />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function element<T extends HTMLElement = HTMLElement>(selector: string) {
  const match = container.querySelector<T>(`.mobile-shell ${selector}`)
  if (!match) throw new Error(`Missing element: ${selector}`)
  return match
}

function button(text: string, selector = '') {
  const result = [...element(selector || '.mobile-content').querySelectorAll('button')]
    .find((item) => (item.getAttribute('aria-label') ?? item.textContent)?.trim() === text)
  if (!result) throw new Error(`Missing button: ${text}`)
  return result
}

const click = (target: HTMLElement) => act(async () => target.click())
const recent = () => [...element('.mobile-recent-list').querySelectorAll('button')]
const ids = (selector: string) =>
  [...container.querySelectorAll(`.mobile-shell ${selector} strong`)].map((node) => Number(node.textContent?.split(' ').at(-1)))

async function longPress(target: HTMLElement) {
  vi.useFakeTimers()
  await act(async () => {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true, pointerType: 'touch', pointerId: 1 }))
    await vi.advanceTimersByTimeAsync(510)
    target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true, pointerType: 'touch', pointerId: 1 }))
  })
  vi.useRealTimers()
  await click(target)
}

async function selectCover() {
  const input = element<HTMLInputElement>('.local-cover-input')
  const file = new File([new Uint8Array(png)], 'generated.png', { type: 'image/png' })
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
}

describe('mobile record order', () => {
  it('shows the five largest IDs on the home page even when dates match', () => {
    expect(ids('.mobile-recent-item')).toEqual([7, 6, 5, 4, 3])
  })

  it('preserves record order for searches and filters after an older record was edited', async () => {
    await click(button('查看全部'))
    expect(ids('.mobile-novel-card-main')).toEqual([7, 6, 5, 4, 3, 2, 1])
    const search = element<HTMLInputElement>('.mobile-search-field input')
    // Bypass React's instance setter to model a user input event.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'match')
    await act(async () => search.dispatchEvent(new Event('input', { bubbles: true })))
    expect(ids('.mobile-novel-card-main')).toEqual([7, 5, 3, 1])
    await click(button('打开筛选'))
    await click(button('1v1', '.filter-panel'))
    expect(ids('.mobile-novel-card-main')).toEqual([7, 5, 1])
  })
})

describe('home recent selection', () => {
  it('opens details on a regular click', async () => {
    await click(recent()[0])
    expect(element('.mobile-detail-page h2').textContent).toBe('Generated match 7')
  })

  it('selects the pressed book without opening details, then finishes selection on Android Back', async () => {
    await longPress(recent()[0])
    expect(recent()[0].getAttribute('aria-pressed')).toBe('true')
    expect(element('.mobile-recent-section').textContent).toContain('已选择 1 本')
    expect(container.querySelector('.mobile-detail-page')).toBeNull()
    await act(async () => installBackHandler.mock.lastCall?.[1]())
    expect(recent()[0].hasAttribute('aria-pressed')).toBe(false)
  })

  it('toggles books, scopes select-all, and confirms multi-delete before changing records', async () => {
    await longPress(recent()[0])
    await click(recent()[1])
    expect(element('.mobile-recent-section').textContent).toContain('已选择 2 本')
    expect(element('.mobile-recent-section').textContent).not.toContain('编辑')
    await click(button('全选'))
    expect(element('.mobile-recent-section').textContent).toContain('已选择 5 本')
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)
    await click(button('删除'))
    expect(deleteNovels).not.toHaveBeenCalled()
    await click(button('删除'))
    expect(confirm).toHaveBeenLastCalledWith('确定删除已选择的 5 本小说吗？')
    expect(deleteNovels).toHaveBeenCalledWith([7, 6, 5, 4, 3])
    expect(ids('.mobile-recent-item')).toEqual([2, 1])
    expect(recent()[0].hasAttribute('aria-pressed')).toBe(false)
  })

  it('opens the selected book for editing and supports finishing selection without edits', async () => {
    await longPress(recent()[2])
    await click(button('完成选择'))
    expect(recent()[2].hasAttribute('aria-pressed')).toBe(false)
    await longPress(recent()[2])
    await click(button('编辑'))
    expect(element<HTMLInputElement>('.form-panel input:not([type])').value).toBe('Generated match 5')
  })
})

describe('cover crop', () => {
  it('canceling a replacement preserves the saved cover in the form and on save', async () => {
    await longPress(recent()[2])
    await click(button('编辑'))
    expect(element<HTMLImageElement>('.local-cover-preview img').src).toBe(generatedCover)
    await selectCover()
    await click(button('取消', 'dialog[open]'))
    expect(container.querySelector('dialog[open]')).toBeNull()
    expect(element<HTMLImageElement>('.local-cover-preview img').src).toBe(generatedCover)
    await click(button('保存'))
    expect(updateNovel).toHaveBeenCalledWith(5, expect.anything(), { kind: 'keep' })
    expect(ids('.mobile-recent-item')).toEqual([7, 6, 5, 4, 3])
  })

  it('draws the selected crop at 3:4 and sends a supported file through private cover storage', async () => {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, type) {
      expect(this.width * 4).toBe(this.height * 3)
      callback(new Blob([new Uint8Array(png)], { type }))
    })
    const writeFile = vi.fn()
    const storage = new MobileCoverStorage({ writeFile, getUri: vi.fn(), deleteFile: vi.fn() }, () => '123e4567-e89b-42d3-a456-426614174001')
    createNovel.mockImplementation(async (payload: NovelPayload, change: CoverChange) => {
      if (change.kind !== 'replace') throw new Error('Missing cropped cover')
      const coverImagePath = await storage.save(change.file)
      const novel = { ...payload, id: 8, coverImagePath }
      records.push(novel)
      return novel
    })

    await click(button('新增小说'))
    await selectCover()
    expect(createNovel).not.toHaveBeenCalled()
    await click(button('确认裁剪', 'dialog[open]'))
    expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLImageElement), 80, 40, 300, 400, 0, 0, 600, 800)
    expect(element<HTMLImageElement>('.local-cover-preview img').src).toMatch(/^blob:/)
    await click(button('保存'))
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({
      path: 'covers/123e4567-e89b-42d3-a456-426614174001.png',
      data: png.toString('base64'),
    }))
    expect(element('.mobile-novel-card-main strong').textContent).toBe('新记录的故事')
  })
})
