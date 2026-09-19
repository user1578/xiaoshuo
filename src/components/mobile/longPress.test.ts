import { afterEach, describe, expect, it, vi } from 'vitest'
import { LongPressController } from './longPress'

describe('LongPressController', () => {
  afterEach(() => vi.useRealTimers())

  function start(pointerType = 'touch') {
    const onLongPress = vi.fn()
    const controller = new LongPressController(onLongPress)
    controller.pointerDown({ clientX: 10, clientY: 10, isPrimary: true, pointerId: 4, pointerType })
    return { controller, onLongPress }
  }

  it('does not fire before 500ms and fires exactly once at the threshold', () => {
    vi.useFakeTimers()
    const { controller, onLongPress } = start()

    vi.advanceTimersByTime(499)
    expect(onLongPress).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(800)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it('keeps a press with small jitter but cancels after movement exceeds tolerance', () => {
    vi.useFakeTimers()
    const jitter = start()
    jitter.controller.pointerMove({ clientX: 20, clientY: 10, pointerId: 4 })
    vi.advanceTimersByTime(500)
    expect(jitter.onLongPress).toHaveBeenCalledTimes(1)

    const moved = start()
    moved.controller.pointerMove({ clientX: 23, clientY: 10, pointerId: 4 })
    vi.advanceTimersByTime(500)
    expect(moved.onLongPress).not.toHaveBeenCalled()
  })

  it('cancels before threshold on pointerup or pointercancel', () => {
    vi.useFakeTimers()
    const released = start()
    released.controller.pointerUp(4)
    vi.advanceTimersByTime(500)
    expect(released.onLongPress).not.toHaveBeenCalled()

    const cancelled = start()
    cancelled.controller.pointerCancel(4)
    vi.advanceTimersByTime(500)
    expect(cancelled.onLongPress).not.toHaveBeenCalled()
  })

  it('suppresses only the click following a fired long press', () => {
    vi.useFakeTimers()
    const { controller } = start()
    vi.advanceTimersByTime(500)

    expect(controller.consumeSuppressedClick()).toBe(true)
    expect(controller.consumeSuppressedClick()).toBe(false)
  })

  it('does not suppress a click after a movement cancellation and ignores mouse pointers', () => {
    vi.useFakeTimers()
    const moved = start()
    moved.controller.pointerMove({ clientX: 30, clientY: 10, pointerId: 4 })
    expect(moved.controller.consumeSuppressedClick()).toBe(false)

    const mouse = start('mouse')
    vi.advanceTimersByTime(500)
    expect(mouse.onLongPress).not.toHaveBeenCalled()
  })

  it('cleans a pending timer on dispose', () => {
    vi.useFakeTimers()
    const { controller, onLongPress } = start()
    controller.dispose()
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
  })
})
