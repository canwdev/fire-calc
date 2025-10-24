<script lang="ts" setup>
import { useStorage, watchDebounced } from '@vueuse/core'
import { snapdom } from '@zumer/snapdom'
import * as echarts from 'echarts'
import moment from 'moment/moment'
import {
  convertMonthsToYearsAndMonths,
  downloadJson,
  formatLabel,
  numberWithCommas,
  uploadJson,
} from '@/utils'

interface IFireCalcFormData {
  // 当前资产
  currentValue: number
  // 每月存入款
  monthlySave: number
  // 是否为目标存款模式
  isTargetMode: boolean
  // 迭代年数
  iterationYears: number
  // 目标存款
  targetValue: number
  // 年化利率
  annualInterestRate: number
  // 年终奖
  yearEndBonus: number
  // 年龄
  age: number
}

const echartsInstance = shallowRef()

const formData = useStorage<IFireCalcFormData>(
  'fire_calc_form_data',
  {
    currentValue: 1000,
    monthlySave: 3000,
    isTargetMode: false,
    iterationYears: 1,
    targetValue: 1000000,
    annualInterestRate: 0.025,
    yearEndBonus: 0,
    age: 0,
  },
  localStorage,
  { listenToStorageChanges: false },
)

const formItems = computed(() => {
  return [
    { label: '当前资产', key: 'currentValue', type: 'number', step: 1000 },
    { label: '月存入', key: 'monthlySave', type: 'number', step: 1000 },
    { label: '是否为目标存款模式', key: 'isTargetMode', type: 'checkbox' },
    formData.value.isTargetMode
      ? { label: '目标资产', key: 'targetValue', type: 'number', step: 1000 }
      : {
          label: '迭代年数',
          key: 'iterationYears',
          type: 'number',
          step: 1,
          min: 0,
        },
    {
      label: '年化利率',
      key: 'annualInterestRate',
      type: 'number',
      step: 0.01,
      tips: `${Number.parseFloat((formData.value.annualInterestRate * 100).toFixed(2))}%`,
    },
    {
      label: '年终奖',
      key: 'yearEndAwards',
      type: 'number',
      step: 1000,
    },
    {
      label: '当前年龄',
      key: 'age',
      type: 'number',
      min: 0,
    },
  ].filter(Boolean)
})

// 计算步骤数据
interface IStepData {
  label: string
  value: number
  monthCount: number
  age: number
  dateMoment?: moment.Moment
  isDecember?: boolean
}

const stepData = ref<IStepData[]>([])

const resultValue = ref(0)

function calculateData() {
  let result = Number(formData.value.currentValue)
  let age = Number(formData.value.age)
  stepData.value = []
  stepData.value.push({
    label: moment().format('YYYY-MM'),
    value: result,
    monthCount: 0,
    age: formData.value.age,
  })

  let iterationMonths = formData.value.iterationYears * 12
  if (formData.value.isTargetMode) {
    // iterationMonths = (formData.value.targetValue - formData.value.currentValue) / formData.value.monthlySave
    iterationMonths = +Infinity // 使用真实计算模式
  }
  for (let i = 0; i < iterationMonths; i++) {
    const count = i + 1

    // 防止死循环，最多迭代1000年
    if (count > 1200) {
      break
    }

    const dateMoment = moment().add(count, 'months')
    // 年底更新一次利息
    const isDecember = dateMoment.month() === 11 // 判断月份是否为12月，月份从0开始计数
    if (isDecember) {
      age += 1

      // 计算年利率
      result += Math.abs(result) * formData.value.annualInterestRate || 0
      if (formData.value.yearEndBonus) {
        result += formData.value.yearEndBonus
      }
    }
    result += formData.value.monthlySave || 0
    stepData.value.push({
      label: `${dateMoment.format('YYYY-MM')}`,
      value: result,
      dateMoment,
      isDecember,
      monthCount: count,
      age,
    })

    if (formData.value.isTargetMode && result >= formData.value.targetValue) {
      break
    }
  }
  resultValue.value = result
  updateChart()
}

watchDebounced(formData, calculateData, {
  debounce: 500,
  maxWait: 1000,
  deep: true,
  immediate: true,
})

function getPassiveIncome(value: number) {
  const piYearly = value * formData.value.annualInterestRate
  const piMonthly = piYearly / 12
  const piDaily = piMonthly / 30

  return {
    piYearly,
    piMonthly,
    piDaily,
  }
}

const resultItems = computed(() => {
  try {
    const result = resultValue.value || 0
    const resultMonths = stepData.value.length - 1
    const originalValue = formData.value.currentValue || 0
    const increasedValue = result - originalValue
    const increasedPercent = `${Number.parseFloat((((result - originalValue) / originalValue) * 100).toFixed(2))}%`
    const resultAge = stepData.value[stepData.value.length - 1]?.age

    const { piYearly, piMonthly, piDaily } = getPassiveIncome(result)

    return [
      {
        label: '结果资产',
        key: 'resultValue',
        value: `${numberWithCommas(result)}`,
        type: 'text',
      },
      {
        label: '结果时间',
        key: 'resultTimes',
        value: `${stepData.value[stepData.value.length - 1]?.dateMoment?.format('YYYY-MM-DD')} (${convertMonthsToYearsAndMonths(resultMonths)})`,
        tips: `${resultMonths}个月`,
        type: 'text',
      },
      { label: '目标年龄', key: 'resultAge', value: `${resultAge}`, type: 'text' },
      {
        label: '被动收入',
        key: 'yearPassiveIncome',
        value: `年收 ${numberWithCommas(piYearly)} · 月收 ${numberWithCommas(piMonthly)} · 日收 ${numberWithCommas(piDaily)}`,
        type: 'text',
      },
      {
        label: '增长值',
        key: 'increasedValue',
        value: `${numberWithCommas(increasedValue)}`,
        type: 'text',
      },
      { label: '增长率', key: 'increasedPercent', value: increasedPercent, type: 'text' },
    ].filter(Boolean)
  }
  catch (e) {
    console.error(e)
    return []
  }
})

function handleResize() {
  if (echartsInstance.value) {
    echartsInstance.value.resize()
  }
}

onMounted(() => {
  initCharts()
  updateChart()
  window.addEventListener('resize', handleResize)
})
onUnmounted(() => {
  echartsInstance.value && echartsInstance.value.dispose()
  window.removeEventListener('resize', handleResize)
})

const chartWrapper = ref<HTMLDivElement>()

function initCharts() {
  // 基于准备好的dom，初始化echarts实例
  const myChart = echarts.init(chartWrapper.value)
  // 绘制图表
  myChart.setOption({
    title: {
      text: '趋势图表',
      left: '16px',
      textStyle: {
        fontSize: 16,
      },
    },
    // legend: {
    //   top: '16px',
    // },
    tooltip: {
      trigger: 'axis',
      formatter(params) {
        const [p1] = params
        const d1 = p1 && stepData.value[p1.dataIndex]
        const {
          piYearly,
          piMonthly,
          piDaily,
        } = getPassiveIncome(d1.value)

        return `<div style="font-family: monospace">
${p1.marker}
<div>日期：${d1.label} (${convertMonthsToYearsAndMonths(d1.monthCount)})</div>
<div>资产：${numberWithCommas(d1.value)}</div>
<div>被动收入：年收 ${numberWithCommas(piYearly)} | 月收 ${numberWithCommas(piMonthly)} | 日收 ${numberWithCommas(piDaily)}</div>
<div>年龄：${d1.age}</div>
</div>`
      },
      axisPointer: {
        type: 'cross',
        label: {
          // backgroundColor: 'rgba(133,133,133,0.8)',
        },
      },
    },
    xAxis: {
      name: '日期',
      type: 'category',
      boundaryGap: false,
      data: [], // x轴数据
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
        },
      },
    },
    yAxis: {
      name: '资产',
      type: 'value',
      minInterval: 1,
      axisPointer: {
        snap: true,
      },
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed',
        },
      },
    },
    series: [
      {
        type: 'line',
        symbol: 'circle',
        symbolSize: 5,
        name: '资产',
        itemStyle: {
          color: '#5070DD',
        },
        smooth: true,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: 'rgba(80,112,221,0.4)',
            },
            {
              offset: 1,
              color: 'rgba(255,255,255,0)',
            },
          ]),
        },
        data: [],
      },
    ],
    grid: {
      left: '6%',
      right: '4%',
      bottom: '70px',
      containLabel: true,
    },
    dataZoom: [
      {
        type: 'inside',
        zoomOnMouseWheel: true, // 滚轮是否触发缩放
        moveOnMouseMove: false, // 鼠标滚轮触发滚动
        moveOnMouseWheel: false,
      },
      {
        type: 'slider', // 滑动条
      },
    ],
    toolbox: {
      // https://echarts.apache.org/en/option.html#toolbox.feature.restore
      feature: {
        dataZoom: {
          show: true,
        },
        dataView: {
          show: true,
        },
        saveAsImage: {
          show: true,
          pixelRatio: 2,
        },
      },
    },
  })

  echartsInstance.value = myChart
}

function updateChart() {
  if (!stepData.value.length) {
    return
  }
  // 刷新 Echarts 数据
  const list = stepData.value || []
  echartsInstance.value.setOption({
    xAxis: {
      data: list.map(i => i.label),
    },
    series: [
      {
        data: list.map(i => Number.parseFloat((i.value).toFixed(2))),
        markPoint: {
          data: [
            {
              type: 'max',
            },
            {
              type: 'min',
            },
          ],
        },
      },
    ],
  })
}

const filterData = useStorage(
  'fire_calc_form_filter',
  {
    // 间隔：6个月
    interval: 6,
  },
  localStorage,
  { listenToStorageChanges: false },
)
const filterFormItems = [
  {
    label: '间隔(月)',
    key: 'interval',
    type: 'number',
    min: 1,
    max: 12,
    step: 1,
  },
]
const filteredStepData = computed(() => {
  const f = stepData.value.filter((i, index) => index % filterData.value.interval === 0)
  if (!f.length) {
    return []
  }
  // 确保最后一项被添加
  if (f[f.length - 1]!.monthCount !== stepData.value[stepData.value.length - 1]!.monthCount) {
    f.push(stepData.value[stepData.value.length - 1]!)
  }
  return f
})

const rootElRef = ref<HTMLDivElement>()
const isCapturing = ref(false)
async function saveImage() {
  isCapturing.value = true
  await nextTick()
  handleResize()
  await new Promise(resolve => setTimeout(resolve, 100))
  const result = await snapdom(rootElRef.value, {
    scale: 2,
    // dpr: 3,
  })
  await nextTick()
  isCapturing.value = false
  await nextTick()
  handleResize()
  await result.download({ format: 'jpg', filename: `fire-calc-${moment().format('YYYY-MM-DD_hh-mm-ss')}` })
  // const img = await result.toPng()
  // document.body.appendChild(img)
}
</script>

<template>
  <div ref="rootElRef" class="fire-calc-wrapper " :class="{ 'is-capturing': isCapturing }">
    <div class="fire-calc-container">
      <h1>Fire Calc</h1>
      <div class="calc-card">
        <div class="card-title">
          <div>计算输入</div>
          <div class="a-button-wrapper">
            <button class="a-button" @click="uploadJson().then(data => { formData = data as IFireCalcFormData })">
              导入
            </button>
            <button class="a-button" @click="downloadJson(JSON.stringify(formData, null, 2), 'fire-calc-form.json')">
              导出
            </button>
          </div>
        </div>
        <div class="group-grid">
          <label v-for="item in formItems" :key="item.key" class="calc-label" :for="item.key">
            <span>
              {{ item.label || formatLabel(item.key) }}
              <template v-if="item.tips">({{ item.tips }})</template>
            </span>

            <input
              :id="item.key"
              v-model="formData[item.key]" class="calc-input" :type="item.type" :min="item.min"
              :max="item.max"
              :step="item.step"
            >
          </label>
        </div>
      </div>

      <div class="calc-card">
        <div class="card-title">
          <div>计算结果</div>
          <button class="a-button" @click="saveImage">
            保存图片
          </button>
        </div>
        <div class="result-wrapper">
          <div v-for="item in resultItems" :key="item.key" class="result-item">
            <div class="result-label">
              {{ item.label || formatLabel(item.key) }}:
            </div>
            <div class="result-value">
              {{ item.value }}
            </div>
          </div>
        </div>
      </div>

      <div class="calc-card" style="padding: 0;">
        <div ref="chartWrapper" class="chart-wrapper" />
      </div>

      <div class="calc-card">
        <div class="card-title">
          迭代过程
        </div>

        <div class="group-grid" style="width: 100px; margin-bottom: 10px;">
          <label v-for="item in filterFormItems" :key="item.key" class="calc-label" :for="item.key">
            <div>
              {{ item.label || formatLabel(item.key) }}
            </div>

            <input
              :id="item.key"
              v-model="filterData[item.key]" class="calc-input" :type="item.type" :min="item.min"
              :max="item.max"
              :step="item.step"
            >
          </label>
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>资产</th>
                <th>被动收入(年化)</th>
                <th>年龄</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredStepData" :key="item.monthCount">
                <td>{{ item.label }}</td>
                <td>{{ numberWithCommas(item.value) }}</td>
                <td>{{ numberWithCommas(getPassiveIncome(item.value).piYearly) }}</td>
                <td>{{ item.age }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.fire-calc-wrapper {
  height: 100%;
  padding: 16px 10px;
  box-sizing: border-box;
  background-color: #F9F9F9;
  $mq_mobile_width: 500px;
  h1 {
    text-align: center;
    margin: 0 0 8px;
  }

  .fire-calc-container {
    margin: 0 auto;
    max-width: 1200px;
  }

  .calc-card {
    background-color: #fff;
    box-shadow: 0px 2px 8px 0px rgba(0, 0, 0, 0.03);
    border-radius: 8px;
    padding: 16px;

    & + .calc-card {
      margin-top: 16px;
    }

    .card-title {
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }
  }

  @media screen and (max-width: $mq_mobile_width)  {
    padding: 16px 0;
    .calc-card {
      border-radius: 0;
    }
  }
  .group-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    grid-gap: 10px;
  }

  @media screen and (max-width: 400px) {
    .group-grid {
      grid-template-columns: 1fr !important;
    }
  }

  .result-wrapper {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 10px;

    .result-label {
      width: 100px;
      text-align: right;
    }

    .result-value {
      flex: 1;
    }
  }

  .calc-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .calc-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #D9D9D9;
    border-radius: 4px;

    &[type="checkbox"] {
      width: 20px;
      height: 20px;
      cursor: pointer;
    }
  }

  .chart-wrapper {
    width: 100%;
    height: 500px;
  }

  .table-wrapper {
    table {
      border-collapse: collapse;
      width: 100%;
    }

    th, td {
      border: 1px solid #ccc;
      padding: 8px;
      text-align: left;
    }

    th {
      background-color: #f2f2f2;
    }
    thead {
      position: sticky;
      top: 0;

    }
    tr {
      &:hover {

        background-color: #f2f2f2;
      }
    }
  }

  .a-button-wrapper {
    display: flex;
    gap: 4px;
  }
  .a-button {
    padding: 2px 8px;
    border: 1px solid #D9D9D9;
    border-radius: 4px;
    cursor: pointer;
    background-color: #F9F9F9;
  }

  &.is-capturing {
    max-width: 800px;
    .a-button {
      display: none;
    }
  }
}
</style>
