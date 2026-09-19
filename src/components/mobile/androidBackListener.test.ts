import { describe, expect, it, vi } from 'vitest'
import { AndroidBackListener } from './androidBackListener'

describe('AndroidBackListener', () => {
  it('does not load the native plugin when disabled or not running on Android', async () => {
    const loadApp = vi.fn()
    const disabled = new AndroidBackListener(loadApp, () => true, () => undefined)
    await disabled.start(false)
    expect(loadApp).not.toHaveBeenCalled()

    const web = new AndroidBackListener(loadApp, () => false, () => undefined)
    await web.start(true)
    expect(loadApp).not.toHaveBeenCalled()
  })

  it('registers one listener, uses the latest callback, and removes it once', async () => {
    let nativeCallback: (() => void) | undefined
    const remove = vi.fn(async () => undefined)
    const addListener = vi.fn(async (_event: 'backButton', callback: () => void) => {
      nativeCallback = callback
      return { remove }
    })
    const loadApp = vi.fn(async () => ({ App: { addListener } }))
    const first = vi.fn()
    const second = vi.fn()
    const listener = new AndroidBackListener(loadApp, () => true, first)

    await listener.start(true)
    await listener.start(true)
    listener.setCallback(second)
    nativeCallback?.()
    await listener.stop()
    await listener.stop()

    expect(loadApp).toHaveBeenCalledTimes(1)
    expect(addListener).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
