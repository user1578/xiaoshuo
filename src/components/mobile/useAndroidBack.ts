import { Capacitor } from '@capacitor/core'
import { useEffect, useRef } from 'react'
import { AndroidBackListener } from './androidBackListener'

export function useAndroidBack(enabled: boolean, onBack: () => void): void {
  const callbackRef = useRef(onBack)

  useEffect(() => {
    callbackRef.current = onBack
  }, [onBack])

  useEffect(() => {
    const listener = new AndroidBackListener(
      () => import('@capacitor/app'),
      () => Capacitor.getPlatform() === 'android',
      () => callbackRef.current(),
    )
    void listener.start(enabled)
    return () => {
      void listener.stop()
    }
  }, [enabled])
}
