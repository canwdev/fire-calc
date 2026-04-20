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
  // 每月支出（用于计算FIRE所需资产）
  monthlyExpense: number
  // 是否为目标存款模式
  isTargetMode: boolean
  // 迭代年数
  iterationYears: number
  // 目标存款
  targetValue: number
  // 年化收益率
  annualInterestRate: number
  // 通胀率
  inflationRate: number
  // 年终奖
  yearEndBonus: number
  // 年终奖发放月份
  yearEndBonusMonth: number
  // 年龄
  age: number
}

// 情景配置接口
interface IScenario {
  name: string
  data: IFireCalcFormData
  createTime: number
}

const echartsInstance = shallowRef()

const formData = useStorage<IFireCalcFormData>(
  'fire_calc_form_data',
  {
    currentValue: 1000,
    monthlySave: 3000,
    monthlyExpense: 5000,
    isTargetMode: false,
    iterationYears: 1,
    targetValue: 1000000,
    annualInterestRate: 0.025,
    inflationRate: 0.02,
    yearEndBonus: 0,
    yearEndBonusMonth: 4,
    age: 0,
  },
  localStorage,
  { listenToStorageChanges: false },
)

// 情景配置列表
const scenarios = useStorage<IScenario[]>('fire_calc_scenarios', [], localStorage)
const currentScenarioName = ref('')

// 情景管理函数
function saveScenario() {
  if (!currentScenarioName.value.trim()) {
    alert('请输入情景名称')
    return
  }
  const existingIndex = scenarios.value.findIndex(s => s.name === currentScenarioName.value.trim())
  const scenario: IScenario = {
    name: currentScenarioName.value.trim(),
    data: { ...formData.value },
    createTime: Date.now(),
  }
  if (existingIndex >= 0) {
    scenarios.value[existingIndex] = scenario
  }
  else {
    scenarios.value.push(scenario)
  }
}

function loadScenario(name: string) {
  const scenario = scenarios.value.find(s => s.name === name)
  if (scenario) {
    formData.value = { ...scenario.data }
    currentScenarioName.value = name
  }
}

function deleteScenario(name: string) {
  const index = scenarios.value.findIndex(s => s.name === name)
  if (index >= 0) {
    scenarios.value.splice(index, 1)
    if (currentScenarioName.value === name) {
      currentScenarioName.value = ''
    }
  }
}

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
      label: '年化收益率',
      key: 'annualInterestRate',
      type: 'number',
      step: 0.001,
      tips: `${Number.parseFloat((formData.value.annualInterestRate * 100).toFixed(2))}%`,
    },
    {
      label: '通胀率',
      key: 'inflationRate',
      type: 'number',
      step: 0.001,
      tips: `${Number.parseFloat((formData.value.inflationRate * 100).toFixed(2))}%`,
    },
    {
      label: '年终奖',
      key: 'yearEndBonus',
      type: 'number',
      step: 1000,
    },
    ...(formData.value.yearEndBonus > 0
      ? [{
          label: '年终奖发放月份',
          placeholder: '1-12，默认4月',
          key: 'yearEndBonusMonth',
          type: 'number',
          step: 1,
          min: 1,
          max: 12,
        }]
      : []),
    {
      label: '当前年龄',
      key: 'age',
      type: 'number',
      min: 0,
    },
    {
      label: 'FIRE后月支出',
      key: 'monthlyExpense',
      type: 'number',
      step: 1000,
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
  monthlyGrowth?: number // 月度增长
  totalDeposit?: number // 累计存入
  totalInterest?: number // 累计利息
}

const stepData = ref<IStepData[]>([])

const resultValue = ref(0)

function calculateData() {
  let result = Number(formData.value.currentValue)
  let age = Number(formData.value.age)
  let totalDeposit = result // 累计存入（初始资产也算作存入）
  let totalInterest = 0 // 累计利息
  stepData.value = []
  stepData.value.push({
    label: moment().format('YYYY-MM'),
    value: result,
    monthCount: 0,
    age: formData.value.age,
    monthlyGrowth: 0,
    totalDeposit: result,
    totalInterest: 0,
  })

  let iterationMonths = formData.value.iterationYears * 12
  if (formData.value.isTargetMode) {
    iterationMonths = +Infinity // 使用真实计算模式
  }
  for (let i = 0; i < iterationMonths; i++) {
    const count = i + 1

    // 防止死循环，最多迭代1000年
    if (count > 1200) {
      break
    }

    const dateMoment = moment().add(count, 'months')
    const prevValue = result

    // 年底更新一次利息
    const isDecember = dateMoment.month() === 11 // 判断月份是否为12月，月份从0开始计数
    const isBonusMonth = dateMoment.month() === (formData.value.yearEndBonusMonth || 4) - 1 // 年终奖发放月份

    if (isDecember) {
      age += 1
      // 计算年利率
      const interest = Math.abs(result) * formData.value.annualInterestRate || 0
      result += interest
      totalInterest += interest
    }
    if (isBonusMonth && formData.value.yearEndBonus) {
      result += formData.value.yearEndBonus
      totalDeposit += formData.value.yearEndBonus
    }
    result += formData.value.monthlySave || 0
    totalDeposit += formData.value.monthlySave || 0

    const monthlyGrowth = result - prevValue

    stepData.value.push({
      label: `${dateMoment.format('YYYY-MM')}`,
      value: result,
      dateMoment,
      isDecember,
      monthCount: count,
      age,
      monthlyGrowth,
      totalDeposit,
      totalInterest,
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
    const resultYears = resultMonths / 12
    const originalValue = formData.value.currentValue || 0
    const increasedValue = result - originalValue
    const increasedPercent = originalValue > 0 ? `${Number.parseFloat((((result - originalValue) / originalValue) * 100).toFixed(2))}%` : '0%'
    const resultAge = stepData.value[stepData.value.length - 1]?.age

    // 计算平均增长
    const avgYearlyGrowth = resultYears > 0 ? increasedValue / resultYears : 0
    const avgMonthlyGrowth = resultMonths > 0 ? increasedValue / resultMonths : 0

    const { piYearly, piMonthly, piDaily } = getPassiveIncome(result)

    // FIRE 相关计算
    const monthlyExpense = formData.value.monthlyExpense || 0
    const yearlyExpense = monthlyExpense * 12
    const fireTargetAmount = yearlyExpense * 25 // 4%法则：需要年支出的25倍
    const fireAchievementRate = fireTargetAmount > 0 ? `${Number.parseFloat(((originalValue / fireTargetAmount) * 100).toFixed(2))}%` : 'N/A'
    const safeWithdrawal4 = result * 0.04 // 4%安全提取额
    const safeWithdrawal3 = result * 0.03 // 3%保守提取额

    // 累计数据
    const lastStep = stepData.value[stepData.value.length - 1]
    const totalDeposit = lastStep?.totalDeposit || 0
    const totalInterest = lastStep?.totalInterest || 0
    const depositContribution = totalDeposit > 0 ? `${Number.parseFloat(((totalDeposit / result) * 100).toFixed(2))}%` : '0%'
    const interestContribution = result > 0 ? `${Number.parseFloat(((totalInterest / result) * 100).toFixed(2))}%` : '0%'

    // 投资翻倍时间（72法则）
    const rate = formData.value.annualInterestRate || 0
    const doublingTime = rate > 0 ? Number.parseFloat((72 / (rate * 100)).toFixed(2)) : 0

    // 资产能支撑多少年（按当前支出）
    const yearsCanSustain = monthlyExpense > 0 ? result / (monthlyExpense * 12) : 0

    return [
      {
        label: '结果资产',
        key: 'resultValue',
        value: `${numberWithCommas(result)}`,
        type: 'highlight',
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
        label: `FIRE达成率(FIRE目标: ${numberWithCommas(fireTargetAmount)})`,
        key: 'fireAchievementRate',
        value: `${fireAchievementRate}`,
        type: 'highlight',
        tips: `存够年支出的 25 倍，每年只花总资产的 4%，你的钱就能一辈子花不完。`,
      },
      {
        label: '安全提取额(4%法则)',
        key: 'safeWithdrawal',
        value: `年提 ${numberWithCommas(safeWithdrawal4)} · 月提 ${numberWithCommas(safeWithdrawal4 / 12)}`,
        tips: `3%保守: ${numberWithCommas(safeWithdrawal3 / 12)}/月`,
        type: 'highlight',
      },
      {
        label: '资产支撑年限',
        key: 'yearsCanSustain',
        value: `${Number.parseFloat(yearsCanSustain.toFixed(2))} 年`,
        tips: `按月支出 ${numberWithCommas(monthlyExpense)} 计算`,
        type: 'text',
      },
      {
        label: '被动收入',
        key: 'yearPassiveIncome',
        value: `年收 ${numberWithCommas(piYearly)} · 月收 ${numberWithCommas(piMonthly)} · 日收 ${numberWithCommas(piDaily)}`,
        type: 'text',
      },
      {
        label: '增长',
        key: 'increasedValue',
        value: `增长值: ${numberWithCommas(increasedValue)} · 增长率: ${increasedPercent}`,
        type: 'text',
      },
      {
        label: '平均增长',
        key: 'avgGrowth',
        value: `年增 ${numberWithCommas(avgYearlyGrowth)} · 月增 ${numberWithCommas(avgMonthlyGrowth)}`,
        type: 'text',
      },
      {
        label: '贡献占比',
        key: 'contribution',
        value: `存入 ${depositContribution} · 利息 ${interestContribution}`,
        tips: `累计存入 ${numberWithCommas(totalDeposit)} · 累计利息 ${numberWithCommas(totalInterest)}`,
        type: 'text',
      },
      {
        label: '投资翻倍时间',
        key: 'doublingTime',
        value: `${doublingTime} 年`,
        tips: '按72法则估算(72 法则是用 72 除以年化收益率，即可快速估算出投资本金翻倍所需年数的简单算法。)',
        type: 'text',
      },
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

  // 计算目标资产线数据
  const targetValue = formData.value.isTargetMode ? formData.value.targetValue : 0
  const fireTargetAmount = (formData.value.monthlyExpense || 0) * 12 * 25 // FIRE目标线

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
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            ...(targetValue > 0
              ? [{
                  yAxis: targetValue,
                  label: {
                    formatter: '目标资产',
                    position: 'insideEndTop',
                  },
                  lineStyle: {
                    color: '#52c41a',
                    type: 'dashed',
                  },
                }]
              : []),
            ...(fireTargetAmount > 0
              ? [{
                  yAxis: fireTargetAmount,
                  label: {
                    formatter: 'FIRE目标',
                    position: 'insideEndTop',
                  },
                  lineStyle: {
                    color: '#fa8c16',
                    type: 'dashed',
                  },
                }]
              : []),
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

        <!-- 情景管理 -->
        <div class="scenario-section">
          <div class="scenario-header">
            <input
              v-model="currentScenarioName"
              class="calc-input scenario-name-input"
              placeholder="情景名称"
              type="text"
            >
            <button class="a-button" @click="saveScenario">
              保存情景
            </button>
          </div>
          <div v-if="scenarios.length > 0" class="scenario-list">
            <span class="scenario-label">已保存情景:</span>
            <div v-for="scenario in scenarios" :key="scenario.name" class="scenario-item">
              <button class="a-button scenario-load-btn" @click="loadScenario(scenario.name)">
                {{ scenario.name }}
              </button>
              <button class="a-button scenario-delete-btn" @click="deleteScenario(scenario.name)">
                ×
              </button>
            </div>
          </div>
        </div>

        <div class="group-grid">
          <label v-for="item in formItems" :key="item.key" class="calc-label" :for="item.key">
            <span>
              {{ item.label || formatLabel(item.key) }}
              <span v-if="item.tips" class="calc-label-tips">({{ item.tips }})</span>
            </span>

            <input
              :id="item.key"
              v-model="formData[item.key]" class="calc-input" :type="item.type" :min="item.min"
              :max="item.max"
              :step="item.step"
              :placeholder="item.placeholder"
            >
          </label>
        </div>
      </div>

      <div class="calc-card results-card">
        <div class="card-title">
          <div>计算结果</div>
          <button class="a-button" @click="saveImage">
            保存图片
          </button>
        </div>
        <div class="result-wrapper">
          <div
            v-for="item in resultItems" :key="item.key"
            class="result-item"
            :class="{ 'result-highlight': item.type === 'highlight' }"
          >
            <div class="result-label">
              {{ item.label || formatLabel(item.key) }}:
            </div>
            <div class="result-value">
              {{ item.value }}
            </div>
            <div v-if="item.tips" class="result-tips">
              {{ item.tips }}
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
                <th>月度增长</th>
                <th>累计存入</th>
                <th>累计利息</th>
                <th>被动收入(年化)</th>
                <th>年龄</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredStepData" :key="item.monthCount">
                <td>{{ item.label }}</td>
                <td>{{ numberWithCommas(item.value) }}</td>
                <td :class="{ positive: (item.monthlyGrowth || 0) > 0 }">
                  {{ item.monthlyGrowth ? numberWithCommas(item.monthlyGrowth) : '-' }}
                </td>
                <td>{{ item.totalDeposit ? numberWithCommas(item.totalDeposit) : '-' }}</td>
                <td>{{ item.totalInterest ? numberWithCommas(item.totalInterest) : '-' }}</td>
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
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 12px;
  }

  .result-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    background-color: #f5f5f5;
    border-radius: 6px;
    border-left: 3px solid #d9d9d9;

    .result-label {
      font-size: 12px;
      color: #666;
    }

    .result-value {
      font-size: 14px;
      font-weight: 500;
      color: #333;
      word-break: break-all;
    }

    .result-tips {
      font-size: 12px;
      color: #999;
    }

    &.result-highlight {
      background: linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%);
      border-left-color: #5070dd;

      .result-value {
        color: #5070dd;
        font-size: 16px;
        font-weight: 600;
      }
    }
  }

  // 情景管理样式
  .scenario-section {
    margin-bottom: 16px;
    padding: 12px;
    background-color: #fafafa;
    border-radius: 6px;
    border: 1px dashed #d9d9d9;
    display: flex;
    flex-direction: column;
    gap: 8px;

    .scenario-header {
      display: flex;
      gap: 8px;

      .scenario-name-input {
        flex: 1;
        max-width: 200px;
      }
    }

    .scenario-list {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;

      .scenario-label {
        font-size: 12px;
        color: #666;
      }

      .scenario-item {
        display: flex;
        align-items: center;
        gap: 2px;

        .scenario-load-btn {
          font-size: 12px;
          padding: 2px 8px;
          background-color: #e6f7ff;
          border-color: #91d5ff;
          color: #096dd9;
        }

        .scenario-delete-btn {
          font-size: 12px;
          padding: 2px 6px;
          color: #ff4d4f;
          border-color: #ffa39e;
          background-color: #fff1f0;
        }
      }
    }
  }

  // 表格样式优化
  .table-wrapper {
    td.positive {
      color: #52c41a;
      font-weight: 500;
    }
  }

  .calc-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
    .calc-label-tips {
      font-size: 12px;
      color: #999;
    }
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
