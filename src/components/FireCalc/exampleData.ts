import type { IFinancialData, IFinancialEntry, ILongTermItem } from './types'

/** 示例数据统一前缀，便于与真实数据区分 */
const EXAMPLE_PREFIX = '示例 · '

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1))
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function fmtDateParts(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const ASSET_TYPES = ['银行 A', '银行 B', '支付平台', '公积金', '券商 A', '券商 B', '基金平台']
const EXTRA_TYPES = ['医保', '保险理财']

function splitAmount(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  let remaining = round2(total)
  return weights.map((w, i) => {
    if (i === weights.length - 1) {
      const v = remaining
      remaining = 0
      return v
    }
    const v = round2(total * w / sum)
    remaining = round2(remaining - v)
    return v
  })
}

interface IItemSpec {
  name: string
  price: [number, number]
  wight: [number, number] | null
}

const ITEM_POOL: IItemSpec[] = [
  { name: '机械键盘', price: [300, 1200], wight: [800, 1500] },
  { name: '平板电脑', price: [2000, 8000], wight: [300, 700] },
  { name: '智能手机', price: [3000, 9000], wight: [150, 250] },
  { name: '笔记本电脑', price: [5000, 20000], wight: [1500, 2500] },
  { name: '运动手表', price: [500, 3000], wight: [40, 80] },
  { name: '眼镜', price: [200, 1500], wight: [20, 40] },
  { name: '自行车', price: [1000, 5000], wight: null },
  { name: '蓝牙耳机', price: [200, 2000], wight: [50, 300] },
  { name: '相机', price: [3000, 15000], wight: [500, 1000] },
  { name: '游戏机', price: [2000, 5000], wight: [1000, 2000] },
]

function generateFinancialData(now: Date): IFinancialEntry[] {
  const months = 18
  const entries: IFinancialEntry[] = []
  let value = rand(300000, 500000)

  for (let i = months; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, randInt(5, 20))
    const growth = rand(-0.01, 0.06)
    const deposit = rand(5000, 20000)
    value = value * (1 + growth) + deposit

    const date = fmtDateParts(d)
    const weights = ASSET_TYPES.map(() => rand(0.3, 1.5))
    const amounts = splitAmount(value, weights)

    entries.push({
      date,
      net_assets: round2(value),
      remark: '',
      detailed_data: [
        ...ASSET_TYPES.map((type, idx) => ({
          type: `${EXAMPLE_PREFIX}${type}`,
          net_assets: Math.max(0, amounts[idx]),
          remark: '',
          not_included: false,
        })),
        ...EXTRA_TYPES.map(type => ({
          type: `${EXAMPLE_PREFIX}${type}`,
          net_assets: round2(rand(3000, 150000)),
          remark: '',
          not_included: true,
        })),
      ],
    })
  }

  return entries
}

function generateItems(now: Date): ILongTermItem[] {
  return ITEM_POOL.map((spec) => {
    const year = randInt(2018, now.getFullYear())
    const month = randInt(1, 12)
    const day = randInt(1, 28)
    const price = round2(rand(spec.price[0], spec.price[1]))
    const wight = spec.wight ? round2(rand(spec.wight[0], spec.wight[1])) : null
    let retire_date: string | null = null
    if (Math.random() < 0.2 && year <= now.getFullYear() - 3) {
      const ry = Math.min(now.getFullYear(), year + randInt(3, 6))
      retire_date = `${ry}-${pad(randInt(1, 12))}-${pad(randInt(1, 28))}`
    }
    return {
      name: `${EXAMPLE_PREFIX}${spec.name}`,
      date: `${year}-${pad(month)}-${pad(day)}`,
      price,
      remark: '',
      wight,
      retire_date,
    }
  })
}

/** 极简示例：1 条净资产记录（含 3 条明细）+ 1 件物品，作为默认数据 */
export function generateMinimalExampleData(): IFinancialData {
  const now = new Date()
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`

  return {
    fiancial_data: [
      {
        date,
        net_assets: 180000,
        remark: '示例数据，点击「示例」可加载完整示例',
        detailed_data: [
          { type: `${EXAMPLE_PREFIX}银行 A`, net_assets: 120000, remark: '', not_included: false },
          { type: `${EXAMPLE_PREFIX}基金平台`, net_assets: 60000, remark: '', not_included: false },
          { type: `${EXAMPLE_PREFIX}医保`, net_assets: 20000, remark: '', not_included: true },
        ],
      },
    ],
    items_of_long_term_use: [
      {
        name: `${EXAMPLE_PREFIX}笔记本电脑`,
        date: `${now.getFullYear() - 2}-06-15`,
        price: 8999,
        remark: '',
        wight: 1800,
        retire_date: null,
      },
    ],
  }
}

/** 完整示例：18 个月的净资产记录 + 10 件物品 */
export function generateExampleData(): IFinancialData {
  const now = new Date()
  return {
    fiancial_data: generateFinancialData(now),
    items_of_long_term_use: generateItems(now),
  }
}
