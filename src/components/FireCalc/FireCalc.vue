<script setup lang="ts">
import { inject, nextTick, provide, ref } from 'vue'
import FinancialPanel from './FinancialPanel.vue'
import GistDialog from './GistDialog.vue'
import ItemsPanel from './ItemsPanel.vue'
import PlanPanel from './PlanPanel.vue'
import { financialStoreKey, snapdomKey } from './types'
import { useFinancialData } from './useFinancialData'

const store = useFinancialData()
provide(financialStoreKey, store)

const { dropZoneRef, isOverDropZone, isSupported, fileHandle, status } = store

const snapdomFn = inject(snapdomKey)

const tabs = [
  { key: 'fin', label: '资产' },
  { key: 'plan', label: 'FIRE 规划' },
  { key: 'items', label: '物品' },
]
const activeTab = ref('fin')
const isCapturing = ref(false)
const gistOpen = ref(false)

function switchTab(key: string) {
  activeTab.value = key
  nextTick(() => {
    window.dispatchEvent(new Event('resize'))
  })
}

async function saveImage() {
  if (!snapdomFn || !dropZoneRef.value)
    return
  isCapturing.value = true
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 100))
  const result = await snapdomFn(dropZoneRef.value, { scale: 2 })
  await nextTick()
  isCapturing.value = false
  await result.download({ format: 'jpg', filename: `fire-calc-${Date.now()}` })
}

function loadExampleData() {
  if (window.confirm('确定加载完整示例数据？当前数据将被覆盖。'))
    store.loadExample()
}

function clearData() {
  if (window.confirm('确定清空所有数据？该操作不可撤销。'))
    store.clearData()
}
</script>

<template>
  <div ref="dropZoneRef" class="fire-calc" :class="{ 'is-capturing': isCapturing, 'is-dragging': isOverDropZone }">
    <h1>FIRE Calculator</h1>

    <div class="toolbar">
      <button class="a-button" @click="store.openFile">打开 JSON</button>
      <button v-if="isSupported && fileHandle" class="a-button" @click="store.saveFile">保存</button>
      <button class="a-button" @click="store.saveAsFile">另存为新 JSON</button>
      <button class="a-button" @click="gistOpen = true">Gist</button>
      <span class="status">{{ status }}</span>
      <button class="a-button toolbar-end" @click="loadExampleData">示例</button>
      <button class="a-button" @click="clearData">清空</button>
      <button class="a-button" @click="saveImage">保存图片</button>
    </div>

    <div class="tabs">
      <button v-for="t in tabs" :key="t.key" :class="{ active: activeTab === t.key }" @click="switchTab(t.key)">
        {{ t.label }}
      </button>
    </div>

    <div v-if="isOverDropZone" class="drop-hint">松开以加载 JSON 文件</div>

    <FinancialPanel v-show="activeTab === 'fin'" />
    <ItemsPanel v-show="activeTab === 'items'" />
    <PlanPanel v-show="activeTab === 'plan'" />

    <GistDialog v-model:open="gistOpen" />
  </div>
</template>

<style lang="scss">
.fire-calc {
  --ink: #222;
  --muted: #8a8a8a;
  --line: #e5e5e5;
  color: var(--ink);
  background: #fff;
  padding: 24px 32px;
  min-height: 100vh;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;

  * {
    box-sizing: border-box;
  }

  h1 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 16px;
    letter-spacing: 0.02em;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;

    .status {
      font-size: 12px;
      color: var(--muted);
    }

    // 示例 / 清空 / 保存图片 靠右显示
    .toolbar-end {
      margin-left: auto;
    }
  }

  .a-button {
    padding: 4px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    cursor: pointer;
    background: #fff;
    font: inherit;
    font-size: 13px;
    color: var(--ink);

    &:hover {
      background: #f5f5f5;
    }
  }

  .tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 24px;

    button {
      appearance: none;
      border: 1px solid transparent;
      border-bottom: none;
      background: none;
      font: inherit;
      font-size: 13px;
      color: var(--muted);
      padding: 8px 16px;
      cursor: pointer;
      border-radius: 6px 6px 0 0;

      &.active {
        color: var(--ink);
        border-color: var(--line);
        border-bottom-color: #fff;
        margin-bottom: -1px;
      }
    }
  }

  .drop-hint {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(80, 112, 221, 0.08);
    border: 2px dashed #5070dd;
    font-size: 18px;
    color: #5070dd;
    z-index: 50;
    pointer-events: none;
  }

  .split {
    display: flex;
    gap: 24px;
    align-items: flex-start;

    >div {
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    >div:last-child {
      position: sticky;
      top: 16px;
      align-self: flex-start;
    }
  }

  @media (max-width: 900px) {
    padding: 12px 12px 24px;

    h1 {
      font-size: 17px;
      margin-bottom: 12px;
    }

    .toolbar {
      gap: 6px;
      margin-bottom: 12px;
    }

    .tabs {
      margin-bottom: 16px;

      button {
        padding: 8px 12px;
      }
    }

    .card-title {
      padding: 8px 10px;
    }

    .split {
      flex-direction: column;
      gap: 16px;
      align-items: stretch;

      >div:last-child {
        position: static;
        align-self: stretch;
      }
    }

    // 表格不限制宽度，超出容器时可左右滚动
    .table-scroll {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    table {
      width: max-content;
      min-width: 100%;
    }

    // 列不被压塌：给单元格一个最小宽度并禁止换行，超出容器时左右滚动
    th,
    td {
      min-width: 72px;
      padding: 6px 10px;
      white-space: nowrap;
    }

    // 备注允许换行并限宽，避免长文本把表格撑得过宽
    .remark {
      min-width: 120px;
      max-width: 200px;
      white-space: pre-line;
    }
  }

  .card {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
  }

  .card-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    letter-spacing: 0.05em;
  }

  .badge {
    display: inline-block;
    font-size: 10px;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 1px 8px;
    margin-left: 8px;
  }

  .chart {
    height: 320px;
  }

  .chart-tall {
    height: 380px;
  }

  .table-scroll {
    overflow: auto;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 12.5px;
  }

  th {
    text-align: left;
    font-weight: 600;
    color: var(--muted);
    font-size: 11px;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--line);
    padding: 8px 14px;
    white-space: nowrap;
  }

  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #fff;
  }

  td {
    padding: 7px 14px;
    border-bottom: 1px solid #f1f1f1;
    vertical-align: top;
  }

  tr:last-child td {
    border-bottom: none;
  }

  .num {
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }

  .num.neg {
    color: #c0392b;
  }

  tr.clickable {
    cursor: pointer;
  }

  tr.clickable .chevron {
    display: inline-block;
    color: var(--muted);
    margin-right: 6px;
    font-size: 14px;
    transition: transform 0.15s;
  }

  tr.clickable.open .chevron {
    transform: rotate(90deg);
  }

  tr.row-highlight>td {
    animation: rowFlash 2.2s ease-out;
  }

  @keyframes rowFlash {
    0% {
      background-color: #fff3cd;
    }

    100% {
      background-color: transparent;
    }
  }

  tr.detail-row td {
    background: #fafafa;
    padding: 6px 10px;
  }

  tr.detail-row .inner {
    padding: 2px 14px 14px 34px;
  }

  .sub-table {
    width: 100%;
    font-size: 12px;
  }

  .sub-table th {
    font-size: 10.5px;
    padding: 6px 10px;
    background: #f4f4f4;
    border-radius: 4px;
  }

  .sub-table td {
    padding: 5px 10px;
    border-bottom: 1px solid #f4f4f4;
  }

  .sub-table tr.subtotal td {
    border-top: 1px solid var(--line);
    border-bottom: none;
    background: #fafafa;
    font-weight: 600;
  }

  .remark {
    color: #555;
    white-space: pre-line;
    word-break: break-word;
  }

  .empty {
    color: var(--muted);
    font-style: italic;
  }

  .tips {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.8;
    margin-top: 20px;
    padding: 14px;
    border-top: 1px solid var(--line);
    white-space: pre-line;
    word-break: break-word;
  }

  .plan-form {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pf-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;

    >span {
      color: var(--muted);
      font-weight: 600;
    }

    input,
    select {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 6px 10px;
      font: inherit;
      font-size: 13px;
      color: var(--ink);
      background: #fff;

      &:focus {
        outline: none;
        border-color: #999;
      }
    }

    small {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.5;
    }
  }

  .metric-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 14px;
  }

  .metric {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 12px;

    .m-label {
      font-size: 10.5px;
      color: var(--muted);
      letter-spacing: 0.04em;
    }

    .m-value {
      font-size: 16px;
      font-weight: 600;
      margin-top: 4px;
      font-variant-numeric: tabular-nums;
      word-break: break-all;
    }

    .m-sub {
      font-size: 11px;
      color: var(--muted);
      margin-top: 3px;
    }
  }

  &.is-capturing {
    .toolbar {
      display: none;
    }
  }
}
</style>
