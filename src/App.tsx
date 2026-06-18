import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode, TouchEvent } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  BarChart3,
  BookOpen,
  Cat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  Filter,
  Home,
  LibraryBig,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Star,
  Tags,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import {
  confirmCsvImport,
  exportNovelCsv,
  createNovel,
  deleteNovel,
  exportNovelBackup,
  fetchNovels,
  importNovelBackup,
  previewCsvImport,
  updateNovel,
} from './api/novels'
import {
  getSupabaseSession,
  isSupabaseDataSource,
  signInToSupabase,
  signOutFromSupabase,
} from './api/supabaseClient'
import './App.css'

type View =
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

type CharacterAttribute = '1' | '0' | '0.5' | '其他'
type CpCategory = '1v1' | '无CP' | 'NP'
type ReadStatus = '看完' | '荒废'
type Rating = '喜欢' | '一般' | '不喜欢' | '未评价'

type Character = {
  name: string
  attribute: CharacterAttribute
}

type CoverStyle =
  | 'portrait'
  | 'apple'
  | 'cat'
  | 'book'
  | 'flower'
  | 'moon'
  | 'cloud'
  | 'line'

const availableCovers: CoverStyle[] = ['portrait', 'apple', 'cat', 'book', 'flower', 'moon', 'cloud', 'line']
const cloudMode = isSupabaseDataSource()

type Novel = {
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
  favorite: boolean
}

type NovelPayload = Omit<Novel, 'id'>

type NovelBackup = {
  exportedAt: string
  count: number
  novels: Novel[]
}

type NovelImportResult = {
  importedAt: string
  count: number
  novels: Novel[]
}

type CsvImportPreviewRow = {
  rowNumber: number
  status: 'ready' | 'duplicate' | 'error'
  errors: string[]
  duplicateReasons: string[]
  novel: NovelPayload
}

type CsvImportPreview = {
  totalRows: number
  importableCount: number
  duplicateCount: number
  errorCount: number
  rows: CsvImportPreviewRow[]
}

type CsvImportResult = {
  importedAt: string
  importedCount: number
  duplicateCount: number
  errorCount: number
  novels: Novel[]
}

type FilterState = {
  status: '全部' | ReadStatus
  rating: '全部' | Rating
  characterAttribute: '全部' | CharacterAttribute
  cpCategory: '全部' | CpCategory
  ending: string
  tag: string
}

type NavItem = {
  id: View
  label: string
  icon: LucideIcon
  count: number
}

type PendingDuplicate = {
  match: Novel
  payload: NovelPayload
}

const mockNovels: Novel[] = [
  {
    id: 1,
    title: '月色失格',
    author: '青栀不眠',
    characters: [
      { name: '闻澈', attribute: '1' },
      { name: '许宁', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 4,
    tags: ['校园', '救赎', '双向暗恋'],
    notes: '像一束月光，照亮了无人问津的青春。后半段月色落幕，我们在人海中重逢。',
    createdAt: '2026-01-18',
    updatedAt: '2026-06-03',
    cover: 'moon',
    favorite: true,
  },
  {
    id: 2,
    title: '春日迟迟',
    author: '鹿与眠',
    characters: [
      { name: '江枝', attribute: '1' },
      { name: '沈遥', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: 'BE',
    status: '看完',
    rating: '一般',
    readCount: 2,
    tags: ['校园', '暗恋', '成长'],
    notes: '整个春天都给了你，可你却在夏天离开。',
    createdAt: '2026-02-12',
    updatedAt: '2026-04-25',
    cover: 'flower',
    favorite: false,
  },
  {
    id: 3,
    title: '潮汐回响',
    author: '浮游岛',
    characters: [
      { name: '林砚', attribute: '0.5' },
      { name: '程屿', attribute: '0.5' },
    ],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 3,
    tags: ['都市', '娱乐圈', '年下'],
    notes: '你是我潮汐退去后，唯一留下的光。',
    createdAt: '2026-03-02',
    updatedAt: '2026-05-20',
    cover: 'portrait',
    favorite: true,
  },
  {
    id: 4,
    title: '落不下的伞',
    author: '雾里看花',
    characters: [
      { name: '季寻', attribute: '1' },
      { name: '顾南', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 1,
    tags: ['古风', '仙侠', '师徒'],
    notes: '师父说，伞可以挡雨，却挡不住心动。',
    createdAt: '2026-04-11',
    updatedAt: '2026-06-09',
    cover: 'apple',
    favorite: true,
  },
  {
    id: 5,
    title: '第七行诗',
    author: '北风来信',
    characters: [{ name: '岑夏', attribute: '0' }],
    cpCategory: '无CP',
    ending: 'HE',
    status: '看完',
    rating: '未评价',
    readCount: 1,
    tags: ['现代', '诗人', '治愈'],
    notes: '他写下第七行诗时，世界也变得柔软了。',
    createdAt: '2026-05-16',
    updatedAt: '2026-05-16',
    cover: 'book',
    favorite: false,
  },
  {
    id: 6,
    title: '星轨沉溺',
    author: '盐渍海',
    characters: [
      { name: '路明', attribute: '其他' },
      { name: '顾斜阳', attribute: '其他' },
    ],
    cpCategory: 'NP',
    ending: '未完结',
    status: '荒废',
    rating: '不喜欢',
    readCount: 1,
    tags: ['科幻', 'ABO', '多视角'],
    notes: '设定有亮点，但中段信息太散。',
    createdAt: '2026-05-29',
    updatedAt: '2026-06-01',
    cover: 'line',
    favorite: false,
  },
  {
    id: 7,
    title: '猫咪借书证',
    author: '糖纸猫',
    characters: [
      { name: '白桃', attribute: '0' },
      { name: '陆野', attribute: '1' },
    ],
    cpCategory: '1v1',
    ending: 'OE',
    status: '荒废',
    rating: '一般',
    readCount: 1,
    tags: ['奇幻', '小猫', '图书馆'],
    notes: '一张会自己盖章的借书证，带他们找到消失的章节。',
    createdAt: '2026-06-04',
    updatedAt: '2026-06-11',
    cover: 'cat',
    favorite: false,
  },
  {
    id: 8,
    title: '云端旧信',
    author: '沉蓝',
    characters: [
      { name: '周予', attribute: '1' },
      { name: '迟洛', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: '未知',
    status: '看完',
    rating: '未评价',
    readCount: 2,
    tags: ['书信', '云朵', '慢热'],
    notes: '旧信从云端落下，带来一段还没开始的重逢。',
    createdAt: '2026-06-08',
    updatedAt: '2026-06-08',
    cover: 'cloud',
    favorite: false,
  },
  {
    id: 9,
    title: '雨夜归航',
    author: '檐下灯',
    characters: [
      { name: '陈泊舟', attribute: '1' },
      { name: '苏晚棠', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 2,
    tags: ['都市', '久别重逢', '雨夜'],
    notes: '一场误点的夜航，把多年未说出口的话送回了港口。',
    createdAt: '2026-06-12',
    updatedAt: '2026-06-12',
    cover: 'cloud',
    favorite: true,
  },
  {
    id: 10,
    title: '旧巷春声',
    author: '南枝醒',
    characters: [
      { name: '梁青', attribute: '0.5' },
      { name: '贺寻', attribute: '1' },
    ],
    cpCategory: '1v1',
    ending: 'OE',
    status: '看完',
    rating: '一般',
    readCount: 1,
    tags: ['旧巷', '春天', '邻里'],
    notes: '巷口的风铃响了三次，他们才终于学会告别。',
    createdAt: '2026-06-12',
    updatedAt: '2026-06-13',
    cover: 'flower',
    favorite: false,
  },
  {
    id: 11,
    title: '白鸟不渡',
    author: '竹影横窗',
    characters: [{ name: '闻白', attribute: '其他' }],
    cpCategory: '无CP',
    ending: 'BE',
    status: '看完',
    rating: '喜欢',
    readCount: 3,
    tags: ['悬疑', '海岛', '独行'],
    notes: '没有白鸟飞过的渡口，藏着一封无人领取的遗书。',
    createdAt: '2026-06-10',
    updatedAt: '2026-06-10',
    cover: 'line',
    favorite: true,
  },
  {
    id: 12,
    title: '南风未眠',
    author: '梨涡浅浅',
    characters: [
      { name: '夏栀', attribute: '1' },
      { name: '孟南风', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 4,
    tags: ['校园', '甜文', '夏天'],
    notes: '南风吹过操场的时候，少年人的秘密也醒了。',
    createdAt: '2026-05-31',
    updatedAt: '2026-06-02',
    cover: 'apple',
    favorite: true,
  },
  {
    id: 13,
    title: '星河暗涌',
    author: '尘外星',
    characters: [
      { name: '伊莱', attribute: '其他' },
      { name: '诺亚', attribute: '其他' },
      { name: '岚舟', attribute: '0.5' },
    ],
    cpCategory: 'NP',
    ending: 'OE',
    status: '荒废',
    rating: '一般',
    readCount: 1,
    tags: ['科幻', '星际', '群像'],
    notes: '星舰穿过暗涌区后，所有人的记忆都晚了一分钟。',
    createdAt: '2026-05-24',
    updatedAt: '2026-05-28',
    cover: 'moon',
    favorite: false,
  },
  {
    id: 14,
    title: '长夏回信',
    author: '海棠未雨',
    characters: [
      { name: '许枝', attribute: '0' },
      { name: '周聿', attribute: '1' },
    ],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 2,
    tags: ['书信', '成长', '双向奔赴'],
    notes: '寄往长夏的信，被蝉鸣和邮戳一起送到她手里。',
    createdAt: '2026-05-18',
    updatedAt: '2026-05-19',
    cover: 'book',
    favorite: true,
  },
  {
    id: 15,
    title: '纸月亮',
    author: '晚来雪',
    characters: [
      { name: '林纸', attribute: '0.5' },
      { name: '宋月', attribute: '0.5' },
    ],
    cpCategory: '1v1',
    ending: 'BE',
    status: '看完',
    rating: '一般',
    readCount: 1,
    tags: ['文艺', '剧团', '遗憾'],
    notes: '舞台上的月亮是纸做的，眼泪却是真的。',
    createdAt: '2026-05-03',
    updatedAt: '2026-05-06',
    cover: 'portrait',
    favorite: false,
  },
  {
    id: 16,
    title: '海盐汽水',
    author: '薄荷小巷',
    characters: [
      { name: '祁夏', attribute: '1' },
      { name: '唐柚', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 3,
    tags: ['青春', '海边', '轻喜剧'],
    notes: '气泡升起的一瞬间，她听见整个夏天在笑。',
    createdAt: '2026-04-27',
    updatedAt: '2026-04-30',
    cover: 'cloud',
    favorite: true,
  },
  {
    id: 17,
    title: '冬日潮汐',
    author: '灯塔鱼',
    characters: [
      { name: '沈潮', attribute: '1' },
      { name: '叶汐', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: 'OE',
    status: '荒废',
    rating: '未评价',
    readCount: 1,
    tags: ['冬天', '海港', '慢热'],
    notes: '冬天的海很冷，适合把没说完的话都冻住。',
    createdAt: '2026-04-13',
    updatedAt: '2026-04-16',
    cover: 'moon',
    favorite: false,
  },
  {
    id: 18,
    title: '雾灯小镇',
    author: '霜桥',
    characters: [{ name: '阿照', attribute: '其他' }],
    cpCategory: '无CP',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 2,
    tags: ['奇幻', '小镇', '治愈'],
    notes: '每天黄昏，雾灯亮起，迷路的人就能找到回家的门。',
    createdAt: '2026-04-02',
    updatedAt: '2026-04-05',
    cover: 'flower',
    favorite: true,
  },
  {
    id: 19,
    title: '银河便利店',
    author: '橘子航班',
    characters: [
      { name: '米芽', attribute: '0' },
      { name: '店长七号', attribute: '其他' },
    ],
    cpCategory: '无CP',
    ending: 'HE',
    status: '看完',
    rating: '一般',
    readCount: 1,
    tags: ['科幻', '便利店', '单元剧'],
    notes: '这家便利店只在凌晨三点营业，货架上摆着客人的愿望。',
    createdAt: '2026-03-29',
    updatedAt: '2026-04-01',
    cover: 'book',
    favorite: false,
  },
  {
    id: 20,
    title: '檐下雪声',
    author: '栖迟',
    characters: [
      { name: '谢微雪', attribute: '1' },
      { name: '裴照', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: 'BE',
    status: '看完',
    rating: '不喜欢',
    readCount: 1,
    tags: ['古风', '权谋', '虐恋'],
    notes: '雪落满檐的时候，他才知道那封诏书来得太迟。',
    createdAt: '2026-03-18',
    updatedAt: '2026-03-20',
    cover: 'line',
    favorite: false,
  },
  {
    id: 21,
    title: '蓝鲸电台',
    author: '凌晨三点',
    characters: [
      { name: '温眠', attribute: '0.5' },
      { name: '江屿声', attribute: '1' },
    ],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 5,
    tags: ['电台', '都市', '治愈'],
    notes: '她在深夜电台里听见一头蓝鲸，也听见自己被温柔接住。',
    createdAt: '2026-03-07',
    updatedAt: '2026-03-12',
    cover: 'portrait',
    favorite: true,
  },
  {
    id: 22,
    title: '山月邮差',
    author: '云边客',
    characters: [{ name: '洛山月', attribute: '1' }],
    cpCategory: '无CP',
    ending: 'OE',
    status: '荒废',
    rating: '未评价',
    readCount: 1,
    tags: ['公路', '邮差', '山野'],
    notes: '她替陌生人送信，也替自己寻找一条回山里的路。',
    createdAt: '2026-02-26',
    updatedAt: '2026-02-26',
    cover: 'cloud',
    favorite: false,
  },
  {
    id: 23,
    title: '迟到的烟火',
    author: '杏仁茶',
    characters: [
      { name: '陆星燃', attribute: '1' },
      { name: '唐醒', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '一般',
    readCount: 2,
    tags: ['都市', '烟火', '破镜重圆'],
    notes: '那场迟到七年的烟火，终于在他们重逢的夜晚升空。',
    createdAt: '2026-02-14',
    updatedAt: '2026-02-17',
    cover: 'apple',
    favorite: false,
  },
  {
    id: 24,
    title: '黑糖月台',
    author: '小满未满',
    characters: [
      { name: '严渡', attribute: '1' },
      { name: '陈糖', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 3,
    tags: ['车站', '美食', '日常'],
    notes: '月台旁的小摊热气腾腾，黑糖味把寒夜熬成了甜的。',
    createdAt: '2026-02-03',
    updatedAt: '2026-02-08',
    cover: 'flower',
    favorite: true,
  },
  {
    id: 25,
    title: '逆光行星',
    author: '白昼边界',
    characters: [
      { name: '阿衡', attribute: '其他' },
      { name: '司昼', attribute: '其他' },
      { name: '林洛', attribute: '0.5' },
    ],
    cpCategory: 'NP',
    ending: 'BE',
    status: '荒废',
    rating: '不喜欢',
    readCount: 1,
    tags: ['星际', '冒险', '失忆'],
    notes: '逆光行星没有白天，所有誓言都在黑暗里变形。',
    createdAt: '2026-01-30',
    updatedAt: '2026-02-01',
    cover: 'line',
    favorite: false,
  },
  {
    id: 26,
    title: '槐花落满街',
    author: '木槿灯',
    characters: [
      { name: '姜槐', attribute: '0' },
      { name: '许言', attribute: '1' },
    ],
    cpCategory: '1v1',
    ending: 'OE',
    status: '看完',
    rating: '一般',
    readCount: 1,
    tags: ['年代', '旧城', '初恋'],
    notes: '槐花落满街的时候，她终于明白有些人只适合留在夏天。',
    createdAt: '2026-01-22',
    updatedAt: '2026-01-25',
    cover: 'flower',
    favorite: false,
  },
  {
    id: 27,
    title: '无人区玫瑰',
    author: '沙丘信使',
    characters: [
      { name: '迟野', attribute: '1' },
      { name: '洛蔷', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 2,
    tags: ['公路', '冒险', '强强'],
    notes: '无人区没有路标，只有一朵玫瑰替他们指向黎明。',
    createdAt: '2025-12-28',
    updatedAt: '2026-01-03',
    cover: 'apple',
    favorite: true,
  },
  {
    id: 28,
    title: '薄雾咖啡馆',
    author: '半杯拿铁',
    characters: [
      { name: '乔雾', attribute: '0.5' },
      { name: '程一白', attribute: '1' },
    ],
    cpCategory: '1v1',
    ending: 'HE',
    status: '看完',
    rating: '未评价',
    readCount: 1,
    tags: ['咖啡馆', '日常', '慢热'],
    notes: '每天清晨，咖啡馆的薄雾都会替客人藏起一点心事。',
    createdAt: '2025-12-15',
    updatedAt: '2025-12-18',
    cover: 'portrait',
    favorite: false,
  },
  {
    id: 29,
    title: '落日贩卖机',
    author: '夏末汽笛',
    characters: [{ name: '小满', attribute: '其他' }],
    cpCategory: '无CP',
    ending: 'HE',
    status: '看完',
    rating: '喜欢',
    readCount: 2,
    tags: ['奇幻', '治愈', '城市传说'],
    notes: '投进一枚硬币，就能买到一瓶装着昨天落日的汽水。',
    createdAt: '2025-11-21',
    updatedAt: '2025-11-23',
    cover: 'cloud',
    favorite: true,
  },
  {
    id: 30,
    title: '风停在第九页',
    author: '纸上远山',
    characters: [
      { name: '谢九', attribute: '1' },
      { name: '林页', attribute: '0' },
    ],
    cpCategory: '1v1',
    ending: 'OE',
    status: '荒废',
    rating: '一般',
    readCount: 1,
    tags: ['悬疑', '书店', '多视角'],
    notes: '那本书永远翻不到第十页，风也永远停在谜底之前。',
    createdAt: '2025-10-09',
    updatedAt: '2025-10-11',
    cover: 'book',
    favorite: false,
  },
]

const emptyFilters: FilterState = {
  status: '全部',
  rating: '全部',
  characterAttribute: '全部',
  cpCategory: '全部',
  ending: '全部',
  tag: '全部',
}

function getNavGroups(novels: Novel[]): { title: string; items: NavItem[] }[] {
  return [
    {
      title: '书库',
      items: [
        { id: 'home', label: '首页', icon: Home, count: novels.length },
        { id: 'all', label: '全部小说', icon: LibraryBig, count: novels.length },
        { id: 'recent', label: '最近添加', icon: Clock3, count: 6 },
        { id: 'authors', label: '作者归档', icon: UserRound, count: new Set(novels.map((novel) => novel.author)).size },
        { id: 'finished', label: '看完', icon: BookOpen, count: novels.filter(isFinishedNovel).length },
        { id: 'liked', label: '喜欢', icon: Star, count: novels.filter(isLikedNovel).length },
        { id: 'abandoned', label: '荒废', icon: Trash2, count: novels.filter(isAbandonedNovel).length },
        { id: 'stats', label: '统计', icon: BarChart3, count: 7 },
        { id: 'backup', label: '备份', icon: Archive, count: 2 },
      ],
    },
  ]
}

function isFinishedNovel(novel: Novel) {
  return novel.status === '看完' && novel.rating !== '喜欢'
}

function isLikedNovel(novel: Novel) {
  return novel.rating === '喜欢'
}

function isAbandonedNovel(novel: Novel) {
  return novel.status === '荒废'
}

function normalizeComparableText(value: string, { stripBookMarks = false } = {}) {
  const halfWidthText = Array.from(value.trim(), (character) => {
    const codePoint = character.charCodeAt(0)
    if (codePoint === 0x3000) return ' '
    if (codePoint >= 0xff01 && codePoint <= 0xff5e) return String.fromCharCode(codePoint - 0xfee0)
    return character
  }).join('')

  const text = stripBookMarks ? halfWidthText.replace(/[《》]/g, '') : halfWidthText

  return text.replace(/[\s\u00a0]+/g, '').toLowerCase()
}

function findDuplicateNovel(novels: Novel[], payload: NovelPayload, currentNovelId?: number) {
  const targetTitle = normalizeComparableText(payload.title, { stripBookMarks: true })
  const targetAuthor = normalizeComparableText(payload.author)

  if (!targetTitle || !targetAuthor) return undefined

  return novels.find((novel) => {
    if (novel.id === currentNovelId) return false

    return (
      normalizeComparableText(novel.title, { stripBookMarks: true }) === targetTitle &&
      normalizeComparableText(novel.author) === targetAuthor
    )
  })
}

function pickStableCover(title: string, author: string): CoverStyle {
  const source = `${title}\u0000${author}`
  let hash = 2166136261

  for (const character of source) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }

  return availableCovers[Math.abs(hash) % availableCovers.length] ?? 'book'
}

function App() {
  const [novels, setNovels] = useState<Novel[]>(mockNovels)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cloudSignedIn, setCloudSignedIn] = useState(!cloudMode)
  const [cloudEmail, setCloudEmail] = useState('')
  const [cloudPassword, setCloudPassword] = useState('')
  const [cloudAuthLoading, setCloudAuthLoading] = useState(cloudMode)
  const [cloudAuthError, setCloudAuthError] = useState<string | null>(null)
  const [activeView, setActiveView] = useState<View>('home')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<FilterState>(emptyFilters)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selectedNovel, setSelectedNovel] = useState<Novel | null>(null)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [wallPage, setWallPage] = useState(0)
  const [editingNovel, setEditingNovel] = useState<Novel | null>(mockNovels[0])
  const [aboutOpen, setAboutOpen] = useState(false)
  const [lastRandomNovelId, setLastRandomNovelId] = useState<number | null>(null)
  const [selectedAuthor, setSelectedAuthor] = useState<{ author: string; works: Novel[] } | null>(null)

  const reloadNovels = async () => {
    const apiNovels = await fetchNovels<Novel>()
    setNovels(apiNovels)
    setError(null)
    return apiNovels
  }

  useEffect(() => {
    let ignore = false

    if (cloudMode) {
      getSupabaseSession()
        .then(async (session) => {
          if (ignore) return null

          const signedIn = Boolean(session)
          setCloudSignedIn(signedIn)
          setCloudAuthError(null)

          if (!signedIn) {
            setNovels([])
            setError(null)
            return null
          }

          return fetchNovels<Novel>()
        })
        .then((apiNovels) => {
          if (ignore || !apiNovels) return
          setNovels(apiNovels)
          setError(null)
        })
        .catch((fetchError: unknown) => {
          if (ignore) return
          setNovels([])
          setError(fetchError instanceof Error ? fetchError.message : '无法读取 Supabase 小说数据')
        })
        .finally(() => {
          if (!ignore) {
            setCloudAuthLoading(false)
            setLoading(false)
          }
        })

      return () => {
        ignore = true
      }
    }

    fetchNovels<Novel>()
      .then((apiNovels) => {
        if (ignore) return
        setNovels(apiNovels)
        setError(null)
      })
      .catch((fetchError: unknown) => {
        if (ignore) return
        setNovels(mockNovels)
        setError(fetchError instanceof Error ? fetchError.message : '无法读取后端小说数据')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (!selectedNovel) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedNovel(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNovel])

  useEffect(() => {
    if (!aboutOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAboutOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [aboutOpen])

  const stats = {
    total: novels.length,
    finished: novels.filter(isFinishedNovel).length,
    liked: novels.filter(isLikedNovel).length,
    authors: new Set(novels.map((novel) => novel.author)).size,
    abandoned: novels.filter(isAbandonedNovel).length,
  }

  const allTags = Array.from(new Set(novels.flatMap((novel) => novel.tags)))

  const filteredNovels = useMemo(() => {
    const keyword = query.trim().toLowerCase()

    return novels.filter((novel) => {
      const searchableText = [
        novel.title,
        novel.author,
        novel.cpCategory,
        novel.ending,
        novel.status,
        novel.rating,
        ...novel.tags,
        ...novel.characters.map((character) => character.name),
        ...novel.characters.map((character) => character.attribute),
      ]
        .join(' ')
        .toLowerCase()

      const matchesKeyword = keyword.length === 0 || searchableText.includes(keyword)
      const matchesStatus = filters.status === '全部' || novel.status === filters.status
      const matchesRating = filters.rating === '全部' || novel.rating === filters.rating
      const matchesAttribute =
        filters.characterAttribute === '全部' ||
        novel.characters.some((character) => character.attribute === filters.characterAttribute)
      const matchesCp = filters.cpCategory === '全部' || novel.cpCategory === filters.cpCategory
      const matchesEnding = filters.ending === '全部' || novel.ending === filters.ending
      const matchesTag = filters.tag === '全部' || novel.tags.includes(filters.tag)

      return matchesKeyword && matchesStatus && matchesRating && matchesAttribute && matchesCp && matchesEnding && matchesTag
    })
  }, [filters, novels, query])

  const visibleNovels = useMemo(() => {
    const viewFilters: Partial<Record<View, (novel: Novel) => boolean>> = {
      finished: isFinishedNovel,
      liked: isLikedNovel,
      abandoned: isAbandonedNovel,
      'cp-1v1': (novel) => novel.cpCategory === '1v1',
      'cp-none': (novel) => novel.cpCategory === '无CP',
      'cp-np': (novel) => novel.cpCategory === 'NP',
    }

    return filteredNovels.filter(viewFilters[activeView] ?? (() => true))
  }, [activeView, filteredNovels])

  const featuredNovels = useMemo(() => {
    const byRecent = [...filteredNovels].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const featured = [...filteredNovels.filter((novel) => novel.rating === '喜欢'), ...byRecent]
    const seen = new Set<number>()

    return featured.filter((novel) => {
      if (seen.has(novel.id)) return false
      seen.add(novel.id)
      return true
    }).slice(0, 10)
  }, [filteredNovels])

  const authors = Array.from(new Set(novels.map((novel) => novel.author))).map((author) => {
    const works = novels.filter((novel) => novel.author === author)
    return {
      author,
      works,
      liked: works.filter(isLikedNovel).length,
      finished: works.filter(isFinishedNovel).length,
    }
  }).sort((firstAuthor, secondAuthor) => (
    secondAuthor.works.length - firstAuthor.works.length ||
    firstAuthor.author.localeCompare(secondAuthor.author, 'zh-Hans-CN')
  ))

  const openEdit = (novel: Novel) => {
    setEditingNovel(novel)
    setSelectedNovel(null)
    setActiveView('edit')
  }

  const changeActiveView = (view: View) => {
    if (view === 'authors') {
      setSelectedAuthor(null)
    }
    setActiveView(view)
  }

  const handleCreateNovel = async (payload: NovelPayload) => {
    const createdNovel = await createNovel<Novel>(payload)
    const apiNovels = await fetchNovels<Novel>()

    setNovels(apiNovels)
    setError(null)
    setSelectedNovel(apiNovels.find((novel) => novel.id === createdNovel.id) ?? createdNovel)
    setActiveView('all')
  }

  const handleUpdateNovel = async (id: number, payload: NovelPayload) => {
    const updatedNovel = await updateNovel<Novel>(id, payload)
    const apiNovels = await fetchNovels<Novel>()

    setNovels(apiNovels)
    setError(null)
    setSelectedNovel(apiNovels.find((novel) => novel.id === updatedNovel.id) ?? updatedNovel)
    setActiveView('all')
  }

  const handleDeleteNovel = async (id: number) => {
    if (cloudMode) {
      throw new Error('云端模式暂未开放写入')
    }

    await deleteNovel(id)
    const apiNovels = await fetchNovels<Novel>()

    setNovels(apiNovels)
    setError(null)
    setSelectedNovel(null)
  }

  const handleBulkDeleteNovels = async (ids: number[]) => {
    if (cloudMode) {
      throw new Error('云端模式暂未开放写入')
    }

    const deleteResults = await Promise.all(
      ids.map(async (id) => {
        try {
          await deleteNovel(id, { ignoreNotFound: true })
          return null
        } catch (deleteError) {
          return deleteError
        }
      }),
    )
    const deleteErrors = deleteResults.filter((deleteError) => deleteError !== null)
    const apiNovels = await fetchNovels<Novel>()

    setNovels(apiNovels)
    setError(null)
    setSelectedNovel(null)

    if (deleteErrors.length > 0) {
      throw new Error(`批量删除完成，${deleteErrors.length} 本删除失败，请确认后端服务状态`)
    }
  }

  const openRandomNovel = () => {
    if (novels.length === 0) return

    const candidates =
      novels.length > 1 && lastRandomNovelId !== null ? novels.filter((novel) => novel.id !== lastRandomNovelId) : novels
    const randomNovel = candidates[Math.floor(Math.random() * candidates.length)]

    setLastRandomNovelId(randomNovel.id)
    setSelectedNovel(randomNovel)
  }

  const handleCloudLogin = async () => {
    setCloudAuthLoading(true)
    setCloudAuthError(null)

    try {
      await signInToSupabase(cloudEmail, cloudPassword)
      setCloudSignedIn(true)
      setLoading(true)
      await reloadNovels()
      setActiveView('home')
      setCloudPassword('')
    } catch (loginError) {
      setCloudAuthError(loginError instanceof Error ? loginError.message : 'Supabase 登录失败')
      setCloudSignedIn(false)
      setNovels([])
    } finally {
      setCloudAuthLoading(false)
      setLoading(false)
    }
  }

  const handleCloudLogout = async () => {
    setCloudAuthLoading(true)
    setCloudAuthError(null)

    try {
      await signOutFromSupabase()
      setCloudSignedIn(false)
      setNovels([])
      setSelectedNovel(null)
      setActiveView('home')
    } catch (logoutError) {
      setCloudAuthError(logoutError instanceof Error ? logoutError.message : 'Supabase 退出登录失败')
    } finally {
      setCloudAuthLoading(false)
    }
  }

  if (cloudMode && !cloudAuthLoading && !cloudSignedIn) {
    return (
      <CloudLoginView
        email={cloudEmail}
        error={cloudAuthError}
        onEmailChange={setCloudEmail}
        onPasswordChange={setCloudPassword}
        onSubmit={handleCloudLogin}
        password={cloudPassword}
        submitting={cloudAuthLoading}
      />
    )
  }

  return (
    <main className="novel-app">
      <DecorativeLines />

      <header className="topbar">
        <button className="brand-button" onClick={() => setActiveView('home')} type="button">
          <span className="bag-mark" aria-hidden="true">
            <i />
          </span>
          <span>
            <strong>小说袋</strong>
            <em>私人小说书库</em>
          </span>
        </button>
        <p className="top-note">今天也记录一点喜欢的故事吧</p>
      </header>

      <div className="layout-grid">
        <Sidebar activeView={activeView} novels={novels} setActiveView={changeActiveView} />

        <section className="workspace">
          <Toolbar
            cloudLogoutEnabled={cloudMode && cloudSignedIn}
            cloudLogoutLoading={cloudAuthLoading}
            filterOpen={filterOpen}
            onCloudLogout={handleCloudLogout}
            onOpenAbout={() => setAboutOpen(true)}
            query={query}
            setActiveView={setActiveView}
            setFilterOpen={setFilterOpen}
            setQuery={setQuery}
            stats={stats}
          />

          {(loading || error) && (
            <div className="section-head" role="status">
              <div>
                <Clock3 size={18} />
                <h2>{loading ? '正在读取小说数据' : '后端数据读取失败，正在显示本地临时数据'}</h2>
              </div>
            </div>
          )}

          {filterOpen && (
            <FilterPanel
              filters={filters}
              onClose={() => setFilterOpen(false)}
              setFilters={setFilters}
              tags={allTags}
            />
          )}

          <div className="view-frame" key={activeView}>
            {activeView === 'home' && (
              <HomeView
                carouselIndex={carouselIndex}
                commonTags={topTags(novels, 10)}
                featuredNovels={featuredNovels}
                novels={filteredNovels}
                onOpenRandomNovel={openRandomNovel}
                setActiveView={setActiveView}
                setCarouselIndex={setCarouselIndex}
                setFilters={setFilters}
                setSelectedNovel={setSelectedNovel}
                setWallPage={setWallPage}
                wallPage={wallPage}
              />
            )}

            {activeView === 'recent' && <RecentTimelineView novels={visibleNovels} setSelectedNovel={setSelectedNovel} />}

            {isLibraryView(activeView) && (
              <LibraryView
                bulkDeleteEnabled={activeView === 'all'}
                carouselIndex={carouselIndex}
                novels={visibleNovels}
                onBulkDeleteNovels={handleBulkDeleteNovels}
                setCarouselIndex={setCarouselIndex}
                setSelectedNovel={setSelectedNovel}
                setWallPage={setWallPage}
                title={viewTitle(activeView)}
                wallPage={wallPage}
              />
            )}

            {activeView === 'authors' && (
              <AuthorsView
                authors={authors}
                selectedAuthor={selectedAuthor}
                setSelectedAuthor={setSelectedAuthor}
                setSelectedNovel={setSelectedNovel}
                setWallPage={setWallPage}
                wallPage={wallPage}
              />
            )}
            {activeView === 'stats' && <StatsView authors={authors} novels={novels} stats={stats} />}
            {activeView === 'backup' && <BackupView novels={novels} onReloadNovels={reloadNovels} />}
            {activeView === 'new' && (
              <NovelFormView
                allTags={allTags}
                fallbackNovel={novels[0] ?? mockNovels[0]}
                mode="new"
                novels={novels}
                onCreateNovel={handleCreateNovel}
                setActiveView={setActiveView}
              />
            )}
            {activeView === 'edit' && (
              <NovelFormView
                allTags={allTags}
                fallbackNovel={novels[0] ?? mockNovels[0]}
                mode="edit"
                novel={editingNovel ?? novels[0] ?? mockNovels[0]}
                novels={novels}
                setActiveView={setActiveView}
                onUpdateNovel={handleUpdateNovel}
              />
            )}
          </div>
        </section>
      </div>

      <footer className="mobile-tabs" aria-label="移动端导航">
        {[
          { id: 'home' as View, label: '首页', icon: Home },
          { id: 'all' as View, label: '小说', icon: LibraryBig },
          { id: 'authors' as View, label: '作者', icon: UserRound },
          { id: 'new' as View, label: '新增', icon: Plus },
        ].map((item) => {
          const Icon = item.icon
          return (
            <button
              className={activeView === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => setActiveView(item.id)}
              type="button"
            >
              <Icon size={18} />
              {item.label}
            </button>
          )
        })}
      </footer>

      {selectedNovel && (
        <DetailModal
          novel={selectedNovel}
          onClose={() => setSelectedNovel(null)}
          onDelete={handleDeleteNovel}
          onEdit={openEdit}
        />
      )}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </main>
  )
}

function CloudLoginView({
  email,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  password,
  submitting,
}: {
  email: string
  error: string | null
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: () => Promise<void>
  password: string
  submitting: boolean
}) {
  return (
    <main className="novel-app">
      <DecorativeLines />
      <section className="cloud-login-panel">
        <div className="section-head">
          <div>
            <UserRound size={18} />
            <h2>Supabase Login</h2>
          </div>
        </div>
        <form
          className="cloud-login-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit()
          }}
        >
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(event) => onEmailChange(event.target.value)}
              type="email"
              value={email}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => onPasswordChange(event.target.value)}
              type="password"
              value={password}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="form-actions">
            <button className="save-action" disabled={submitting} type="submit">
              {submitting ? 'Signing in' : 'Sign in'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}

function Sidebar({
  activeView,
  novels,
  setActiveView,
}: {
  activeView: View
  novels: Novel[]
  setActiveView: (view: View) => void
}) {
  return (
    <aside className="sidebar">
      {getNavGroups(novels).map((group) => (
        <section className="nav-group" key={group.title}>
          <h2>{group.title}</h2>
          {group.items.map((item) => {
            const Icon = item.icon
            return (
              <button
                className={activeView === item.id ? 'active' : ''}
                key={item.id}
                onClick={() => setActiveView(item.id)}
                type="button"
              >
                <Icon size={16} />
                <span>{item.label}</span>
                <em>{item.count}</em>
              </button>
            )
          })}
        </section>
      ))}

      <div className="sidebar-illustration" aria-hidden="true">
        <div className="tiny-cat">
          <span />
          <span />
        </div>
        <div className="tiny-book" />
        <p>书袋里，都是好故事。</p>
      </div>
    </aside>
  )
}

function Toolbar({
  cloudLogoutEnabled,
  cloudLogoutLoading,
  filterOpen,
  onCloudLogout,
  onOpenAbout,
  query,
  setActiveView,
  setFilterOpen,
  setQuery,
  stats,
}: {
  cloudLogoutEnabled: boolean
  cloudLogoutLoading: boolean
  filterOpen: boolean
  onCloudLogout: () => Promise<void>
  onOpenAbout: () => void
  query: string
  setActiveView: (view: View) => void
  setFilterOpen: (open: boolean) => void
  setQuery: (query: string) => void
  stats: { total: number; finished: number; liked: number; authors: number; abandoned: number }
}) {
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <section className="toolbar">
      <label className="search-box">
        <Search size={19} />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索书名、作者、主角、标签……"
          value={query}
        />
      </label>
      <button
        className={filterOpen ? 'filter-trigger active' : 'filter-trigger'}
        onClick={() => setFilterOpen(!filterOpen)}
        type="button"
      >
        <Filter size={17} />
        筛选
      </button>
      <div className="compact-stats">
        <StatBlock label="小说总数" value={stats.total} />
        <StatBlock label="看完" value={stats.finished} />
        <StatBlock label="喜欢" value={stats.liked} />
        <StatBlock label="荒废" value={stats.abandoned} />
      </div>
      <button className="new-button" onClick={() => setActiveView('new')} type="button">
        <Plus size={18} />
        新增小说
      </button>
      <div className={profileOpen ? 'profile-menu-wrap toolbar-profile open' : 'profile-menu-wrap toolbar-profile'}>
        <button
          aria-expanded={profileOpen}
          className="profile-card"
          onClick={() => setProfileOpen(!profileOpen)}
          type="button"
        >
          <span className="profile-avatar" aria-hidden="true">
            <i className="avatar-ear left" />
            <i className="avatar-ear right" />
            <i className="avatar-face" />
          </span>
          <span className="profile-copy">
            <strong>桶</strong>
            <em>私人书库</em>
          </span>
          <ChevronDown className="profile-arrow" size={16} />
        </button>
        {profileOpen && (
          <div className="profile-menu">
            <button
              onClick={() => {
                setActiveView('all')
                setProfileOpen(false)
              }}
              type="button"
            >
              我的书库
            </button>
            <button
              onClick={() => {
                setActiveView('backup')
                setProfileOpen(false)
              }}
              type="button"
            >
              数据备份
            </button>
            <button
              onClick={() => {
                setProfileOpen(false)
                onOpenAbout()
              }}
              type="button"
            >
              关于
            </button>
            {cloudLogoutEnabled && (
              <button
                disabled={cloudLogoutLoading}
                onClick={() => {
                  setProfileOpen(false)
                  void onCloudLogout()
                }}
                type="button"
              >
                退出登录
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="about-backdrop" onClick={onClose}>
      <article className="about-modal" onClick={(event) => event.stopPropagation()}>
        <div className="about-titlebar">
          <span>关于小说袋</span>
          <button onClick={onClose} type="button" aria-label="关闭关于弹窗">
            <X size={18} />
          </button>
        </div>
        <div className="about-content">
          <div className="about-mark" aria-hidden="true">
            <Cat size={36} />
            <BookOpen size={24} />
          </div>
          <dl>
            <div>
              <dt>项目名称</dt>
              <dd>小说袋</dd>
            </div>
            <div>
              <dt>用途</dt>
              <dd>私人小说记录与管理</dd>
            </div>
            <div>
              <dt>当前版本</dt>
              <dd>静态前端原型</dd>
            </div>
            <div>
              <dt>当前数据</dt>
              <dd>模拟数据</dd>
            </div>
            <div className="about-plan">
              <dt>后续计划</dt>
              <dd>接入 SQLite、本地数据保存、搜索查重和真实备份</dd>
            </div>
          </dl>
          <button className="about-close" onClick={onClose} type="button">
            关闭
          </button>
        </div>
      </article>
    </div>
  )
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <article className="stat-block">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function FilterPanel({
  filters,
  onClose,
  setFilters,
  tags,
}: {
  filters: FilterState
  onClose: () => void
  setFilters: (filters: FilterState) => void
  tags: string[]
}) {
  const setFilter = (key: keyof FilterState, value: string) => {
    setFilters({ ...filters, [key]: value } as FilterState)
  }

  return (
    <aside className="filter-panel">
      <div className="filter-head">
        <strong>筛选小说</strong>
        <button onClick={onClose} type="button" aria-label="关闭筛选">
          <X size={18} />
        </button>
      </div>
      <FilterGroup active={filters.status} label="阅读状态" onPick={(value) => setFilter('status', value)} options={['全部', '看完', '荒废']} />
      <FilterGroup active={filters.rating} label="个人评价" onPick={(value) => setFilter('rating', value)} options={['全部', '喜欢', '一般', '不喜欢', '未评价']} />
      <FilterGroup active={filters.characterAttribute} label="主角属性" onPick={(value) => setFilter('characterAttribute', value)} options={['全部', '1', '0', '0.5', '其他']} />
      <FilterGroup active={filters.cpCategory} label="CP类别" onPick={(value) => setFilter('cpCategory', value)} options={['全部', '1v1', '无CP', 'NP']} />
      <FilterGroup active={filters.ending} label="结局" onPick={(value) => setFilter('ending', value)} options={['全部', 'HE', 'BE', 'OE', '坑', '其他']} />
      <FilterGroup active={filters.tag} label="标签" onPick={(value) => setFilter('tag', value)} options={['全部', ...tags.slice(0, 12)]} />
      <button className="reset-filter" onClick={() => setFilters(emptyFilters)} type="button">
        重置筛选
      </button>
    </aside>
  )
}

function FilterGroup({
  active,
  label,
  onPick,
  options,
}: {
  active: string
  label: string
  onPick: (value: string) => void
  options: string[]
}) {
  return (
    <section className="filter-group">
      <h3>{label}</h3>
      <div>
        {options.map((option) => (
          <button className={active === option ? 'active' : ''} key={option} onClick={() => onPick(option)} type="button">
            {option}
          </button>
        ))}
      </div>
    </section>
  )
}

function HomeView({
  carouselIndex,
  commonTags,
  featuredNovels,
  novels,
  onOpenRandomNovel,
  setActiveView,
  setCarouselIndex,
  setFilters,
  setSelectedNovel,
  setWallPage,
  wallPage,
}: {
  carouselIndex: number
  commonTags: { tag: string; count: number }[]
  featuredNovels: Novel[]
  novels: Novel[]
  onOpenRandomNovel: () => void
  setActiveView: (view: View) => void
  setCarouselIndex: (index: number) => void
  setFilters: (filters: FilterState) => void
  setSelectedNovel: (novel: Novel) => void
  setWallPage: (page: number) => void
  wallPage: number
}) {
  return (
    <>
      <section className="welcome-strip">
        <div>
          <span>欢迎回来</span>
          <h2>把喜欢的故事，放进小说袋。</h2>
          <p>快速浏览、筛选、归档，也给每一本书留下一点当时的心情。</p>
        </div>
        <div className="welcome-actions">
          <button onClick={() => setActiveView('all')} type="button">
            开始浏览
          </button>
          <button onClick={onOpenRandomNovel} type="button">
            随机一本
          </button>
        </div>
        <div className="welcome-doodle" aria-hidden="true">
          <span className="doodle-apple" />
          <span className="doodle-book" />
          <span className="doodle-star one" />
          <span className="doodle-star two" />
          <Cat size={34} />
        </div>
      </section>

      <CommonTags commonTags={commonTags} setFilters={setFilters} />

      <SpotlightCarousel
        index={carouselIndex}
        novels={featuredNovels}
        setIndex={setCarouselIndex}
        setSelectedNovel={setSelectedNovel}
      />

      <NovelWall
        novels={novels}
        page={wallPage}
        setPage={setWallPage}
        setSelectedNovel={setSelectedNovel}
        title="全部小说作品墙"
      />
    </>
  )
}

function CommonTags({
  commonTags,
  setFilters,
}: {
  commonTags: { tag: string; count: number }[]
  setFilters: (filters: FilterState) => void
}) {
  return (
    <section className="common-tags">
      <div className="section-head">
        <div>
          <Tags size={18} />
          <h2>常用标签</h2>
        </div>
      </div>
      <div className="tag-cloud">
        {commonTags.map((item, index) => (
          <button
            key={item.tag}
            onClick={() => setFilters({ ...emptyFilters, tag: item.tag })}
            style={{ '--tag-size': `${13 + (index % 4) * 2}px` } as CSSProperties}
            type="button"
          >
            #{item.tag} {item.count}
          </button>
        ))}
      </div>
    </section>
  )
}

function RecentTimelineView({
  novels,
  setSelectedNovel,
}: {
  novels: Novel[]
  setSelectedNovel: (novel: Novel) => void
}) {
  const recentNovels = [...novels].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10)
  const groups = recentNovels.reduce<{ date: string; novels: { novel: Novel; timelineIndex: number }[] }[]>(
    (items, novel, timelineIndex) => {
      const group = items.find((item) => item.date === novel.createdAt)

      if (group) {
        group.novels.push({ novel, timelineIndex })
      } else {
        items.push({ date: novel.createdAt, novels: [{ novel, timelineIndex }] })
      }

      return items
    },
    [],
  )

  if (groups.length === 0) {
    return <EmptyState title="最近添加暂时为空" />
  }

  return (
    <section className="recent-timeline">
      <div className="section-head">
        <div>
          <Clock3 size={18} />
          <h2>最近添加</h2>
        </div>
        <span>最近10本记录</span>
      </div>

      <div className="timeline-line" aria-hidden="true" />
      <div className="timeline-groups">
        {groups.map((group) => (
          <section className="timeline-group" key={group.date}>
            <h3 className="timeline-date">{group.date}</h3>
            {group.novels.map(({ novel, timelineIndex }) => (
              <article
                className={timelineIndex % 2 === 0 ? 'timeline-item right' : 'timeline-item left'}
                key={novel.id}
              >
                <span className="timeline-node" aria-hidden="true" />
                <div
                  className="timeline-card"
                  onClick={() => setSelectedNovel(novel)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedNovel(novel)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <h3>{novel.title}</h3>
                  <p>{novel.author}</p>
                  <div className="timeline-meta">
                    <span>{novel.cpCategory}</span>
                    <span>{novel.status}</span>
                    <span>{novel.rating}</span>
                  </div>
                  <p className="timeline-characters">
                    {novel.characters.map((character) => `${character.name} ${character.attribute}`).join(' / ')}
                  </p>
                  <div className="tag-row">
                    {novel.tags.slice(0, 3).map((tag) => (
                      <em key={tag}>{tag}</em>
                    ))}
                  </div>
                  <button
                    className="timeline-open"
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedNovel(novel)
                    }}
                    type="button"
                  >
                    查看详情
                  </button>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </section>
  )
}

function LibraryView({
  bulkDeleteEnabled = false,
  carouselIndex,
  novels,
  onBulkDeleteNovels,
  setCarouselIndex,
  setSelectedNovel,
  setWallPage,
  title,
  wallPage,
}: {
  bulkDeleteEnabled?: boolean
  carouselIndex: number
  novels: Novel[]
  onBulkDeleteNovels?: (ids: number[]) => Promise<void>
  setCarouselIndex: (index: number) => void
  setSelectedNovel: (novel: Novel) => void
  setWallPage: (page: number) => void
  title: string
  wallPage: number
}) {
  const carouselNovels = novels.slice(0, 10)

  return (
    <>
      <SpotlightCarousel
        index={Math.min(carouselIndex, Math.max(0, carouselNovels.length - 1))}
        novels={carouselNovels}
        setIndex={setCarouselIndex}
        setSelectedNovel={setSelectedNovel}
        title={title}
      />
      <NovelWall
        bulkDeleteEnabled={bulkDeleteEnabled}
        novels={novels}
        onBulkDeleteNovels={onBulkDeleteNovels}
        page={wallPage}
        setPage={setWallPage}
        setSelectedNovel={setSelectedNovel}
        title={`${title}作品墙`}
      />
    </>
  )
}

function SpotlightCarousel({
  index,
  novels,
  setIndex,
  setSelectedNovel,
  title = '重点小说',
}: {
  index: number
  novels: Novel[]
  setIndex: (index: number) => void
  setSelectedNovel: (novel: Novel) => void
  title?: string
}) {
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null)
  const currentIndex = Math.min(index, Math.max(0, novels.length - 1))

  const go = (direction: -1 | 1) => {
    if (novels.length === 0) return
    setIndex((currentIndex + direction + novels.length) % novels.length)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (novels.length === 0 || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (document.querySelector('.modal-backdrop, .about-backdrop')) return

      const target = event.target
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase()
        if (['input', 'textarea', 'select'].includes(tagName) || target.isContentEditable) return
      }

      event.preventDefault()
      setIndex((currentIndex + (event.key === 'ArrowLeft' ? -1 : 1) + novels.length) % novels.length)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, novels.length, setIndex])

  if (novels.length === 0) {
    return <EmptyState title="没有找到符合条件的小说" />
  }

  const current = novels[currentIndex]
  const prev = novels[(currentIndex - 1 + novels.length) % novels.length]
  const next = novels[(currentIndex + 1) % novels.length]

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (!touchStart) return

    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - touchStart.x
    const deltaY = touch.clientY - touchStart.y

    setTouchStart(null)

    if (Math.abs(deltaX) < 56 || Math.abs(deltaY) > Math.abs(deltaX) * 0.75) return
    go(deltaX < 0 ? 1 : -1)
  }

  return (
    <section className="spotlight-section">
      <div className="section-head">
        <div>
          <Sparkles size={18} />
          <h2>{title}</h2>
        </div>
        <span>{currentIndex + 1} / {novels.length}</span>
      </div>
      <div
        className="carousel"
        onTouchEnd={handleTouchEnd}
        onTouchStart={(event) => {
          const touch = event.touches[0]
          setTouchStart({ x: touch.clientX, y: touch.clientY })
        }}
      >
        <button className="arrow left" onClick={() => go(-1)} type="button" aria-label="上一部小说">
          <ChevronLeft size={24} />
        </button>
        <SpotlightCard
          className="side prev"
          key={`prev-${prev.id}-${currentIndex}`}
          novel={prev}
          onCardClick={() => go(-1)}
          onOpen={() => setSelectedNovel(prev)}
        />
        <SpotlightCard
          className="active"
          key={`active-${current.id}-${currentIndex}`}
          novel={current}
          onCardClick={() => setSelectedNovel(current)}
          onOpen={() => setSelectedNovel(current)}
        />
        <SpotlightCard
          className="side next"
          key={`next-${next.id}-${currentIndex}`}
          novel={next}
          onCardClick={() => go(1)}
          onOpen={() => setSelectedNovel(next)}
        />
        <button className="arrow right" onClick={() => go(1)} type="button" aria-label="下一部小说">
          <ChevronRight size={24} />
        </button>
      </div>
      <div className="dots">
        {novels.map((novel, dotIndex) => (
          <button
            className={currentIndex === dotIndex ? 'active' : ''}
            key={novel.id}
            onClick={() => setIndex(dotIndex)}
            type="button"
            aria-label={`切换到第 ${dotIndex + 1} 本：${novel.title}`}
            title={novel.title}
          />
        ))}
      </div>
    </section>
  )
}

function SpotlightCard({
  className,
  novel,
  onCardClick,
  onOpen,
}: {
  className: string
  novel: Novel
  onCardClick: () => void
  onOpen: () => void
}) {
  const infoItems = [
    { label: '主角', value: novel.characters.map((character) => character.name).join('、') },
    { label: '主角属性', value: novel.characters.map((character) => character.attribute).join(' / ') },
    { label: 'CP类别', value: novel.cpCategory },
    { label: '结局', value: novel.ending },
    { label: '评价', value: novel.rating },
  ]

  return (
    <article className={`spotlight-card ${className}`} onClick={onCardClick}>
      <CoverArt cover={novel.cover} size="feature" />
      <div className="spotlight-info">
        <span className="status-pill">{novel.status}</span>
        <h3>{novel.title}</h3>
        <p>作者：{novel.author}</p>
        <dl className="spotlight-meta">
          {infoItems.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        <div className="tag-row">
          {novel.tags.slice(0, 3).map((tag) => (
            <em key={tag}>{tag}</em>
          ))}
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
          type="button"
        >
          查看详情
        </button>
      </div>
    </article>
  )
}

function NovelWall({
  bulkDeleteEnabled = false,
  novels,
  onBulkDeleteNovels,
  page,
  setPage,
  setSelectedNovel,
  title,
}: {
  bulkDeleteEnabled?: boolean
  novels: Novel[]
  onBulkDeleteNovels?: (ids: number[]) => Promise<void>
  page: number
  setPage: (page: number) => void
  setSelectedNovel: (novel: Novel) => void
  title: string
}) {
  const [bulkManageMode, setBulkManageMode] = useState(false)
  const [selectedNovelIds, setSelectedNovelIds] = useState<Set<number>>(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null)
  const pageSize = 6
  const pageCount = Math.max(1, Math.ceil(novels.length / pageSize))
  const safePage = Math.min(page, pageCount - 1)
  const pageNovels = novels.slice(safePage * pageSize, safePage * pageSize + pageSize)
  const activeSelectedNovelIds = useMemo(() => {
    const availableIds = new Set(novels.map((novel) => novel.id))
    return new Set([...selectedNovelIds].filter((id) => availableIds.has(id)))
  }, [novels, selectedNovelIds])
  const selectedCount = activeSelectedNovelIds.size
  const allCurrentNovelsSelected = novels.length > 0 && selectedCount === novels.length

  const go = (direction: -1 | 1) => {
    setPage((safePage + direction + pageCount) % pageCount)
  }

  const toggleNovelSelection = (id: number) => {
    setBulkDeleteError(null)
    setSelectedNovelIds((currentSelectedIds) => {
      const nextSelectedIds = new Set(currentSelectedIds)

      if (nextSelectedIds.has(id)) {
        nextSelectedIds.delete(id)
      } else {
        nextSelectedIds.add(id)
      }

      return nextSelectedIds
    })
  }

  const clearSelection = () => {
    setSelectedNovelIds(new Set())
    setBulkDeleteError(null)
  }

  const enterBulkManageMode = () => {
    setBulkManageMode(true)
    setBulkDeleteError(null)
  }

  const exitBulkManageMode = () => {
    setBulkManageMode(false)
    clearSelection()
  }

  const toggleAllCurrentNovels = () => {
    setBulkDeleteError(null)
    setSelectedNovelIds(allCurrentNovelsSelected ? new Set() : new Set(novels.map((novel) => novel.id)))
  }

  const handleBulkDelete = async () => {
    if (!onBulkDeleteNovels || selectedCount === 0) return

    const confirmed = window.confirm(`确定删除选中的 ${selectedCount} 本小说吗？此操作不可恢复，建议先导出 JSON 备份。`)
    if (!confirmed) return

    setBulkDeleting(true)
    setBulkDeleteError(null)

    try {
      await onBulkDeleteNovels([...activeSelectedNovelIds])
      exitBulkManageMode()
    } catch (bulkDeleteFailure) {
      setBulkDeleteError(bulkDeleteFailure instanceof Error ? bulkDeleteFailure.message : '批量删除失败，请确认后端服务状态')
    } finally {
      setBulkDeleting(false)
    }
  }

  if (novels.length === 0) {
    return <EmptyState title="作品墙暂时为空" />
  }

  return (
    <section className="wall-section">
      <div className="section-head">
        <div>
          <LibraryBig size={18} />
          <h2>{title}</h2>
        </div>
        <div className="wall-controls">
          {bulkDeleteEnabled && !bulkManageMode && (
            <button className="bulk-manage-button" onClick={enterBulkManageMode} type="button">
              批量管理
            </button>
          )}
          <button onClick={() => go(-1)} type="button" aria-label="上一页">
            <ChevronLeft size={19} />
          </button>
          <button onClick={() => go(1)} type="button" aria-label="下一页">
            <ChevronRight size={19} />
          </button>
        </div>
      </div>
      {bulkDeleteEnabled && bulkManageMode && (
        <div className="bulk-delete-bar">
          <span>已选择 {selectedCount} 本</span>
          <div>
            <button disabled={bulkDeleting || novels.length === 0} onClick={toggleAllCurrentNovels} type="button">
              {allCurrentNovelsSelected ? '取消全选' : '全选当前列表'}
            </button>
            <button className="delete-button" disabled={selectedCount === 0 || bulkDeleting} onClick={handleBulkDelete} type="button">
              <Trash2 size={16} />
              {bulkDeleting ? '删除中' : '批量删除'}
            </button>
            <button className="exit-manage-button" disabled={bulkDeleting} onClick={exitBulkManageMode} type="button">
              退出管理
            </button>
          </div>
          {bulkDeleteError && <p role="alert">{bulkDeleteError}</p>}
        </div>
      )}
      <div className="wall-grid">
        {pageNovels.map((novel) => (
          <WallCard
            bulkSelectEnabled={bulkDeleteEnabled && bulkManageMode}
            checked={activeSelectedNovelIds.has(novel.id)}
            key={novel.id}
            novel={novel}
            onOpen={() => setSelectedNovel(novel)}
            onToggleSelect={() => toggleNovelSelection(novel.id)}
          />
        ))}
      </div>
      <div className="dots">
        {Array.from({ length: pageCount }, (_, dotIndex) => (
          <button
            className={safePage === dotIndex ? 'active' : ''}
            key={dotIndex}
            onClick={() => setPage(dotIndex)}
            type="button"
            aria-label={`切换到第 ${dotIndex + 1} 页`}
          />
        ))}
      </div>
    </section>
  )
}

function WallCard({
  bulkSelectEnabled = false,
  checked = false,
  novel,
  onOpen,
  onToggleSelect,
}: {
  bulkSelectEnabled?: boolean
  checked?: boolean
  novel: Novel
  onOpen: () => void
  onToggleSelect?: () => void
}) {
  return (
    <article className={`wall-card${checked ? ' selected' : ''}`}>
      {bulkSelectEnabled && (
        <label className="wall-select" onClick={(event) => event.stopPropagation()}>
          <input checked={checked} onChange={onToggleSelect} type="checkbox" />
          <span>选择</span>
        </label>
      )}
      <CoverArt cover={novel.cover} size="wall" />
      <div className="wall-info">
        <h3>{novel.title}</h3>
        <p>{novel.author}</p>
        <div className="mini-line">
          <span>{novel.characters[0]?.attribute}</span>
          <span>{novel.ending}</span>
          <span>{novel.rating}</span>
        </div>
        <div className="tag-row">
          {novel.tags.slice(0, 2).map((tag) => (
            <em key={tag}>{tag}</em>
          ))}
        </div>
        <button onClick={onOpen} type="button">查看详情</button>
      </div>
    </article>
  )
}

function AuthorsView({
  authors,
  selectedAuthor,
  setSelectedAuthor,
  setSelectedNovel,
  setWallPage,
  wallPage,
}: {
  authors: { author: string; works: Novel[]; liked: number; finished: number }[]
  selectedAuthor: { author: string; works: Novel[] } | null
  setSelectedAuthor: (author: { author: string; works: Novel[] } | null) => void
  setSelectedNovel: (novel: Novel) => void
  setWallPage: (page: number) => void
  wallPage: number
}) {
  if (selectedAuthor) {
    return (
      <section className="plain-section">
        <div className="section-head">
          <div>
            <UserRound size={18} />
            <h2>{selectedAuthor.author} 的作品</h2>
          </div>
          <button className="reset-filter" onClick={() => setSelectedAuthor(null)} type="button">
            返回作者归档
          </button>
        </div>
        <NovelWall
          novels={selectedAuthor.works}
          page={wallPage}
          setPage={setWallPage}
          setSelectedNovel={setSelectedNovel}
          title={`${selectedAuthor.author} 的作品（${selectedAuthor.works.length}）`}
        />
      </section>
    )
  }

  return (
    <section className="plain-section">
      <div className="section-head">
        <div>
          <UserRound size={18} />
          <h2>作者归档</h2>
        </div>
      </div>
      <div className="author-grid">
        {authors.map((item, index) => (
          <article className={`author-card author-tone-${(index % 5) + 1}`} key={item.author}>
            <h3>{item.author}</h3>
            <p>{item.works.map((novel) => novel.title).join('、')}</p>
            <div className="author-stats">
              <span>作品 <strong>{item.works.length}</strong></span>
              <span>喜欢 <strong>{item.liked}</strong></span>
              <span>看完 <strong>{item.finished}</strong></span>
            </div>
            <button onClick={() => {
              setWallPage(0)
              setSelectedAuthor({ author: item.author, works: item.works })
            }} type="button">
              查看作品
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

function StatsView({
  authors,
  novels,
  stats,
}: {
  authors: { author: string; works: Novel[]; liked: number; finished: number }[]
  novels: Novel[]
  stats: { total: number; finished: number; liked: number; authors: number; abandoned: number }
}) {
  const statusCounts = [
    { label: '看完', count: stats.finished },
    { label: '喜欢', count: stats.liked },
    { label: '荒废', count: stats.abandoned },
  ]
  const cpCounts = ['1v1', '无CP', 'NP'].map((category) => ({
    label: category,
    count: novels.filter((novel) => novel.cpCategory === category).length,
  }))
  const ratingCounts = ['喜欢', '一般', '不喜欢', '未评价'].map((rating) => ({
    label: rating,
    count: novels.filter((novel) => novel.rating === rating).length,
  }))
  const readCounts = [
    { label: '一刷', count: novels.filter((novel) => novel.readCount === 1).length },
    { label: '二刷', count: novels.filter((novel) => novel.readCount === 2).length },
    { label: '三刷及以上', count: novels.filter((novel) => novel.readCount >= 3).length },
  ]
  const authorRank = [...authors].sort((a, b) => b.works.length - a.works.length).slice(0, 10)
  const tags = topTags(novels, 10)

  return (
    <section className="stats-dashboard stats-magazine">
      <div className="section-head">
        <div>
          <BarChart3 size={18} />
          <h2>统计</h2>
        </div>
      </div>
      <div className="stats-asymmetric-grid">
        <section className="stats-core-column">
          <section className="stats-hero">
            <div className="stats-hero-copy">
              <span className="stats-eyebrow">私人阅读地图</span>
              <strong className="stats-big-number">{stats.total}</strong>
              <p>本小说记录在这里</p>
            </div>
            <div className="stats-hero-metrics" aria-label="核心统计">
              <span>
                <em>作者</em>
                <strong>{stats.authors}</strong>
                <i>位</i>
              </span>
              <span>
                <em>看完</em>
                <strong>{stats.finished}</strong>
                <i>本</i>
              </span>
              <span>
                <em>喜欢</em>
                <strong>{stats.liked}</strong>
                <i>本</i>
              </span>
              <span>
                <em>荒废</em>
                <strong>{stats.abandoned}</strong>
                <i>本</i>
              </span>
            </div>
            <p className="stats-hero-note">这是一份属于你的私人阅读地图</p>
          </section>

          <div className="stats-bars-stack">
            <StatsBarBlock title="阅读状态" items={statusCounts} total={novels.length} />
            <StatsBarBlock title="CP类别" items={cpCounts} total={novels.length} />
          </div>

          <div className="stats-secondary-row">
            <StatsSecondaryPanel className="wide" items={ratingCounts} title="评价分布" total={novels.length} />
            <StatsSecondaryPanel className="narrow" items={readCounts} title="阅读次数" total={novels.length} />
          </div>
        </section>

        <aside className="stats-side-column">
          <section className="stats-tag-cloud">
            <h3>常用标签</h3>
            <div>
              {tags.map((item, index) => (
                <span
                  key={item.tag}
                  style={
                    {
                      '--tag-size': `${13 + Math.min(item.count, 3) * 2 + (index % 2)}px`,
                      '--tag-shift': `${(index % 4) * 7}px`,
                    } as CSSProperties
                  }
                >
                  #{item.tag} <strong>{item.count}</strong>
                </span>
              ))}
            </div>
          </section>

          <section className="stats-author-rank">
            <h3>作者排行</h3>
            <ol>
              {authorRank.map((item, index) => (
                <li key={item.author}>
                  <em>{index + 1}</em>
                  <span>{item.author}</span>
                  <strong>{item.works.length} 本</strong>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </section>
  )
}

function StatsBarBlock({
  items,
  title,
  total,
}: {
  items: { label: string; count: number }[]
  title: string
  total: number
}) {
  return (
    <section className="stats-bars">
      <h3>{title}</h3>
      <div className="bar-list">
        {items.map((item) => (
          <div className="bar-row" key={item.label}>
            <span>{item.label}</span>
            <div>
              <i
                style={
                  {
                    '--bar-width': `${Math.max(8, (item.count / Math.max(total, 1)) * 100)}%`,
                  } as CSSProperties
                }
              />
            </div>
            <strong>{item.count}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function StatsSecondaryPanel({
  className,
  items,
  title,
  total,
}: {
  className: string
  items: { label: string; count: number }[]
  title: string
  total: number
}) {
  return (
    <section className={`stats-secondary-panel ${className}`}>
      <h3>{title}</h3>
      <div>
        {items.map((item) => (
          <span
            key={item.label}
            style={
              {
                '--bar-width': `${Math.max(10, (item.count / Math.max(total, 1)) * 100)}%`,
              } as CSSProperties
            }
          >
            <em>{item.label}</em>
            <i />
            <strong>{item.count}</strong>
          </span>
        ))}
      </div>
    </section>
  )
}

function BackupView({ novels, onReloadNovels }: { novels: Novel[]; onReloadNovels: () => Promise<Novel[]> }) {
  const [exporting, setExporting] = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null)
  const [selectedCsvFile, setSelectedCsvFile] = useState<File | null>(null)
  const [csvText, setCsvText] = useState('')
  const [csvPreview, setCsvPreview] = useState<CsvImportPreview | null>(null)
  const [csvPreviewing, setCsvPreviewing] = useState(false)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [csvMessage, setCsvMessage] = useState<string | null>(null)
  const backupStats = [
    { label: '最近备份时间', value: '2026-06-10 23:18' },
    { label: '当前小说数量', value: `${novels.length} 本` },
    { label: '当前作者数量', value: `${new Set(novels.map((novel) => novel.author)).size} 位` },
    { label: '当前标签数量', value: `${new Set(novels.flatMap((novel) => novel.tags)).size} 个` },
  ]
  const backupRecords = [
    { date: '2026-06-10', title: 'JSON 备份', type: 'JSON' },
    { date: '2026-05-28', title: '手动整理标签后备份', type: '手动整理' },
    { date: '2026-05-16', title: '初始小说清单备份', type: '初始清单' },
  ]

  const handleExportJson = async () => {
    setExporting(true)
    setExportError(null)

    try {
      const backup = await exportNovelBackup<NovelBackup>()
      const today = new Date().toISOString().slice(0, 10)
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = `novel-backup-${today}.json`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : '导出失败，请确认后端服务已启动')
    } finally {
      setExporting(false)
    }
  }

  const handleExportCsv = async () => {
    setExportingCsv(true)
    setExportError(null)

    try {
      const csv = await exportNovelCsv()
      const today = new Date().toISOString().slice(0, 10)
      const csvWithBom = csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`
      const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = `novel-export-${today}.csv`
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'CSV 导出失败，请确认后端服务已启动')
    } finally {
      setExportingCsv(false)
    }
  }

  const handleImportJson = async () => {
    if (!selectedBackupFile) {
      setImportError('请先选择 JSON 文件')
      return
    }

    const confirmed = window.confirm('导入会覆盖当前数据库中的小说数据，建议先导出当前数据备份。确定继续吗？')
    if (!confirmed) return

    setImporting(true)
    setImportError(null)
    setImportMessage(null)

    try {
      const rawBackup = await selectedBackupFile.text()
      const backup = JSON.parse(rawBackup) as unknown
      const result = await importNovelBackup<NovelImportResult>(backup)

      await onReloadNovels()
      setImportMessage(`导入成功，共恢复 ${result.count} 本小说`)
      setSelectedBackupFile(null)
    } catch (error) {
      if (error instanceof SyntaxError) {
        setImportError('JSON 文件格式错误')
      } else {
        setImportError(error instanceof Error ? error.message : '导入失败，请确认 JSON 结构正确且后端服务已启动')
      }
    } finally {
      setImporting(false)
    }
  }

  const handlePreviewCsv = async () => {
    if (!selectedCsvFile) {
      setCsvError('请先选择 CSV 文件')
      return
    }

    setCsvPreviewing(true)
    setCsvError(null)
    setCsvMessage(null)

    try {
      const nextCsvText = await selectedCsvFile.text()
      const preview = await previewCsvImport<CsvImportPreview>(nextCsvText)

      setCsvText(nextCsvText)
      setCsvPreview(preview)
    } catch (error) {
      setCsvPreview(null)
      setCsvText('')
      setCsvError(error instanceof Error ? error.message : 'CSV 预览失败，请确认文件格式')
    } finally {
      setCsvPreviewing(false)
    }
  }

  const handleConfirmCsvImport = async () => {
    if (!csvPreview || !csvText) {
      setCsvError('请先预览校验 CSV')
      return
    }
    if (csvPreview.importableCount === 0) {
      setCsvError('没有可导入的 CSV 行')
      return
    }

    const confirmed = window.confirm(`确认导入 ${csvPreview.importableCount} 本小说吗？重复和错误行会跳过。`)
    if (!confirmed) return

    setCsvImporting(true)
    setCsvError(null)
    setCsvMessage(null)

    try {
      const result = await confirmCsvImport<CsvImportResult>(csvText)

      await onReloadNovels()
      setCsvMessage(`CSV 导入成功，共新增 ${result.importedCount} 本小说`)
      setCsvPreview(null)
      setCsvText('')
      setSelectedCsvFile(null)
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : 'CSV 导入失败，请确认后端服务已启动')
    } finally {
      setCsvImporting(false)
    }
  }

  return (
    <section className="backup-page plain-section">
      <div className="section-head">
        <div>
          <Archive size={18} />
          <h2>备份</h2>
        </div>
      </div>

      <section className="backup-hero">
        <div>
          <span>本地数据备份</span>
          <h3>把小说袋定期打包，避免记录丢失。</h3>
          <p>JSON 备份会包含小说、作者、主角、CP类别、标签、评价、阅读次数、备注和时间记录。建议每次集中整理后手动导出一份。</p>
        </div>
        <div className="backup-cat-folder" aria-hidden="true">
          <span className="folder" />
          <span className="cat-head" />
          <span className="leaf leaf-one" />
          <span className="leaf leaf-two" />
        </div>
      </section>

      <div className="backup-status-grid">
        {backupStats.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>

      <div className="backup-grid backup-action-grid">
        <article className="backup-card export-card">
          <h3>JSON 备份</h3>
          <p>导出当前 SQLite 中的完整小说 JSON 数据，适合手动留存和迁移前备份。</p>
          <div className="backup-buttons">
            <button disabled={exporting} onClick={handleExportJson} type="button">
              {exporting ? '导出中' : '导出 JSON'}
            </button>
            <button disabled={exportingCsv} onClick={handleExportCsv} type="button">
              {exportingCsv ? '导出中' : '导出 CSV'}
            </button>
          </div>
          {exportError && <p role="alert">{exportError}</p>}
          <ul>
            <li>文件名格式为 novel-backup-日期.json。</li>
            <li>JSON 包含小说基础信息、主角、标签、评价、阅读次数和时间记录。</li>
            <li>导入会覆盖当前数据库，请先导出当前数据备份。</li>
          </ul>
        </article>

        <article className="backup-card import-card">
          <h3>导入 JSON</h3>
          <p>选择此前导出的 novel-backup-日期.json，将其中的小说数据恢复到 SQLite。</p>
          <label className="tag-input">
            <input
              accept="application/json,.json"
              onChange={(event) => {
                setSelectedBackupFile(event.target.files?.[0] ?? null)
                setImportError(null)
                setImportMessage(null)
              }}
              type="file"
            />
          </label>
          <div className="backup-buttons">
            <button disabled={importing || !selectedBackupFile} onClick={handleImportJson} type="button">
              {importing ? '导入中' : '导入 JSON'}
            </button>
          </div>
          {selectedBackupFile && <p>已选择：{selectedBackupFile.name}</p>}
          {importMessage && <p role="status">{importMessage}</p>}
          {importError && <p role="alert">{importError}</p>}
        </article>

        <article className="backup-card import-card">
          <h3>导入 CSV</h3>
          <p>选择按固定表头整理的 CSV，先预览校验，确认后写入 SQLite。</p>
          <label className="tag-input">
            <input
              accept=".csv,text/csv"
              onChange={(event) => {
                setSelectedCsvFile(event.target.files?.[0] ?? null)
                setCsvPreview(null)
                setCsvText('')
                setCsvError(null)
                setCsvMessage(null)
              }}
              type="file"
            />
          </label>
          <div className="backup-buttons">
            <button disabled={csvPreviewing || !selectedCsvFile} onClick={handlePreviewCsv} type="button">
              {csvPreviewing ? '校验中' : '预览校验'}
            </button>
            <button disabled={csvImporting || !csvPreview || csvPreview.importableCount === 0} onClick={handleConfirmCsvImport} type="button">
              {csvImporting ? '导入中' : '确认导入 CSV'}
            </button>
          </div>
          {selectedCsvFile && <p>已选择：{selectedCsvFile.name}</p>}
          {csvPreview && (
            <div>
              <p>
                总行数 {csvPreview.totalRows} / 可导入 {csvPreview.importableCount} / 重复 {csvPreview.duplicateCount} / 错误 {csvPreview.errorCount}
              </p>
              <ol className="backup-records">
                {csvPreview.rows.slice(0, 20).map((row) => (
                  <li key={`${row.rowNumber}-${row.novel.title}-${row.status}`}>
                    <time>第 {row.rowNumber} 行</time>
                    <strong>{row.novel.title || '未填写书名'}</strong>
                    <span>
                      {row.status === 'ready' && '可导入'}
                      {row.status === 'duplicate' && `重复：${row.duplicateReasons.join('；')}`}
                      {row.status === 'error' && `错误：${row.errors.join('；')}`}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {csvMessage && <p role="status">{csvMessage}</p>}
          {csvError && <p role="alert">{csvError}</p>}
        </article>
      </div>

      <div className="backup-lower-grid">
        <article className="backup-card backup-record-card">
          <h3>备份记录</h3>
          <ol className="backup-records">
            {backupRecords.map((record) => (
              <li key={`${record.date}-${record.type}`}>
                <time>{record.date}</time>
                <strong>{record.title}</strong>
                <span>{record.type}</span>
              </li>
            ))}
          </ol>
        </article>

        <article className="backup-card safety-card">
          <h3>安全提示</h3>
          <p>导入前会检查 JSON 结构和枚举字段；如果校验或写入失败，会保留原数据库数据。</p>
          <div className="safety-tags">
            <span>手动留存</span>
            <span>本地文件</span>
            <span>JSON</span>
            <span>事务恢复</span>
          </div>
        </article>
      </div>
    </section>
  )
}

function NovelFormView({
  allTags,
  fallbackNovel,
  mode,
  novel,
  novels,
  onCreateNovel,
  onUpdateNovel,
  setActiveView,
}: {
  allTags: string[]
  fallbackNovel: Novel
  mode: 'new' | 'edit'
  novel?: Novel
  novels: Novel[]
  onCreateNovel?: (payload: NovelPayload) => Promise<void>
  onUpdateNovel?: (id: number, payload: NovelPayload) => Promise<void>
  setActiveView: (view: View) => void
}) {
  const baseNovel = novel ?? {
    ...fallbackNovel,
    id: 99,
    title: '新记录的故事',
    author: '待填写作者',
    status: '看完' as ReadStatus,
    rating: '未评价' as Rating,
    readCount: 1,
    tags: ['新标签', '待整理'],
    notes: '这里会实时预览备注和标签。',
    cpCategory: '1v1' as CpCategory,
    ending: '其他' as Novel['ending'],
    cover: 'book' as CoverStyle,
    favorite: false,
  }
  const [title, setTitle] = useState(baseNovel.title)
  const [author, setAuthor] = useState(baseNovel.author)
  const [characters, setCharacters] = useState<Character[]>(baseNovel.characters)
  const [cpCategory, setCpCategory] = useState<CpCategory>(baseNovel.cpCategory)
  const [ending, setEnding] = useState<Novel['ending']>(normalizeEndingForForm(baseNovel.ending))
  const [status, setStatus] = useState<ReadStatus>(baseNovel.status)
  const [rating, setRating] = useState<Rating>(baseNovel.rating)
  const [readCountInput, setReadCountInput] = useState(String(baseNovel.readCount))
  const [selectedTags, setSelectedTags] = useState<string[]>(baseNovel.tags)
  const [notes, setNotes] = useState(baseNovel.notes)
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null)

  const previewNovel: Novel = {
    ...baseNovel,
    title,
    author,
    characters,
    cpCategory,
    ending,
    status,
    rating,
    readCount: Math.max(0, Number.parseInt(readCountInput, 10) || 0),
    tags: selectedTags,
    notes,
  }

  const addCharacter = () => {
    setCharacters([...characters, { name: `主角${characters.length + 1}`, attribute: '其他' }])
  }

  const updateTitle = (value: string) => {
    setTitle(value)
    setPendingDuplicate(null)
  }

  const updateAuthor = (value: string) => {
    setAuthor(value)
    setPendingDuplicate(null)
  }

  const removeCharacter = (index: number) => {
    setCharacters(characters.filter((_, itemIndex) => itemIndex !== index))
  }

  const updateCharacter = (index: number, nextCharacter: Character) => {
    setCharacters(characters.map((character, itemIndex) => (itemIndex === index ? nextCharacter : character)))
  }

  const addTag = (tag: string) => {
    const cleanTag = tag.trim()
    if (cleanTag.length === 0 || selectedTags.includes(cleanTag)) return
    setSelectedTags([...selectedTags, cleanTag])
    setTagInput('')
  }

  const buildPayload = (): NovelPayload => {
    const today = new Date().toISOString().slice(0, 10)
    return {
      author: previewNovel.author,
      characters: previewNovel.characters,
      cover: mode === 'new' && previewNovel.cover === 'book' ? pickStableCover(previewNovel.title, previewNovel.author) : previewNovel.cover,
      cpCategory: previewNovel.cpCategory,
      createdAt: mode === 'new' ? today : previewNovel.createdAt,
      ending: normalizeEndingForForm(previewNovel.ending),
      favorite: previewNovel.favorite,
      notes: previewNovel.notes,
      rating: previewNovel.rating,
      readCount: previewNovel.readCount,
      status: previewNovel.status,
      tags: previewNovel.tags,
      title: previewNovel.title,
      updatedAt: today,
    }
  }

  const persistNovel = async (payload: NovelPayload) => {
    setSaving(true)
    setSubmitError(null)

    try {
      if (mode === 'new' && onCreateNovel) {
        await onCreateNovel(payload)
      }

      if (mode === 'edit' && novel && onUpdateNovel) {
        await onUpdateNovel(novel.id, payload)
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '保存失败，请确认后端服务已启动')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (mode === 'new' && !onCreateNovel) return
    if (mode === 'edit' && (!novel || !onUpdateNovel)) return

    const payload = buildPayload()
    const duplicate = findDuplicateNovel(novels, payload, mode === 'edit' ? novel?.id : undefined)

    setSubmitError(null)

    if (duplicate) {
      setPendingDuplicate({ match: duplicate, payload })
      return
    }

    setPendingDuplicate(null)
    await persistNovel(payload)
  }

  const continueDuplicateSave = async () => {
    if (!pendingDuplicate) return

    const { payload } = pendingDuplicate
    setPendingDuplicate(null)
    await persistNovel(payload)
  }

  const formSteps = [
    { done: Boolean(previewNovel.title && previewNovel.author), label: '基础信息', text: '书名、作者、CP 和结局' },
    { done: characters.length > 0, label: '主角信息', text: '姓名和单独属性' },
    { done: Boolean(previewNovel.status && previewNovel.rating), label: '阅读信息', text: '状态、评价和次数' },
    { done: selectedTags.length > 0 || previewNovel.notes.length > 0, label: '标签备注', text: '标签、备注和后续补充' },
  ]

  return (
    <section className="form-page">
      <aside className="form-art-panel">
        <div className="cat-write-doodle" aria-hidden="true">
          <span className="ear left" />
          <span className="ear right" />
          <span className="face" />
          <span className="cup" />
          <span className="pencil" />
          <span className="spark one" />
          <span className="spark two" />
          <span className="speech">write</span>
        </div>
        <h2>{mode === 'new' ? '把新故事放进袋子里' : '整理这本小说的记录'}</h2>
        <p>封面、主角、标签和阅读状态会组成右侧预览，后续接入数据库后再保存真实数据。</p>
        <div className="preview-mini">
          <CoverArt cover={previewNovel.cover} size="wall" />
          <div>
            <span className="preview-eyebrow">实时预览</span>
            <strong>{previewNovel.title}</strong>
            <span>{previewNovel.author}</span>
            <dl className="preview-meta">
              <div>
                <dt>CP</dt>
                <dd>{previewNovel.cpCategory}</dd>
              </div>
              <div>
                <dt>结局</dt>
                <dd>{previewNovel.ending}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{previewNovel.status}</dd>
              </div>
            </dl>
            <p>{characters.map((character) => `${character.name} ${character.attribute}`).join(' / ')}</p>
            <div className="tag-row">
              {selectedTags.slice(0, 4).map((tag) => (
                <em key={tag}>{tag}</em>
              ))}
            </div>
          </div>
        </div>
        <div className="form-progress">
          <h3>填写进度</h3>
          {formSteps.map((step) => (
            <div className={step.done ? 'done' : ''} key={step.label}>
              <i />
              <span>
                <strong>{step.label}</strong>
                <em>{step.text}</em>
              </span>
            </div>
          ))}
        </div>
        <div className="form-tips">
          <h3>小提示</h3>
          <p>书名和作者会用于后续查重；主角属性只在每位主角上单独选择；标签可以先少填，之后继续补充。</p>
        </div>
      </aside>

      <section className="form-panel">
        <div className="form-title">
          <h2>{mode === 'new' ? '新增小说' : '编辑小说'}</h2>
          <span>{mode === 'new' ? '静态表单原型' : previewNovel.title}</span>
        </div>

        {submitError && <p role="alert">{submitError}</p>}
        {pendingDuplicate && (
          <div className="form-section" role="alert">
            <h3>重复提示</h3>
            <p>
              可能已存在相同记录：{pendingDuplicate.match.title} by {pendingDuplicate.match.author}
            </p>
            <div className="form-actions">
              <button className="save-action" disabled={saving} onClick={continueDuplicateSave} type="button">
                继续保存
              </button>
              <button disabled={saving} onClick={() => setPendingDuplicate(null)} type="button">
                返回修改
              </button>
            </div>
          </div>
        )}

        <FormSection title="基础信息">
          <Field label="书名" onChange={updateTitle} value={previewNovel.title} />
          <Field label="作者" onChange={updateAuthor} value={previewNovel.author} />
          <SelectField label="CP类别" onChange={(value) => setCpCategory(value as CpCategory)} options={['1v1', '无CP', 'NP']} value={previewNovel.cpCategory} />
          <SelectField label="结局" onChange={(value) => setEnding(value as Novel['ending'])} options={['HE', 'BE', 'OE', '坑', '其他']} value={previewNovel.ending} />
        </FormSection>

        <FormSection title="主角">
          <div className="character-editor">
            {characters.map((character, index) => (
              <div className="character-row" key={`character-${index}`}>
                <Field
                  label="主角"
                  onChange={(value) => updateCharacter(index, { ...character, name: value })}
                  value={character.name}
                />
                <SelectField
                  label="主角属性"
                  onChange={(value) => updateCharacter(index, { ...character, attribute: value as CharacterAttribute })}
                  options={['1', '0', '0.5', '其他']}
                  value={character.attribute}
                />
                <button onClick={() => removeCharacter(index)} type="button">删除</button>
              </div>
            ))}
            <button className="outline-button" onClick={addCharacter} type="button">
              添加主角
            </button>
          </div>
        </FormSection>

        <FormSection title="阅读信息">
          <SelectField label="阅读状态" onChange={(value) => setStatus(value as ReadStatus)} options={['看完', '荒废']} value={previewNovel.status} />
          <SelectField label="个人评价" onChange={(value) => setRating(value as Rating)} options={['喜欢', '一般', '不喜欢', '未评价']} value={previewNovel.rating} />
          <Field label="阅读次数" onChange={setReadCountInput} value={readCountInput} />
        </FormSection>

        <FormSection title="标签和备注">
          <div className="tag-editor">
            <span>标签</span>
            <div className="selected-tags">
              {selectedTags.map((tag) => (
                <button key={tag} onClick={() => setSelectedTags(selectedTags.filter((item) => item !== tag))} type="button">
                  #{tag}
                  <X size={13} />
                </button>
              ))}
            </div>
            <div className="tag-picker">
              {allTags.slice(0, 10).map((tag) => (
                <button key={tag} onClick={() => addTag(tag)} type="button">
                  {tag}
                </button>
              ))}
            </div>
            <label className="tag-input">
              <input
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addTag(tagInput)
                  }
                }}
                placeholder="输入新标签"
                value={tagInput}
              />
              <button onClick={() => addTag(tagInput)} type="button">添加</button>
            </label>
          </div>
          <label className="textarea-field">
            <span>备注</span>
            <textarea onChange={(event) => setNotes(event.target.value)} value={previewNovel.notes} />
          </label>
        </FormSection>

        <div className="form-actions">
          <button className="save-action" disabled={saving} onClick={handleSubmit} type="button">
            <Save size={17} />
            {saving ? '保存中' : '保存'}
          </button>
          <button onClick={() => setActiveView('home')} type="button">
            取消
          </button>
          <button type="button">
            <RotateCcw size={17} />
            重置
          </button>
        </div>
      </section>
    </section>
  )
}

function FormSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="form-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Field({
  label,
  onChange,
  value,
}: {
  label: string
  onChange?: (value: string) => void
  value: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input onChange={(event) => onChange?.(event.target.value)} value={value} />
    </label>
  )
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string
  onChange?: (value: string) => void
  options: string[]
  value: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select onChange={(event) => onChange?.(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  )
}

function DetailModal({
  novel,
  onClose,
  onDelete,
  onEdit,
}: {
  novel: Novel
  onClose: () => void
  onDelete: (id: number) => Promise<void>
  onEdit: (novel: Novel) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async () => {
    const confirmed = window.confirm(`确认删除《${novel.title}》吗？`)
    if (!confirmed) return

    setDeleting(true)
    setDeleteError(null)

    try {
      await onDelete(novel.id)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '删除失败，请确认后端服务已启动')
      setDeleting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <article className="detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="detail-titlebar">
          <span>小说详情</span>
          <button onClick={onClose} type="button" aria-label="关闭详情">
            <X size={18} />
          </button>
        </div>
        <div className="detail-body">
          <CoverArt cover={novel.cover} size="detail" />
          <section className="detail-info">
            <h2>{novel.title}</h2>
            <p>作者：{novel.author}</p>
            <div className="detail-grid">
              <Info label="主角" value={novel.characters.map((character) => character.name).join('、')} />
              <Info label="主角属性" value={novel.characters.map((character) => `${character.name} ${character.attribute}`).join(' / ')} />
              <Info label="CP类别" value={novel.cpCategory} />
              <Info label="结局" value={novel.ending} />
              <Info label="阅读状态" value={novel.status} />
              <Info label="个人评价" value={novel.rating} />
              <Info label="阅读次数" value={`${novel.readCount} 次`} />
              <Info label="添加时间" value={novel.createdAt} />
              <Info label="修改时间" value={novel.updatedAt} />
            </div>
            <div className="tag-row detail-tags">
              {novel.tags.map((tag) => (
                <em key={tag}>{tag}</em>
              ))}
            </div>
            <p className="detail-note">{novel.notes}</p>
            {deleteError && <p role="alert">{deleteError}</p>}
            <div className="modal-actions">
              <button className="edit-button" onClick={() => onEdit(novel)} type="button">
                <Edit3 size={17} />
                编辑
              </button>
              <button className="delete-button" disabled={deleting} onClick={handleDelete} type="button">
                <Trash2 size={17} />
                {deleting ? '删除中' : '删除'}
              </button>
              <button className="close-outline" onClick={onClose} type="button">
                关闭
              </button>
            </div>
          </section>
        </div>
      </article>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <p className="info-row">
      <strong>{label}</strong>
      <span>{value}</span>
    </p>
  )
}

function CoverArt({ cover, size }: { cover: CoverStyle; size: 'feature' | 'wall' | 'detail' }) {
  return (
    <div className={`cover-art cover-${cover} cover-${size}`} aria-hidden="true">
      <span className="shape moon" />
      <span className="shape apple" />
      <span className="shape cat-face" />
      <span className="shape book-block" />
      <span className="shape flower" />
      <span className="shape cloud" />
      <span className="shape portrait-head" />
      <span className="shape line-one" />
      <span className="shape line-two" />
      <BookOpen size={size === 'wall' ? 22 : 30} />
    </div>
  )
}

function EmptyState({ title }: { title: string }) {
  return (
    <section className="empty-state">
      <div className="empty-cat" aria-hidden="true">
        <span className="empty-cat-face" />
        <span className="empty-cat-book" />
      </div>
      <h2>{title}</h2>
      <p>调整搜索或筛选条件后再试一次。</p>
    </section>
  )
}

function DecorativeLines() {
  return (
    <div className="decorations" aria-hidden="true">
      <svg className="doodle-line top-line" viewBox="0 0 360 70">
        <path d="M4 42 C 62 10, 92 72, 144 33 S 252 6, 356 45" />
      </svg>
      <svg className="doodle-line lower-line" viewBox="0 0 420 80">
        <path d="M6 52 C 80 14, 112 86, 190 35 S 330 8, 414 58" />
      </svg>
      <span className="floating-star">☆</span>
      <span className="floating-apple" />
      <span className="floating-cloud" />
      <span className="floating-flower" />
      <span className="floating-pencil" />
    </div>
  )
}

function topTags(source: Novel[], limit: number) {
  const counts = new Map<string, number>()
  source.flatMap((novel) => novel.tags).forEach((tag) => {
    counts.set(tag, (counts.get(tag) ?? 0) + 1)
  })

  return Array.from(counts, ([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-Hans-CN'))
    .slice(0, limit)
}

function normalizeEndingForForm(ending: Novel['ending']): Novel['ending'] {
  if (ending === '未完结') return '坑'
  if (ending === '未知') return '其他'
  return ending
}

function isLibraryView(view: View) {
  return ['all', 'finished', 'liked', 'abandoned', 'cp-1v1', 'cp-none', 'cp-np'].includes(view)
}

function viewTitle(view: View) {
  const titles: Partial<Record<View, string>> = {
    all: '全部小说',
    recent: '最近添加',
    finished: '看完',
    liked: '喜欢',
    abandoned: '荒废',
    'cp-1v1': '1v1',
    'cp-none': '无CP',
    'cp-np': 'NP',
  }

  return titles[view] ?? '全部小说'
}

export default App
