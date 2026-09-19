import { expect, it } from 'vitest'
import { selectNovelCover } from './novelCoverSelection'

it('uses the default artwork when no custom relative path is present', () => {
  expect(selectNovelCover({ cover: 'book', coverImagePath: null })).toEqual({ kind: 'default', cover: 'book' })
})

it('uses a resolved custom URI only for valid storage paths', () => {
  expect(
    selectNovelCover(
      { cover: 'book', coverImagePath: 'covers/123e4567-e89b-12d3-a456-426614174000.png' },
      'capacitor://image',
    ),
  ).toEqual({ kind: 'image', src: 'capacitor://image' })
  expect(selectNovelCover({ cover: 'book', coverImagePath: 'file:///private/image.png' }, 'capacitor://image')).toEqual({
    kind: 'default',
    cover: 'book',
  })
})
