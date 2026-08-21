<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { useStorage } from '@vueuse/core'
import * as echarts from 'echarts'
import { financialStoreKey } from './types'
import {
  calcFIRE,
  esc,
  fmtDate,
  fmtNum,
  fmtYearsMonths,
  mkDate,
  monthKey,
  parseDate,
  simulate,
  simulateLifecycle,
  trendForecast,
} from './utils'

type Chart = ReturnType<typeof echarts.init>

const store = inject(financialStoreKey)!
const { data } = store

const forecastRef = ref<HTMLDivElement>()
const fireRef = ref<HTMLDivElement>()

let fcChart: Chart | undefined
let fireChart: Chart | undefined

const form = useStorage(
  'fire_calc_plan_form',
  {
    save: 10000,
    ret: 5,
    years: 20,
    expense: 100000,
    swr: 4,
    infl: 2,
    age: '' as string | number,
  },
  localStorage,
  { listenToStorageChanges: false },
)

const saveHint = ref('')
const metrics = ref<{ label: string, value: string, sub?: string }[]>([])
const milestones = ref<{ label: string, date: string }[]>([])

function update() {
  if (!fcChart || !fireChart)
    return
  const fin = data.value.fiancial_data
  if (!fin.length)
    return

  const lastEntry = fin[fin.length - 1]
  const lastDate = lastEntry.date
  const lastVal = lastEntry.net_assets
  const baseMK = monthKey(parseDate(lastDate))
  const finDates = fin.map(e => e.date)
  const finVals = fin.map(e => e.net_assets)
  const nulls = new Array(fin.length).fill(null)

  const monthlySave = Number(form.value.save) || 0
  const ret = Number(form.value.ret) || 0
  const years = Number(form.value.years) || 20
  const expense = Number(form.value.expense) || 0
  const swr = Number(form.value.swr) || 4
  const infl = Number(form.value.infl) || 0
  const age = Number(form.value.age) || null
  const horizon = Math.max(1, Math.round(years * 12))

  const last12 = fin.slice(-12)
  const span = monthKey(parseDate(lastDate)) - monthKey(parseDate(last12[0].date))
  const avgMonthly = span > 0 ? (lastVal - last12[0].net_assets) / span : 0
  saveHint.value = `参考：近 ${last12.length} 条记录月均净增约 ${avgMonthly.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 元/月（含投资收益）`

  const monthLabels = (startMK: number, months: number) => {
    const arr: string[] = []
    for (let i = 1; i <= months; i++)
      arr.push(fmtDate(mkDate(startMK + i)))
    return arr
  }

  const fmtTip = (params: unknown) => {
    const arr = Array.isArray(params) ? params : [params]
    const first = arr[0]
    const date = first?.axisValue ?? first?.name ?? ''
    let html = age
      ? `<div style="font-size:11px">${esc(date)} · 年龄 ${Math.floor(age + (monthKey(parseDate(date)) - baseMK) / 12)} 岁</div>`
      : `<div style="font-size:11px">${esc(date)}</div>`
    arr.forEach((p) => {
      if (p.value == null)
        return
      const color = p.color || '#999'
      html += `<div style="margin-top:2px;font-size:11px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:5px"></span>${esc(p.seriesName)}：${Number(p.value).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}</div>`
    })
    return html
  }

  const fDates = monthLabels(baseMK, horizon)
  const xData = finDates.concat(fDates)
  const pad = (vals: number[]) => nulls.concat(vals)

  const cons = simulate(lastVal, monthlySave, ret - 2, horizon)
  const neut = simulate(lastVal, monthlySave, ret, horizon)
  const aggr = simulate(lastVal, monthlySave, ret + 2, horizon)
  const trend = trendForecast(fin, horizon, baseMK)
  const trendVals = trend.map(p => p.val)

  const fire = calcFIRE(expense, swr, monthlySave, ret, lastVal)
  const fireHorizon = Math.min(600, Math.max(horizon, fire.months > 0 ? fire.months + 24 : horizon))
  const fFireDates = monthLabels(baseMK, fireHorizon)
  const xFire = finDates.concat(fFireDates)
  const lifecycle = (expense > 0 && fire.months > 0)
    ? simulateLifecycle(lastVal, monthlySave, ret, expense, infl, fire.months, fireHorizon)
    : simulate(lastVal, monthlySave, ret, fireHorizon)

  const series: any[] = [
    { name: '历史净值', type: 'line', data: finVals, smooth: true, showSymbol: true, symbolSize: 5, lineStyle: { width: 1.6, color: '#333' }, itemStyle: { color: '#333' }, z: 4 },
    { name: '趋势外推', type: 'line', data: pad(trendVals), showSymbol: false, lineStyle: { width: 1, type: 'dashed', color: '#bbb' }, itemStyle: { color: '#bbb' } },
    { name: '保守情景', type: 'line', data: pad(cons), showSymbol: false, lineStyle: { width: 1.2, color: '#95a5a6' }, itemStyle: { color: '#95a5a6' } },
    { name: '中性情景', type: 'line', data: pad(neut), showSymbol: false, lineStyle: { width: 1.8, color: '#2980b9' }, itemStyle: { color: '#2980b9' }, z: 3 },
    { name: '激进情景', type: 'line', data: pad(aggr), showSymbol: false, lineStyle: { width: 1.2, color: '#27ae60' }, itemStyle: { color: '#27ae60' } },
  ]
  if (expense > 0) {
    series.push({
      name: 'FIRE目标',
      type: 'line',
      data: [],
      lineStyle: { color: '#c0392b' },
      itemStyle: { color: '#c0392b' },
      markLine: {
        symbol: 'none',
        data: [{ yAxis: fire.target }],
        lineStyle: { color: '#c0392b', width: 1.4, type: 'dashed' },
        label: { formatter: 'FIRE 目标', fontSize: 10, color: '#c0392b', position: 'insideEndTop' },
      },
    })
  }
  fcChart.setOption({
    tooltip: { trigger: 'axis', formatter: fmtTip },
    legend: { top: 0, type: 'scroll', textStyle: { fontSize: 10, color: '#999' } },
    grid: { left: 70, right: 20, top: 36, bottom: 46 },
    dataZoom: [{ type: 'inside' }],
    xAxis: {
      type: 'category',
      data: xData,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisLabel: { fontSize: 10, color: '#999', interval: Math.max(1, Math.ceil(xData.length / 10)) },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { fontSize: 10, color: '#999' },
      splitLine: { lineStyle: { color: '#eee' } },
    },
    series,
  }, true)

  const fireSeries: any[] = [
    { name: '历史净值', type: 'line', data: finVals, showSymbol: true, symbolSize: 4, lineStyle: { width: 1.2, color: '#aaa' }, itemStyle: { color: '#aaa' } },
  ]
  if (expense > 0 && fire.months > 0) {
    const acc: number[] = []
    const wd: number[] = []
    lifecycle.forEach((v, i) => {
      (i < fire.months ? acc : wd).push(v)
    })
    fireSeries.push(
      { name: '累积阶段', type: 'line', data: nulls.concat(acc), showSymbol: false, lineStyle: { width: 1.8, color: '#2980b9' }, itemStyle: { color: '#2980b9' }, z: 3 },
      { name: 'FI 后资产余额', type: 'line', data: nulls.concat(new Array(fire.months).fill(null), wd), showSymbol: false, lineStyle: { width: 1.8, color: '#16a085' }, itemStyle: { color: '#16a085' }, z: 3 },
    )
    fireSeries.push({
      name: 'FIRE目标',
      type: 'line',
      data: [],
      lineStyle: { color: '#c0392b' },
      itemStyle: { color: '#c0392b' },
      markLine: {
        symbol: 'none',
        lineStyle: { color: '#c0392b', width: 1.2, type: 'dashed' },
        label: { fontSize: 10, color: '#c0392b' },
        data: [
          { yAxis: fire.target, label: { formatter: 'FIRE 目标', position: 'insideEndTop' } },
          { xAxis: fmtDate(mkDate(baseMK + fire.months)), lineStyle: { color: '#c0392b', width: 1.2, type: 'dashed' }, label: { formatter: 'FI 日期', position: 'insideEndTop', color: '#c0392b' } },
        ],
      },
    })
    fireSeries.push({
      name: 'FI点',
      type: 'line',
      data: [],
      itemStyle: { color: '#c0392b' },
      markPoint: {
        symbol: 'pin',
        symbolSize: 42,
        itemStyle: { color: '#c0392b' },
        label: { color: '#fff', fontSize: 9, formatter: 'FI' },
        data: [{ name: 'FI', coord: [fmtDate(mkDate(baseMK + fire.months)), lifecycle[fire.months - 1]] }],
      },
    })
  }
  else if (expense > 0) {
    fireSeries.push(
      { name: '累积阶段', type: 'line', data: nulls.concat(lifecycle), showSymbol: false, lineStyle: { width: 1.8, color: '#2980b9' }, itemStyle: { color: '#2980b9' }, z: 3 },
      {
        name: 'FIRE目标',
        type: 'line',
        data: [],
        lineStyle: { color: '#c0392b' },
        itemStyle: { color: '#c0392b' },
        markLine: {
          symbol: 'none',
          data: [{ yAxis: fire.target }],
          lineStyle: { color: '#c0392b', width: 1.4, type: 'dashed' },
          label: { formatter: 'FIRE 目标', fontSize: 10, color: '#c0392b', position: 'insideEndTop' },
        },
      },
    )
  }
  else {
    fireSeries.push({ name: '中性情景', type: 'line', data: nulls.concat(lifecycle), showSymbol: false, lineStyle: { width: 1.8, color: '#2980b9' }, itemStyle: { color: '#2980b9' }, z: 3 })
  }
  fireChart.setOption({
    tooltip: { trigger: 'axis', formatter: fmtTip },
    legend: { top: 0, type: 'scroll', textStyle: { fontSize: 10, color: '#999' } },
    grid: { left: 70, right: 20, top: 36, bottom: 46 },
    dataZoom: [{ type: 'inside' }],
    xAxis: {
      type: 'category',
      data: xFire,
      boundaryGap: false,
      axisLine: { lineStyle: { color: '#ddd' } },
      axisLabel: { fontSize: 10, color: '#999', interval: Math.max(1, Math.ceil(xFire.length / 10)) },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { fontSize: 10, color: '#999' },
      splitLine: { lineStyle: { color: '#eee' } },
    },
    series: fireSeries,
  }, true)

  const m: { label: string, value: string, sub?: string }[] = []
  m.push({ label: '当前净资产', value: fmtNum(lastVal, 0), sub: lastDate })
  m.push({
    label: 'FIRE 目标金额',
    value: expense > 0 ? fmtNum(fire.target, 0) : '—',
    sub: expense > 0 ? `年支出 ${fmtNum(expense, 0)} ÷ SWR ${swr}%` : '请填写年支出以计算',
  })
  if (expense > 0) {
    if (fire.months > 0) {
      const fiDate = fmtDate(mkDate(baseMK + fire.months))
      m.push({ label: '预计 FI 日期', value: esc(fiDate), sub: `距 FI 还有 ${fmtYearsMonths(fire.months)}` })
      m.push({ label: 'FI 后每年提现', value: fmtNum(expense, 0), sub: `每月 ${fmtNum(expense / 12, 0)}，按通胀 ${infl}% 逐年上调` })
      if (age)
        m.push({ label: 'FI 时年龄', value: `${age + Math.floor(fire.months / 12)} 岁`, sub: `当前 ${age} 岁` })
      const endVal = lifecycle[fireHorizon - 1]
      const fiVal = lifecycle[fire.months - 1]
      const trendText = endVal >= fiVal
        ? '提现后仍增长（可持续）'
        : endVal >= fire.target * 0.9
          ? '提现后小幅下降（注意）'
          : '提现后明显下降（警惕）'
      m.push({ label: 'FI 后趋势', value: esc(trendText), sub: `提现期末资产 ${fmtNum(endVal, 0)}` })
    }
    else {
      m.push({ label: '预计 FI 日期', value: '50 年内未达成', sub: '请提高月储蓄或降低年支出' })
    }
  }
  metrics.value = m

  const targets = [
    { label: '150 万', val: 1500000 },
    { label: '200 万', val: 2000000 },
    { label: '300 万', val: 3000000 },
  ]
  milestones.value = targets.map((t) => {
    const idx = neut.findIndex(v => v >= t.val)
    return { label: t.label, date: idx >= 0 ? fDates[idx] : '—' }
  })
}

function handleResize() {
  fcChart?.resize()
  fireChart?.resize()
}

onMounted(() => {
  fcChart = echarts.init(forecastRef.value!)
  fireChart = echarts.init(fireRef.value!)
  update()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  fcChart?.dispose()
  fireChart?.dispose()
})

watch([form, data], update, { deep: true })
</script>

<template>
  <section class="plan-panel">
    <div class="split">
      <div class="col">
        <div class="card">
          <div class="card-title">参数设置<span class="badge">调整即重绘</span></div>
          <div class="plan-form">
            <label class="pf-row">
              <span>月储蓄（元）</span>
              <input v-model.number="form.save" type="number" min="0" step="500">
              <small>{{ saveHint }}</small>
            </label>
            <label class="pf-row">
              <span>年化收益率（%）</span>
              <input v-model.number="form.ret" type="number" min="0" max="30" step="0.5">
              <small>情景：保守 = 输入 − 2%，激进 = 输入 + 2%</small>
            </label>
            <label class="pf-row">
              <span>预测年限（年）</span>
              <select v-model.number="form.years">
                <option :value="5">5 年</option>
                <option :value="10">10 年</option>
                <option :value="20">20 年</option>
                <option :value="30">30 年</option>
                <option :value="40">40 年</option>
                <option :value="50">50 年</option>
                <option :value="60">60 年</option>
              </select>
            </label>
            <label class="pf-row">
              <span>年支出（元）</span>
              <input v-model.number="form.expense" type="number" min="0" step="1000">
              <small>用于计算 FIRE 目标（请改为实际值）</small>
            </label>
            <label class="pf-row">
              <span>安全提现率 SWR（%）</span>
              <input v-model.number="form.swr" type="number" min="0" max="10" step="0.1">
              <small>FIRE 目标 = 年支出 ÷ SWR，4% 为经典规则</small>
            </label>
            <label class="pf-row">
              <span>年通胀率（%）</span>
              <input v-model.number="form.infl" type="number" min="0" max="15" step="0.5">
              <small>FI 后年支出按通胀逐年上调</small>
            </label>
            <label class="pf-row">
              <span>当前年龄（可选）</span>
              <input v-model.number="form.age" type="number" min="0" max="99" step="1" placeholder="—">
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-title">FIRE 关键指标</div>
          <div class="metric-grid">
            <div v-for="m in metrics" :key="m.label" class="metric">
              <div class="m-label">{{ m.label }}</div>
              <div class="m-value">{{ m.value }}</div>
              <div v-if="m.sub" class="m-sub">{{ m.sub }}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">里程碑到达时间（中性情景）</div>
          <table>
            <thead>
              <tr>
                <th>目标</th>
                <th class="num">中性情景到达日期</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="ms in milestones" :key="ms.label">
                <td>{{ ms.label }}</td>
                <td class="num">{{ ms.date }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="col">
        <div class="card">
          <div class="card-title">资产预测（历史 + 趋势外推 + 多情景）</div>
          <div ref="forecastRef" class="chart chart-tall" />
        </div>
        <div class="card">
          <div class="card-title">FIRE 规划（累积 → FI → 提现后余额）</div>
          <div ref="fireRef" class="chart chart-tall" />
        </div>
      </div>
    </div>

    <div class="split">
      <div class="col">
        <div class="tips">FIRE —— Financial Independence, Retire Early（财务独立、提前退休）。核心目标：积累足够资产，使被动收入能覆盖日常支出。

          FIRE 目标金额 = 年支出 ÷ SWR。例如年支出 12 万、SWR 4% → 目标 300 万。

          SWR（安全提现率）—— 退休后每年可从资产中安全提取的比例。经典「4% 规则」指按 4% 提现并随通胀调整。

          累积阶段（蓝线）—— FI 之前每月存入「月储蓄」，资产按年化收益率按月复利增长。</div>
      </div>
      <div class="col">
        <div class="tips">FI 后资产余额（绿线）—— 达到 FI 后停止储蓄，改为每年提取「年支出」（图中按月提取），年支出按通胀逐年上调。绿线高于蓝线末端则可持续；向下倾斜甚至归零则资产在减少。

          保守 / 中性 / 激进 —— 以年化收益率为中性的三档模拟：保守 = 输入 − 2%，激进 = 输入 + 2%。

          趋势外推（灰虚线）—— 对最近 12 条净资产记录做线性回归，按历史平均增速向前延伸。</div>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.plan-panel {
  .col {
    min-width: 0;
  }
}
</style>
