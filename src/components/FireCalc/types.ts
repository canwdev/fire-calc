import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { CaptureResult, SnapdomOptions } from '@zumer/snapdom'

export interface IDetailData {
  type: string
  date: string
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

export interface IFinancialData {
  fiancial_data: IFinancialEntry[]
  items_of_long_term_use: ILongTermItem[]
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
}

export const financialStoreKey: InjectionKey<IFinancialStore> = Symbol('financial-store')
export const snapdomKey: InjectionKey<SnapdomFn> = Symbol('snapdom')
