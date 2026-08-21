import { ref, shallowRef } from 'vue'
import { useDropZone, useFileDialog, useStorage, useSupported } from '@vueuse/core'
import { downloadJson } from '@/utils'
import type { IFinancialData, IFinancialStore } from './types'
import { generateExampleData } from './exampleData'

const STORAGE_KEY = 'fire_calc_financial_data'

type FSWindow = Window & {
  showOpenFilePicker: (options?: { types?: { description?: string, accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker: (options?: { suggestedName?: string, types?: { description?: string, accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>
}

const fsw = () => window as unknown as FSWindow

async function extractHandle(event: DragEvent): Promise<FileSystemFileHandle | null> {
  try {
    const item = event.dataTransfer?.items?.[0]
    const getHandle = item && typeof (item as unknown as { getAsFileSystemHandle?: unknown }).getAsFileSystemHandle === 'function'
      ? (item as unknown as { getAsFileSystemHandle: () => Promise<FileSystemHandle> }).getAsFileSystemHandle.bind(item)
      : null
    if (!getHandle)
      return null
    const handle = await getHandle()
    return handle?.kind === 'file' ? (handle as FileSystemFileHandle) : null
  }
  catch {
    return null
  }
}

export function useFinancialData(): IFinancialStore {
  const data = useStorage<IFinancialData>(STORAGE_KEY, generateExampleData, localStorage, {
    listenToStorageChanges: false,
  })
  const status = ref('')

  const isSupported = useSupported(() => 'showSaveFilePicker' in window && 'showOpenFilePicker' in window)

  const fileHandle = shallowRef<FileSystemFileHandle | null>(null)

  const dropZoneRef = ref<HTMLElement>()
  const { isOverDropZone } = useDropZone(dropZoneRef, async (files, event) => {
    const f = files?.[0]
    if (!f)
      return
    fileHandle.value = await extractHandle(event)
    await readFile(f)
  })

  const { open: openDialog, onChange } = useFileDialog({
    accept: 'application/json',
    multiple: false,
  })
  onChange((files) => {
    const f = files?.[0]
    if (!f)
      return
    fileHandle.value = null
    readFile(f)
  })

  function applyData(json: IFinancialData) {
    if (!json || !Array.isArray(json.fiancial_data) || !Array.isArray(json.items_of_long_term_use))
      throw new Error('无效的数据格式')
    data.value = json
  }

  async function readFile(f: File) {
    try {
      const text = await f.text()
      applyData(JSON.parse(text))
      status.value = `已加载 ${f.name}`
    }
    catch (e) {
      status.value = `加载失败：${(e as Error).message}`
    }
  }

  async function openFile() {
    if (!isSupported.value) {
      openDialog()
      return
    }
    try {
      const [handle] = await fsw().showOpenFilePicker({
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      })
      fileHandle.value = handle
      const f = await handle.getFile()
      const text = await f.text()
      applyData(JSON.parse(text))
      status.value = `已加载 ${f.name}`
    }
    catch (e) {
      status.value = (e as Error)?.name === 'AbortError' ? '' : `打开失败：${(e as Error).message}`
    }
  }

  async function saveFile() {
    if (!fileHandle.value) {
      await saveAsFile()
      return
    }
    try {
      const text = JSON.stringify(data.value, null, 2)
      const writable = await fileHandle.value.createWritable()
      await writable.write(text)
      await writable.close()
      status.value = '已保存'
    }
    catch (e) {
      status.value = `保存失败：${(e as Error).message}`
    }
  }

  async function saveAsFile() {
    const text = JSON.stringify(data.value, null, 2)
    if (!isSupported.value) {
      downloadJson(text, 'financial-data.json')
      status.value = '已下载新文件'
      return
    }
    try {
      const handle = await fsw().showSaveFilePicker({
        suggestedName: 'financial-data.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      })
      fileHandle.value = handle
      const writable = await handle.createWritable()
      await writable.write(text)
      await writable.close()
      status.value = '已保存为新文件'
    }
    catch {
      status.value = ''
    }
  }

  function loadExample() {
    data.value = generateExampleData()
    status.value = '已加载示例数据'
  }

  return {
    data,
    status,
    isOverDropZone,
    isSupported,
    fileHandle,
    dropZoneRef,
    openFile,
    saveFile,
    saveAsFile,
    loadExample,
  }
}
