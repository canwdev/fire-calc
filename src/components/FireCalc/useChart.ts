import * as echarts from 'echarts'

export type Chart = ReturnType<typeof echarts.init>

/**
 * 等容器有实际尺寸后再初始化 ECharts，并在容器尺寸变化时自动 resize。
 *
 * 未激活的标签页和默认隐藏的卡片用 v-show（display:none）隐藏，此时
 * clientWidth / clientHeight 为 0，直接 init 会触发
 * 「Can't get DOM width or height」警告，因此等容器可见后再初始化。
 *
 * 初始化后仍保留 ResizeObserver：移动端布局（flex 换行、地址栏收起等）
 * 可能在初始化之后才改变容器宽度，需要跟着 resize，否则图表会停留在
 * 初始化时的窄宽度上。
 *
 * @param el 图表容器
 * @param onReady 容器可见、图表创建后的回调（在此处 setOption）
 * @returns 清理函数：停止观察并销毁图表
 */
export function initChartWhenReady(el: HTMLElement, onReady: (chart: Chart) => void): () => void {
  let chart: Chart | null = null
  let observer: ResizeObserver | null = null
  let lastW = 0
  let lastH = 0

  function handleSize() {
    const w = el.clientWidth
    const h = el.clientHeight

    // 容器不可见（display:none）时不动图表，既不初始化也不 resize 到 0
    if (!w || !h)
      return

    if (!chart) {
      lastW = w
      lastH = h
      chart = echarts.init(el)
      onReady(chart)
      return
    }

    if (w === lastW && h === lastH)
      return
    lastW = w
    lastH = h
    chart.resize()
  }

  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(handleSize)
    observer.observe(el)
  }
  // 标签页切换时会派发 resize，作为 ResizeObserver 之外的双保险
  window.addEventListener('resize', handleSize)
  handleSize()

  return () => {
    observer?.disconnect()
    observer = null
    window.removeEventListener('resize', handleSize)
    chart?.dispose()
    chart = null
  }
}
