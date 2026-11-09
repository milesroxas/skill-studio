/**
 * Pictures on their way into the app. Whatever is dropped, pasted or picked
 * is redrawn before it is sent for keeping: upright, since a model is shown
 * the pixels and not the camera's rotation note, and inside the sizes Jev
 * reads, since Jev refuses a picture outside them. So every picture the app
 * keeps is a PNG or JPEG that both Jev and the assistant can read.
 */
import { addImages, fitForJev, type ImageRef, MAX_IMAGES } from '@domain/image.ts'
import { useRef, useState } from 'react'
import { api } from './api.ts'

/** A screenshot stays a PNG, so its text stays sharp, unless it is larger than this. */
const PNG_MAX_BYTES = 4 * 1024 * 1024
const JPEG_QUALITY = 0.9

async function redrawn(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const fit = fitForJev(bitmap.width, bitmap.height)
  const draw = (background: string | null): OffscreenCanvas => {
    const canvas = new OffscreenCanvas(fit.width, fit.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No canvas.')
    if (background) {
      context.fillStyle = background
      context.fillRect(0, 0, fit.width, fit.height)
    }
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      bitmap,
      Math.round((fit.width - fit.drawWidth) / 2),
      Math.round((fit.height - fit.drawHeight) / 2),
      fit.drawWidth,
      fit.drawHeight,
    )
    return canvas
  }
  try {
    if (file.type === 'image/png') {
      const png = await draw(null).convertToBlob({ type: 'image/png' })
      if (png.size <= PNG_MAX_BYTES) return png
    }
    // JPEG has no transparency: what was clear becomes white, not black.
    return await draw('#fff').convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
  } finally {
    bitmap.close()
  }
}

/** Base64 of a blob's bytes, built in pieces: one call cannot take a whole file as arguments. */
async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let at = 0; at < bytes.length; at += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(binary)
}

async function uploadPicture(file: File): Promise<ImageRef> {
  let blob: Blob
  try {
    blob = await redrawn(file)
  } catch {
    throw new Error(`${file.name || 'That file'} is not a picture this app can read.`)
  }
  return api.uploadImage({ name: file.name || 'picture', data: await base64Of(blob) })
}

/** The pictures among what was dropped or pasted. */
export const picturesIn = (data: DataTransfer | null): File[] =>
  [...(data?.files ?? [])].filter((file) => file.type.startsWith('image/'))

export interface AddPictures {
  /** How many are being read and sent for keeping. */
  adding: number
  /** Why the last one could not be added; null once another is. */
  error: string | null
  add: (files: File[]) => void
}

/**
 * Add pictures to a list that holds `held` of them. Each is sent for keeping,
 * then handed to `onAdded`; one that cannot be read, or that would pass the
 * limit, is reported and the rest still arrive.
 */
export function useAddPictures(held: number, onAdded: (images: ImageRef[]) => void): AddPictures {
  const [adding, setAdding] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // The list may change while a picture is on its way: the newest callback gets it.
  const latest = useRef(onAdded)
  latest.current = onAdded

  const add = (files: File[]) => {
    if (!files.length) return
    const taken = files.slice(0, Math.max(0, MAX_IMAGES - held - adding))
    setError(taken.length < files.length ? `${MAX_IMAGES} pictures at most.` : null)
    if (!taken.length) return
    setAdding((n) => n + taken.length)
    void Promise.allSettled(taken.map(uploadPicture)).then((results) => {
      setAdding((n) => n - taken.length)
      const failed = results.find((r) => r.status === 'rejected')
      if (failed) setError((failed.reason as Error).message)
      const added = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      if (added.length) latest.current(added)
    })
  }
  return { adding, error, add }
}

/** A list of pictures a composer holds until its request is sent. */
export interface Attached extends AddPictures {
  images: ImageRef[]
  remove: (image: ImageRef) => void
  /** Empty the list, or put back the pictures of a request that did not go. */
  reset: (images?: ImageRef[]) => void
}

export function useAttached(): Attached {
  const [images, setImages] = useState<ImageRef[]>([])
  const adder = useAddPictures(images.length, (added) =>
    setImages((held) => addImages(held, added)),
  )
  return {
    ...adder,
    images,
    remove: (image) => setImages((held) => held.filter((i) => i !== image)),
    reset: (next = []) => setImages(next),
  }
}
