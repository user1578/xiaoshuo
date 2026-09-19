import { useEffect, useRef } from 'react'
import type { PointerEvent } from 'react'

export type LongPressPointer = {
  pointerId: number
  pointerType: string
  isPrimary: boolean
  clientX: number
  clientY: number
}

export type LongPressMove = Pick<LongPressPointer, 'pointerId' | 'clientX' | 'clientY'>

export class LongPressController {
  private readonly onLongPress: () => void
  private readonly thresholdMs: number
  private readonly movementTolerance: number
  private timer: ReturnType<typeof setTimeout> | null = null
  private activePointer: { id: number; x: number; y: number } | null = null
  private suppressNextClick = false

  constructor(
    onLongPress: () => void,
    thresholdMs = 500,
    movementTolerance = 12,
  ) {
    this.onLongPress = onLongPress
    this.thresholdMs = thresholdMs
    this.movementTolerance = movementTolerance
  }

  pointerDown(pointer: LongPressPointer): void {
    this.cancel()
    if (!pointer.isPrimary || pointer.pointerType === 'mouse') return

    this.activePointer = { id: pointer.pointerId, x: pointer.clientX, y: pointer.clientY }
    this.timer = setTimeout(() => {
      if (!this.activePointer) return
      this.timer = null
      this.activePointer = null
      this.suppressNextClick = true
      this.onLongPress()
    }, this.thresholdMs)
  }

  pointerMove(pointer: LongPressMove): void {
    if (!this.activePointer || this.activePointer.id !== pointer.pointerId) return
    const distance = Math.hypot(pointer.clientX - this.activePointer.x, pointer.clientY - this.activePointer.y)
    if (distance > this.movementTolerance) this.cancel()
  }

  pointerUp(pointerId: number): void {
    if (this.activePointer?.id === pointerId) this.cancel()
  }

  pointerCancel(pointerId: number): void {
    if (this.activePointer?.id === pointerId) this.cancel()
  }

  consumeSuppressedClick(): boolean {
    if (!this.suppressNextClick) return false
    this.suppressNextClick = false
    return true
  }

  dispose(): void {
    this.cancel()
    this.suppressNextClick = false
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.activePointer = null
  }
}

export function useLongPress(onLongPress: () => void) {
  const callbackRef = useRef(onLongPress)
  const controllerRef = useRef<LongPressController | null>(null)

  useEffect(() => {
    callbackRef.current = onLongPress
  }, [onLongPress])

  useEffect(() => {
    const controller = new LongPressController(() => callbackRef.current())
    controllerRef.current = controller
    return () => {
      controller.dispose()
      controllerRef.current = null
    }
  }, [])

  return {
    onClickCapture(event: { preventDefault(): void; stopPropagation(): void }) {
      if (!controllerRef.current?.consumeSuppressedClick()) return
      event.preventDefault()
      event.stopPropagation()
    },
    onPointerCancel(event: PointerEvent<HTMLElement>) {
      controllerRef.current?.pointerCancel(event.pointerId)
    },
    onPointerDown(event: PointerEvent<HTMLElement>) {
      controllerRef.current?.pointerDown(event)
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      controllerRef.current?.pointerMove(event)
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      controllerRef.current?.pointerUp(event.pointerId)
    },
  }
}
