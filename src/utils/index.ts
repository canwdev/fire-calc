import moment from 'moment/moment'

// 格式化 key -> label
export function formatLabel(key: string) {
  const words = key.split(/(?=[A-Z])/)
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

// 使用 Moment.js 将 n 个月转换为 x 年 y 月的代码：
export function convertMonthsToYearsAndMonths(months: string | number) {
  const duration = moment.duration(months, 'months')
  const years = Math.floor(duration.asYears())
  const remainingMonths = Math.floor(duration.asMonths()) % 12

  let result = ''
  if (years !== 0) {
    result += `${years}年`
  }
  if (remainingMonths !== 0) {
    result += `${remainingMonths}月`
  }
  if (!result) {
    result = '初始'
  }
  return result
}

export function numberWithCommas(num: string | number) {
  return Number(num).toLocaleString()
}

export function downloadJson(content: string, filename = 'download.json') {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function uploadJson() {
  return new Promise((r, j) => {
    const i = document.createElement('input')
    i.type = 'file'
    i.accept = 'application/json'
    i.onchange = (e) => {
      const f = e.target.files[0]
      if (!f) { j('No file'); document.body.removeChild(i); return }
      const R = new FileReader()
      R.onload = (e) => {
        try { r(JSON.parse(e.target.result)) }
        catch (E) { j('Invalid JSON') }document.body.removeChild(i)
      }
      R.onerror = () => { j('Read error'); document.body.removeChild(i) }
      R.readAsText(f)
    }
    document.body.appendChild(i)
    i.click()
  })
}
