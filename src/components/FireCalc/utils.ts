import type { IFinancialEntry } from './types'

export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function fmtNum(n: number | string | null | undefined, digits = 0): string {
  if (n === null || n === undefined || n === '')
    return '—'
  return Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d || 1)
}

export function diffDays(dateStr: string | null | undefined): number | null {
  if (!dateStr)
    return null
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.floor((startOfDay.getTime() - parseDate(dateStr).getTime()) / 86400000)
}

export function fmtElapsed(dateStr: string | null | undefined): string | null {
  if (!dateStr)
    return null
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const d = parseDate(dateStr)
  let y = startOfDay.getFullYear() - d.getFullYear()
  let m = startOfDay.getMonth() - d.getMonth()
  let day = startOfDay.getDate() - d.getDate()
  if (day < 0) {
    m -= 1
    day += new Date(startOfDay.getFullYear(), startOfDay.getMonth(), 0).getDate()
  }
  if (m < 0) {
    y -= 1
    m += 12
  }
  return `${y}年${m}个月${day}天`
}

export function monthKey(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth()
}

export function mkDate(mk: number): Date {
  return new Date(Math.floor(mk / 12), mk % 12, 1)
}

export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function fmtYearsMonths(m: number): string {
  const y = Math.floor(m / 12)
  const mm = m % 12
  return y > 0 ? `${y} 年 ${mm} 个月` : `${mm} 个月`
}

export function simulate(initial: number, monthlySave: number, annualReturn: number, months: number): number[] {
  const r = annualReturn / 100 / 12
  let val = initial
  const out: number[] = []
  for (let i = 0; i < months; i++) {
    val = val * (1 + r) + monthlySave
    out.push(val)
  }
  return out
}

export function simulateLifecycle(
  initial: number,
  monthlySave: number,
  annualReturn: number,
  expense: number,
  infl: number,
  fiMonths: number,
  months: number,
): number[] {
  const r = annualReturn / 100 / 12
  const inf = infl / 100
  let val = initial
  const out: number[] = []
  for (let i = 1; i <= months; i++) {
    if (i <= fiMonths) {
      val = val * (1 + r) + monthlySave
    }
    else {
      const yearsAfter = Math.floor((i - fiMonths - 1) / 12)
      const monthlyExpense = expense * (1 + inf) ** yearsAfter / 12
      val = val * (1 + r) - monthlyExpense
    }
    out.push(val)
  }
  return out
}

export function trendForecast(fin: IFinancialEntry[], months: number, baseMK: number) {
  const pts = fin.slice(-12).map(e => ({ x: monthKey(parseDate(e.date)), y: e.net_assets }))
  const n = pts.length
  const sx = pts.reduce((s, p) => s + p.x, 0)
  const sy = pts.reduce((s, p) => s + p.y, 0)
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0)
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0)
  const denom = n * sxx - sx * sx
  let slope = 0
  let intercept = n ? sy / n : 0
  if (n > 1 && denom) {
    slope = (n * sxy - sx * sy) / denom
    intercept = (sy - slope * sx) / n
  }
  const out: { date: string, val: number }[] = []
  for (let i = 1; i <= months; i++)
    out.push({ date: fmtDate(mkDate(baseMK + i)), val: intercept + slope * (baseMK + i) })
  return out
}

export function calcFIRE(expense: number, swr: number, monthlySave: number, annualReturn: number, initial: number) {
  if (!(expense > 0) || !(swr > 0))
    return { target: 0, months: -1, val: 0 }
  const target = expense / (swr / 100)
  const r = annualReturn / 100 / 12
  let val = initial
  for (let i = 1; i <= 600; i++) {
    val = val * (1 + r) + monthlySave
    if (val >= target)
      return { target, months: i, val }
  }
  return { target, months: -1, val }
}

export function subtotal(details: { net_assets: number, not_included?: boolean }[]): number {
  return details.filter(d => !d.not_included).reduce((s, d) => s + (d.net_assets || 0), 0)
}
