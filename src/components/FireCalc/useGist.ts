import { ref } from 'vue'
import { DEFAULT_GIST_FILENAME, GIST_CONFIG_STORAGE_KEY, type IGistConfig } from './gist'

function defaultConfig(): IGistConfig {
  return {
    token: '',
    gistId: '',
    filename: DEFAULT_GIST_FILENAME,
  }
}

// 模块级单例：弹窗关闭后配置仍留在内存里，同一会话内无需重新填写
const config = ref<IGistConfig>(defaultConfig())

let loaded = false

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(GIST_CONFIG_STORAGE_KEY)
    if (!raw)
      return
    const parsed = JSON.parse(raw) as Partial<IGistConfig>
    config.value = {
      token: typeof parsed.token === 'string' ? parsed.token : '',
      gistId: typeof parsed.gistId === 'string' ? parsed.gistId : '',
      filename: typeof parsed.filename === 'string' && parsed.filename.trim() ? parsed.filename : DEFAULT_GIST_FILENAME,
    }
  }
  catch {
    // 配置损坏时忽略，使用默认值
  }
}

/** 始终记住配置；删除只能走 clearConfig() */
function persist() {
  const { token, gistId, filename } = config.value
  try {
    // 没有任何有效配置时不写入，避免「清除配置」后又留下空记录
    if (!token && !gistId) {
      localStorage.removeItem(GIST_CONFIG_STORAGE_KEY)
      return
    }
    localStorage.setItem(GIST_CONFIG_STORAGE_KEY, JSON.stringify({ token, gistId, filename }))
  }
  catch {
    // localStorage 不可用时静默失败
  }
}

/** 显式清除：删除 localStorage 中的配置并重置表单 */
function clearConfig() {
  try {
    localStorage.removeItem(GIST_CONFIG_STORAGE_KEY)
  }
  catch {
    // 忽略
  }
  config.value = defaultConfig()
}

export function useGistConfig() {
  if (!loaded) {
    loaded = true
    loadFromStorage()
  }
  return { config, persist, clearConfig }
}
