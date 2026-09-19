export type View =
  | 'home'
  | 'all'
  | 'recent'
  | 'authors'
  | 'finished'
  | 'liked'
  | 'abandoned'
  | 'stats'
  | 'backup'
  | 'new'
  | 'edit'
  | 'cp-1v1'
  | 'cp-none'
  | 'cp-np'
  | 'profile'
  | 'detail'

export type DetailReturnView = Exclude<View, 'detail' | 'edit' | 'new' | 'profile'>

export type CharacterAttribute = '1' | '0' | '0.5' | '其他'
export type CpCategory = '1v1' | '无CP' | 'NP'
export type ReadStatus = '看完' | '荒废'
export type Rating = '喜欢' | '一般' | '不喜欢' | '未评价'

export type Character = {
  name: string
  attribute: CharacterAttribute
}

export type CoverStyle =
  | 'portrait'
  | 'apple'
  | 'cat'
  | 'book'
  | 'flower'
  | 'moon'
  | 'cloud'
  | 'line'

export type Novel = {
  id: number
  title: string
  author: string
  characters: Character[]
  cpCategory: CpCategory
  ending: 'HE' | 'BE' | 'OE' | '未完结' | '未知' | '坑' | '其他'
  status: ReadStatus
  rating: Rating
  readCount: number
  tags: string[]
  notes: string
  createdAt: string
  updatedAt: string
  cover: CoverStyle
  coverImagePath?: string | null
  favorite: boolean
}

export type NovelPayload = Omit<Novel, 'id'>

export type CoverInputFile = {
  name: string
  type: string
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

export type CoverChange =
  | { kind: 'keep' }
  | { kind: 'replace'; file: CoverInputFile }
  | { kind: 'remove' }

export type FilterState = {
  status: '全部' | ReadStatus
  rating: '全部' | Rating
  characterAttribute: '全部' | CharacterAttribute
  cpCategory: '全部' | CpCategory
  ending: string
  tag: string
}
