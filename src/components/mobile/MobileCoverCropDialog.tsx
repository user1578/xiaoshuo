import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { RefObject } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { coverFileExtension } from '../../data/mobile/coverInput'
import './mobileCoverCrop.css'

type CoverSource = { url: string; type: string }

const OUTPUT_WIDTH = 600
const OUTPUT_HEIGHT = 800
const MIN_ZOOM = 1
const MAX_ZOOM = 4
const CENTER = { x: 0, y: 0 }

async function cropCover(image: HTMLImageElement, area: Area, type: string): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_WIDTH
  canvas.height = OUTPUT_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前设备无法裁剪图片')

  const { naturalWidth, naturalHeight } = image
  context.drawImage(
    image, area.x * naturalWidth / 100, area.y * naturalHeight / 100,
    area.width * naturalWidth / 100, area.height * naturalHeight / 100,
    0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT,
  )
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9))
  if (!blob) throw new Error('无法生成裁剪图片，请重试')
  return new File([blob], `cover.${coverFileExtension(blob)}`, { type: blob.type })
}

export function MobileCoverCropDialog({ source, dialogRef, onCancel, onConfirm }: {
  source: CoverSource
  dialogRef?: RefObject<HTMLDialogElement | null>
  onCancel: () => void
  onConfirm: (file: File) => void
}) {
  const localDialogRef = useRef<HTMLDialogElement>(null)
  const dialog = dialogRef ?? localDialogRef
  const titleId = useId()
  const imageRef = useRef<RefObject<HTMLImageElement> | null>(null)
  const [crop, setCrop] = useState(CENTER)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [area, setArea] = useState<Area | null>(null)
  const [encoding, setEncoding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const captureImageRef = useCallback((ref: RefObject<HTMLImageElement>) => {
    imageRef.current = ref
  }, [])

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => {
      if (element?.open) element.close()
    }
  }, [dialog])

  const confirm = async () => {
    const image = imageRef.current?.current
    const element = dialog.current
    if (!area || !image || !element?.open || encoding) return
    setEncoding(true)
    setError(null)
    try {
      const file = await cropCover(image, area, source.type)
      if (element.isConnected && element.open) onConfirm(file)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '裁剪失败，请重试')
    } finally {
      setEncoding(false)
    }
  }

  return (
    <dialog
      aria-labelledby={titleId}
      className="mobile-cover-crop"
      onClose={(event) => {
        if (!event.currentTarget.open) onCancel()
      }}
      ref={dialog}
    >
      <h2 id={titleId}>裁剪封面</h2>
      <p>拖动图片调整位置，用双指或下方滑块缩放。</p>
      <div className="mobile-cover-crop-stage">
        <Cropper
          aspect={OUTPUT_WIDTH / OUTPUT_HEIGHT}
          crop={crop}
          cropperProps={{ 'aria-label': '封面裁剪区域' }}
          disableAutomaticStylesInjection
          image={source.url}
          maxZoom={MAX_ZOOM}
          mediaProps={{ alt: '', onError: () => setError('无法读取图片，请取消后选择其他图片') }}
          minZoom={MIN_ZOOM}
          onCropAreaChange={setArea}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          setImageRef={captureImageRef}
          zoom={zoom}
          zoomWithScroll={false}
        />
      </div>
      <label className="mobile-cover-crop-zoom">
        <span>缩放</span>
        <input
          disabled={!area || encoding}
          max={MAX_ZOOM}
          min={MIN_ZOOM}
          onChange={(event) => setZoom(event.target.valueAsNumber)}
          step="0.01"
          type="range"
          value={zoom}
        />
      </label>
      {error && <p className="mobile-cover-crop-error" role="alert">{error}</p>}
      <div className="mobile-cover-crop-actions">
        <button disabled={!area || encoding} onClick={() => { setCrop(CENTER); setZoom(MIN_ZOOM) }} type="button">重置</button>
        <button onClick={onCancel} type="button">取消</button>
        <button disabled={!area || encoding} onClick={() => void confirm()} type="button">{encoding ? '正在裁剪' : '确认裁剪'}</button>
      </div>
    </dialog>
  )
}
