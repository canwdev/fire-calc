import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { CaptureResult, SnapdomOptions } from '@zumer/snapdom'

export interface IDetailData {
  type: string
  net_assets: number
  remark?: string
  not_included?: boolean
}

export interface IFinancialEntry {
  date: string
  net_assets: number
  remark?: string
  detailed_data?: IDetailData[]
}

export interface ILongTermItem {
  name: string
  date: string | null
  price: number | null
  remark?: string
  wight: number | null
  retire_date: string | null
}

export interface IPlanSettings {
  save: number
  ret: number
  years: number
  expense: number
  swr: number
  infl: number
  age: string | number
}

/** FIRE 规划默认参数 */
export const DEFAULT_PLAN_SETTINGS: IPlanSettings = {
  save: 10000,
  ret: 5,
  years: 20,
  expense: 100000,
  swr: 4,
  infl: 2,
  age: '',
}

export interface IFinancialData {
  fiancial_data: IFinancialEntry[]
  items_of_long_term_use: ILongTermItem[]
  /** FIRE 规划参数，随数据一起导出 / 同步 */
  plan: IPlanSettings
}

export type SnapdomFn = (element: Element, options?: SnapdomOptions) => Promise<CaptureResult>

export interface IFinancialStore {
  data: Ref<IFinancialData>
  status: Ref<string>
  isOverDropZone: ShallowRef<boolean>
  isSupported: Ref<boolean>
  fileHandle: ShallowRef<FileSystemFileHandle | null>
  dropZoneRef: Ref<HTMLElement | undefined>
  openFile: () => void
  saveFile: () => Promise<void>
  saveAsFile: () => Promise<void>
  loadExample: () => void
  clearData: () => void
  applyData: (json: IFinancialData) => void
}

export const financialStoreKey: InjectionKey<IFinancialStore> = Symbol('financial-store')
export const snapdomKey: InjectionKey<SnapdomFn> = Symbol('snapdom')
