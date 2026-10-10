<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { DEFAULT_GIST_FILENAME, pullGist, pushGist } from './gist'
import type { IFinancialData } from './types'
import { financialStoreKey } from './types'
import { useGistConfig } from './useGist'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>()

const store = inject(financialStoreKey)!
const { config, persist, clearConfig } = useGistConfig()

const showToken = ref(false)
const busy = ref(false)
const status = ref<{ type: 'success' | 'error' | 'info', text: string } | null>(null)

const gistUrl = computed(() =>
  config.value.gistId.trim()
    ? `https://gist.github.com/${config.value.gistId.trim()}`
    : 'https://gist.github.com',
)

function close() {
  if (busy.value)
    return
  persist()
  emit('update:open', false)
}

function normalizeConfig() {
  config.value.token = config.value.token.replace(/[^\x20-\x7E]/g, '').trim()
  config.value.gistId = config.value.gistId.trim()
  config.value.filename = config.value.filename.trim() || DEFAULT_GIST_FILENAME
}

async function onPull() {
  if (busy.value)
    return
  normalizeConfig()
  busy.value = true
  status.value = null
  try {
    const result = await pullGist(config.value)
    let json: unknown
    try {
      json = JSON.parse(result.content)
    }
    catch {
      throw new Error('Gist 内容不是有效的 JSON')
    }
    store.applyData(json as IFinancialData)
    // 拉取后与本地文件解绑，避免「保存」把 Gist 数据写回旧文件
    store.fileHandle.value = null
    config.value.gistId = result.gistId
    config.value.filename = result.filename
    persist()
    status.value = {
      type: 'success',
      text: `已拉取 Gist ${result.gistId.slice(0, 8)}… 并覆盖本地数据（${result.content.length} 字符）`,
    }
  }
  catch (e) {
    status.value = { type: 'error', text: `拉取失败：${(e as Error).message}` }
  }
  finally {
    busy.value = false
  }
}

async function onPush() {
  if (busy.value)
    return
  normalizeConfig()
  busy.value = true
  status.value = null
  try {
    const content = JSON.stringify(store.data.value, null, 2)
    const result = await pushGist(config.value, content)
    config.value.gistId = result.gistId
    persist()
    status.value = {
      type: 'success',
      text: result.created
        ? `已创建私有 Gist：${result.gistId}`
        : `已推送当前数据到 Gist ${result.gistId.slice(0, 8)}…`,
    }
  }
  catch (e) {
    status.value = { type: 'error', text: `推送失败：${(e as Error).message}` }
  }
  finally {
    busy.value = false
  }
}

function onClearConfig() {
  if (busy.value)
    return
  if (!window.confirm('确定清除已保存的配置？Token、Gist ID 和文件名都会被清空。'))
    return
  clearConfig()
  showToken.value = false
  status.value = { type: 'info', text: '已清除配置' }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open)
    close()
}

watch(() => props.open, (open) => {
  if (open)
    status.value = null
})

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="gist-overlay">
      <div class="gist-dialog" role="dialog" aria-modal="true" aria-label="GitHub Gist 同步">
        <div class="gist-head">
          <span>GitHub Gist 同步</span>
          <button class="g-btn" :disabled="busy" @click="close">✕</button>
        </div>

        <div class="gist-body">
          <label class="gist-field">
            <span>GitHub Token <em>仅需 gist 权限</em></span>
            <div class="gist-row">
              <input
                v-model="config.token"
                :type="showToken ? 'text' : 'password'"
                autocomplete="off"
                spellcheck="false"
                placeholder="ghp_xxxxxxxxxxxx"
              >
              <button class="g-btn" type="button" @click="showToken = !showToken">
                {{ showToken ? '隐藏' : '显示' }}
              </button>
            </div>
            <small>
              <a href="https://github.com/settings/tokens/new?scopes=gist" target="_blank" rel="noopener noreferrer">生成 Token →</a>
              只勾选 gist 权限即可
            </small>
          </label>

          <label class="gist-field">
            <span>Gist ID <em>留空则推送时新建</em></span>
            <input v-model="config.gistId" spellcheck="false" placeholder="例如 6f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c">
            <small>
              可在 <a :href="gistUrl" target="_blank" rel="noopener noreferrer">gist.github.com</a> 的 Gist 地址末尾找到
            </small>
          </label>

          <label class="gist-field">
            <span>文件名</span>
            <input v-model="config.filename" spellcheck="false" :placeholder="DEFAULT_GIST_FILENAME">
          </label>

          <p class="gist-warn">
            ⚠️ 配置（含 Token）会自动以明文保存在浏览器 localStorage 中，请仅在个人设备上使用；可随时点「清除配置」删除。
          </p>

          <div v-if="status" class="gist-status" :class="status.type">{{ status.text }}</div>
        </div>

        <div class="gist-foot">
          <button class="g-btn primary" :disabled="busy" @click="onPull">⬇ 拉取</button>
          <button class="g-btn primary" :disabled="busy" @click="onPush">⬆ 推送</button>
          <span v-if="busy" class="gist-busy">处理中…</span>
          <button class="g-btn gist-clear" :disabled="busy" @click="onClearConfig">清除配置</button>
          <button class="g-btn" :disabled="busy" @click="close">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.gist-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.35);
}

.gist-dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow: hidden;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.22);
  color: #222;
  font-size: 13px;
}

.gist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e5e5;
  font-weight: 600;
}

.gist-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  overflow: auto;
}

.gist-field {
  display: flex;
  flex-direction: column;
  gap: 5px;

  > span {
    font-size: 12px;
    font-weight: 600;
    color: #666;

    em {
      margin-left: 4px;
      font-style: normal;
      font-weight: 400;
      color: #999;
    }
  }

  input {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    background: #fff;
    color: #222;
    font: inherit;
    font-size: 13px;

    &:focus {
      outline: none;
      border-color: #999;
    }
  }

  small {
    font-size: 11px;
    line-height: 1.5;
    color: #8a8a8a;

    a {
      color: #0969da;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  }
}

.gist-row {
  display: flex;
  gap: 6px;
  align-items: stretch;

  input {
    flex: 1;
    min-width: 0;
  }
}

.gist-warn {
  margin: 0;
  padding: 6px 10px;
  border: 1px solid #eed888;
  border-radius: 6px;
  background: #fff8c5;
  color: #9a6700;
  font-size: 11px;
  line-height: 1.5;
}

.gist-status {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;

  &.success {
    background: #dafbe1;
    border: 1px solid #aceebb;
    color: #1a7f37;
  }

  &.error {
    background: #ffebe9;
    border: 1px solid #ffcecb;
    color: #cf222e;
  }

  &.info {
    background: #ddf4ff;
    border: 1px solid #b6e3ff;
    color: #0969da;
  }
}

.gist-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e5e5e5;
}

.gist-busy {
  font-size: 12px;
  color: #8a8a8a;
}

.gist-clear {
  margin-left: auto;
}

.g-btn {
  padding: 6px 14px;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  background: #fff;
  color: #222;
  font: inherit;
  font-size: 13px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #f5f5f5;
  }

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &.primary {
    border-color: #0969da;
    background: #0969da;
    color: #fff;

    &:hover:not(:disabled) {
      border-color: #0550ae;
      background: #0550ae;
    }
  }
}

@media (max-width: 900px) {
  .gist-dialog {
    max-height: 92vh;
  }

  .gist-body {
    padding: 12px;
  }
}
</style>
