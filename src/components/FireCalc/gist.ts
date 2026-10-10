export interface IGistConfig {
  token: string
  gistId: string
  filename: string
}

export const DEFAULT_GIST_FILENAME = 'financial-data.json'
export const GIST_CONFIG_STORAGE_KEY = 'fire_calc_gist_config'

const API = 'https://api.github.com'

const DEFAULT_HEADERS: Record<string, string> = {
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

/** 复制 Token 时常带上零宽字符、全角空格或换行，这里只保留 ASCII 可见字符 */
export function sanitizeToken(raw: string): string {
  return raw.replace(/[^\x20-\x7E]/g, '').trim()
}

interface IGistFile {
  filename?: string
  content?: string
  truncated?: boolean
}

interface IGistResponse {
  id: string
  html_url?: string
  files?: Record<string, IGistFile>
}

async function request<T>(url: string, token: string, options: { method?: string, body?: unknown } = {}): Promise<T> {
  const { method = 'GET', body } = options
  const headers: Record<string, string> = { ...DEFAULT_HEADERS }
  if (token)
    headers.Authorization = `Bearer ${token}`
  if (body !== undefined)
    headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }
  catch {
    throw new Error('网络请求失败，请检查网络或代理设置')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => null) as { message?: string } | null
    if (res.status === 401)
      throw new Error('Token 无效或已过期（401）')
    if (res.status === 404)
      throw new Error('Gist 不存在，或 Token 没有 gist 权限（404）')
    throw new Error(err?.message || `请求失败（HTTP ${res.status}）`)
  }

  return await res.json() as T
}

export interface IGistPullResult {
  gistId: string
  filename: string
  content: string
}

/** 按文件名读取 Gist；文件名不存在时回退到第一个文件 */
export async function pullGist(config: IGistConfig): Promise<IGistPullResult> {
  const gistId = config.gistId.trim()
  if (!gistId)
    throw new Error('请先填写 Gist ID')

  const gist = await request<IGistResponse>(`${API}/gists/${encodeURIComponent(gistId)}`, sanitizeToken(config.token))
  const files = gist.files ?? {}
  const wanted = config.filename.trim() || DEFAULT_GIST_FILENAME
  const file = files[wanted] ?? files[Object.keys(files)[0] ?? '']
  if (!file)
    throw new Error('该 Gist 中没有文件')
  if (file.truncated)
    throw new Error('文件过大，GitHub API 返回内容被截断，暂不支持导入')

  return {
    gistId: gist.id,
    filename: file.filename || wanted,
    content: file.content ?? '',
  }
}

export interface IGistPushResult {
  gistId: string
  htmlUrl?: string
  created: boolean
}

/** gistId 为空时新建私有 Gist，否则更新指定 Gist */
export async function pushGist(config: IGistConfig, content: string): Promise<IGistPushResult> {
  const token = sanitizeToken(config.token)
  if (!token)
    throw new Error('请先填写 GitHub Token')

  const filename = config.filename.trim() || DEFAULT_GIST_FILENAME
  const gistId = config.gistId.trim()

  if (gistId) {
    const gist = await request<IGistResponse>(`${API}/gists/${encodeURIComponent(gistId)}`, token, {
      method: 'PATCH',
      body: { files: { [filename]: { content } } },
    })
    return { gistId: gist.id, htmlUrl: gist.html_url, created: false }
  }

  const gist = await request<IGistResponse>(`${API}/gists`, token, {
    method: 'POST',
    body: {
      description: 'FIRE Calculator Data',
      public: false,
      files: { [filename]: { content } },
    },
  })
  return { gistId: gist.id, htmlUrl: gist.html_url, created: true }
}
