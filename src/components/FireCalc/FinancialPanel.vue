<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { IFinancialEntry } from './types'
import { financialStoreKey } from './types'
import { fmtNum, subtotal } from './utils'

type Chart = ReturnType<typeof echarts.init>

const store = inject(financialStoreKey)!
const { data } = store

const lineRef = ref<HTMLDivElement>()
const barRef = ref<HTMLDivElement>()
const pieRef = ref<HTMLDivElement>()

let lineChart: Chart | undefined
let barChart: Chart | undefined
let pieChart: Chart | undefined

const expanded = ref<Set<string>>(new Set())
const pieVisible = ref(false)
const pieTitle = ref('资产构成')
const currentPieDate = ref<string | null>(null)
const flashDate = ref('')

function toggle(date: string) {
  const s = new Set(expanded.value)
  if (s.has(date))
    s.delete(date)
  else
    s.add(date)
  expanded.value = s
}

async function flashRow(date: string) {
  toggle(date)
  flashDate.value = ''
  await nextTick()
  flashDate.value = date
}

interface IRow {
  entry: IFinancialEntry
  qoq: { delta: number, rate: number } | null
  detailSubtotal: number
}

const rows = computed<IRow[]>(() => {
  const fin = data.value.fiancial_data
  return fin.map((entry, idx) => {
    let qoq: IRow['qoq'] = null
    if (idx > 0) {
      const prev = fin[idx - 1]
      const delta = entry.net_assets - prev.net_assets
      qoq = { delta, rate: (delta / prev.net_assets) * 100 }
    }
    return {
      entry,
      qoq,
      detailSubtotal: entry.detailed_data ? subtotal(entry.detailed_data) : 0,
    }
  })
})

interface IEntryDraft {
  date: string
  net_assets: string
  remark: string
  detailed_data: IDetailDraft[]
}

interface IDetailDraft {
  type: string
  net_assets: string
  not_included: boolean
  remark: string
}

const editMode = ref(false)
const draft = ref<IEntryDraft[]>([])
const editExpanded = ref<Set<number>>(new Set())

function parseNum(s: string): number {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

function isInvalidDate(s: unknown): boolean {
  const v = String(s ?? '').trim()
  return v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)
}

function isInvalidNum(s: unknown): boolean {
  const v = String(s ?? '').trim()
  return v !== '' && !Number.isFinite(Number(v))
}

function toggleEdit(idx: number) {
  const s = new Set(editExpanded.value)
  if (s.has(idx))
    s.delete(idx)
  else
    s.add(idx)
  editExpanded.value = s
}

function enterEdit() {
  draft.value = data.value.fiancial_data.map(e => ({
    date: e.date,
    net_assets: String(e.net_assets ?? ''),
    remark: e.remark ?? '',
    detailed_data: (e.detailed_data ?? []).map(d => ({
      type: d.type,
      net_assets: String(d.net_assets ?? ''),
      not_included: d.not_included ?? false,
      remark: d.remark ?? '',
    })),
  }))
  editExpanded.value = new Set()
  editMode.value = true
}

function cancelEdit() {
  editMode.value = false
  draft.value = []
  editExpanded.value = new Set()
}

function saveEdit() {
  data.value.fiancial_data = draft.value
    .filter(e => e.date.trim() !== '' && !isInvalidDate(e.date))
    .map(e => ({
      date: e.date.trim(),
      net_assets: parseNum(e.net_assets),
      remark: e.remark,
      detailed_data: (e.detailed_data ?? [])
        .filter(d => d.type.trim() !== '')
        .map(d => ({
          type: d.type.trim(),
          net_assets: parseNum(d.net_assets),
          not_included: d.not_included,
          remark: d.remark,
        })),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
  editMode.value = false
  editExpanded.value = new Set()
}

function addEntry() {
  draft.value.push({
    date: '',
    net_assets: '',
    remark: '',
    detailed_data: [],
  })
}

function removeEntry(idx: number) {
  draft.value.splice(idx, 1)
  editExpanded.value = new Set()
}

function addDetail(entry: IEntryDraft) {
  entry.detailed_data.push({
    type: '',
    net_assets: '',
    not_included: false,
    remark: '',
  })
}

function removeDetail(entry: IEntryDraft, idx: number) {
  entry.detailed_data.splice(idx, 1)
}

function updateCharts() {
  const fin = data.value.fiancial_data
  if (!lineChart || !barChart)
    return

  lineChart.setOption({
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number) => v.toLocaleString('zh-CN', { maximumFractionDigits: 2 }),
    },
    grid: { left: 60, right: 20, top: 24, bottom: 72 },
    dataZoom: [
      { type: 'inside' },
      { type: 'slider', height: 18, bottom: 10, borderColor: '#e5e5e5' },
    ],
    xAxis: {
      type: 'category',
      data: fin.map(e => e.date),
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisLabel: { fontSize: 10, color: '#999', interval: 2 },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { fontSize: 10, color: '#999' },
      splitLine: { lineStyle: { color: '#eee' } },
    },
    series: [{
      type: 'line',
      data: fin.map(e => e.net_assets),
      smooth: true,
      showSymbol: true,
      lineStyle: { width: 1.6, color: '#333' },
      itemStyle: { color: '#333' },
      areaStyle: { color: 'rgba(51,51,51,0.06)' },
    }],
  })

  const detailedDates: string[] = []
  const typeMap: Record<string, Record<string, number>> = {}
  fin.forEach((e) => {
    if (e.detailed_data?.length) {
      detailedDates.push(e.date)
      e.detailed_data.forEach((d) => {
        ; (typeMap[d.type] ??= {})[e.date] = d.net_assets
      })
    }
  })

  const typeSeries = Object.entries(typeMap).map(([name, vals]) => ({
    name,
    type: 'bar' as const,
    stack: 't',
    data: detailedDates.map(d => vals[d]),
  }))

  barChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { top: 0, type: 'scroll', height: 40, textStyle: { fontSize: 10, color: '#999' } },
    grid: { left: 60, right: 20, top: 52, bottom: 72 },
    dataZoom: [
      { type: 'inside' },
      { type: 'slider', height: 18, bottom: 10, borderColor: '#e5e5e5' },
    ],
    xAxis: {
      type: 'category',
      data: detailedDates,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisLabel: { fontSize: 10, color: '#999' },
    },
    yAxis: {
      type: 'value',
      axisLabel: { fontSize: 10, color: '#999' },
      splitLine: { lineStyle: { color: '#eee' } },
    },
    series: typeSeries,
  })
}

function showPie(date: string) {
  const entry = data.value.fiancial_data.find(e => e.date === date)
  if (!entry?.detailed_data?.length || !pieChart)
    return
  pieChart.setOption({
    tooltip: {
      trigger: 'item',
      valueFormatter: (v: number) => v.toLocaleString('zh-CN', { maximumFractionDigits: 2 }),
      formatter: '{b}<br>{c} ({d}%)',
    },
    legend: { bottom: 0, textStyle: { fontSize: 10, color: '#999' } },
    series: [{
      type: 'pie',
      radius: ['30%', '62%'],
      center: ['50%', '44%'],
      data: entry.detailed_data.map(d => ({ name: d.type, value: d.net_assets })),
      label: { fontSize: 10, color: '#666' },
    }],
  })
  pieTitle.value = `资产构成（${date}）`
  currentPieDate.value = date
  pieVisible.value = true
  pieChart.resize()
}

function handleResize() {
  lineChart?.resize()
  barChart?.resize()
  pieChart?.resize()
}

onMounted(() => {
  lineChart = echarts.init(lineRef.value!)
  barChart = echarts.init(barRef.value!)
  pieChart = echarts.init(pieRef.value!)

  lineChart.on('click', (params) => {
    flashRow(String(params.name))
  })

  barChart.on('click', (params) => {
    showPie(String(params.name))
  })

  pieChart.on('click', () => {
    if (currentPieDate.value)
      flashRow(currentPieDate.value)
  })

  updateCharts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  lineChart?.dispose()
  barChart?.dispose()
  pieChart?.dispose()
})

watch(data, updateCharts, { deep: true })
</script>

<template>
  <section class="financial-panel">
    <div class="split">
      <div class="col">
        <div class="card">
          <div class="card-title">
            <span>净资产记录<span class="badge">{{ data.fiancial_data.length }} 条</span></span>
            <button v-if="!editMode" class="a-button edit-toggle" @click="enterEdit">编辑</button>
          </div>

          <div v-if="editMode" class="edit-block">
            <div class="edit-actions">
              <button class="a-button" @click="addEntry">＋ 新增记录</button>
              <span class="edit-hint">编辑中，图表将在保存后更新</span>
              <button class="a-button save" @click="saveEdit">保存</button>
              <button class="a-button" @click="cancelEdit">取消</button>
            </div>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>日期</th>
                    <th class="num">净资产</th>
                    <th>备注</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="(entry, i) in draft" :key="i">
                    <tr>
                      <td><input v-model="entry.date" type="date" class="edit-input"
                          :class="{ 'input-error': isInvalidDate(entry.date) }"></td>
                      <td class="num"><input v-model="entry.net_assets" type="number" min="0"
                          class="edit-input edit-input-num" :class="{ 'input-error': isInvalidNum(entry.net_assets) }">
                      </td>
                      <td><textarea v-model="entry.remark" rows="1" class="edit-input edit-textarea"
                          placeholder="备注"></textarea></td>
                      <td>
                        <button class="a-button" @click="toggleEdit(i)">明细 {{ editExpanded.has(i) ? '▾' : '▸'
                          }}</button>
                        <button class="a-button" @click="removeEntry(i)">删除</button>
                      </td>
                    </tr>
                    <tr v-if="editExpanded.has(i)" class="detail-edit-row">
                      <td colspan="4">
                        <div class="inner">
                          <table class="sub-table">
                            <thead>
                              <tr>
                                <th>类型</th>
                                <th class="num">净资产</th>
                                <th>不计入</th>
                                <th>备注</th>
                                <th>操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr v-for="(d, j) in entry.detailed_data" :key="j">
                                <td><input v-model="d.type" class="edit-input" placeholder="类型"></td>
                                <td class="num"><input v-model="d.net_assets" type="number" min="0"
                                    class="edit-input edit-input-num"
                                    :class="{ 'input-error': isInvalidNum(d.net_assets) }"></td>
                                <td><input v-model="d.not_included" type="checkbox"></td>
                                <td><textarea v-model="d.remark" rows="1" class="edit-input edit-textarea"
                                    placeholder="备注"></textarea></td>
                                <td><button class="a-button" @click="removeDetail(entry, j)">删除</button></td>
                              </tr>
                              <tr>
                                <td colspan="5"><button class="a-button" @click="addDetail(entry)">＋ 新增明细</button></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>

          <div v-else class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th class="num">净资产</th>
                  <th class="num">环比增长</th>
                  <th class="num">环比增长率</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in rows" :key="row.entry.date">
                  <tr
                    :class="{ clickable: row.entry.detailed_data?.length, 'row-highlight': flashDate === row.entry.date }"
                    @click="row.entry.detailed_data?.length && toggle(row.entry.date)">
                    <td>
                      <span v-if="row.entry.detailed_data?.length" class="chevron"
                        :class="{ open: expanded.has(row.entry.date) }">▸</span>
                      {{ row.entry.date }}
                    </td>
                    <td class="num">{{ fmtNum(row.entry.net_assets, 2) }}</td>
                    <td class="num" :class="{ neg: row.qoq && row.qoq.delta < 0 }">{{ row.qoq ? fmtNum(row.qoq.delta, 2)
                      : '—' }}</td>
                    <td class="num" :class="{ neg: row.qoq && row.qoq.delta < 0 }">{{ row.qoq ?
                      `${row.qoq.rate.toFixed(2)}%` : '—' }}</td>
                    <td class="remark">{{ row.entry.remark || '—' }}</td>
                  </tr>
                  <tr v-if="row.entry.detailed_data?.length && expanded.has(row.entry.date)" class="detail-row">
                    <td colspan="5">
                      <div class="inner">
                        <table class="sub-table">
                          <thead>
                            <tr>
                              <th>类型</th>
                              <th class="num">净资产</th>
                              <th>不计入</th>
                              <th>备注</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="d in row.entry.detailed_data" :key="d.type">
                              <td>{{ d.type }}</td>
                              <td class="num">{{ fmtNum(d.net_assets, 2) }}</td>
                              <td>{{ d.not_included ? '是' : '—' }}</td>
                              <td class="remark">{{ d.remark || '—' }}</td>
                            </tr>
                            <tr class="subtotal">
                              <td>小计</td>
                              <td class="num">{{ fmtNum(row.detailSubtotal, 2) }}</td>
                              <td colspan="2"></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="col">
        <div class="card">
          <div class="card-title">净资产走势</div>
          <div ref="lineRef" class="chart" />
        </div>
        <div class="card">
          <div class="card-title">资产分布（按类型，仅含明细日期）</div>
          <div ref="barRef" class="chart" />
        </div>
        <div v-show="pieVisible" class="card">
          <div class="card-title">{{ pieTitle }}</div>
          <div ref="pieRef" class="chart" />
        </div>
      </div>
    </div>

    <div class="tips">净资产(CNY)不包含保险、医保等无流动性的理财产品。

      同比：以上年同期为基期相比较。同比增长率＝（本期数－同期数）/同期数×100％。

      环比：与上一个相邻统计周期相比较，即第n月与第n－1月的比较。环比增长率＝（本期数－上期数）/上期数×100％。</div>
  </section>
</template>

<style lang="scss" scoped>
.financial-panel {
  .col {
    min-width: 0;
  }
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-toggle {
  margin-left: auto;
}

.edit-actions {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  background: #fff;

  .save {
    border-color: #5070dd;
    color: #5070dd;

    &:hover {
      background: #eef1ff;
    }
  }
}

.edit-hint {
  font-size: 11px;
  color: var(--muted);
  margin-left: auto;
}

.edit-input {
  border: 1px solid var(--line);
  border-radius: 4px;
  padding: 3px 8px;
  font: inherit;
  font-size: 12px;
  color: var(--ink);
  background: #fff;
  width: 100%;

  &:focus {
    outline: none;
    border-color: #999;
  }

  &.input-error {
    border-color: #c0392b;
    background: #fdf3f2;
  }
}

.edit-input-num {
  width: 120px;
  text-align: right;
}

.edit-textarea {
  display: block;
}

.detail-edit-row td {
  background: #fafafa;
}
</style>
