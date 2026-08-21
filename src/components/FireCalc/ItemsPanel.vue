<script setup lang="ts">
import { computed, inject } from 'vue'
import { financialStoreKey } from './types'
import { diffDays, fmtElapsed, fmtNum } from './utils'

const store = inject(financialStoreKey)!
const { data } = store

const rows = computed(() => {
  return data.value.items_of_long_term_use.map((it) => {
    const days = diffDays(it.date)
    const daily = it.price != null && days != null ? (it.price / days).toFixed(2) : null
    const elapsed = fmtElapsed(it.date)
    return { it, days, daily, elapsed }
  })
})
</script>

<template>
  <section class="items-panel">
    <div class="card">
      <div class="card-title">长期主义物品清单<span class="badge">{{ rows.length }} 件</span></div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>名称</th>
              <th>购入日期</th>
              <th class="num">价格</th>
              <th>备注</th>
              <th class="num">重量(g)</th>
              <th>退役日期</th>
              <th class="num">距今(天)</th>
              <th class="num">日均价格</th>
              <th>距今(年月日)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.it.name">
              <td>{{ row.it.name }}</td>
              <td>{{ row.it.date || '—' }}</td>
              <td class="num">{{ fmtNum(row.it.price, 0) }}</td>
              <td class="remark">{{ row.it.remark || '—' }}</td>
              <td class="num">{{ fmtNum(row.it.wight, 1) }}</td>
              <td>{{ row.it.retire_date || '—' }}</td>
              <td class="num">{{ fmtNum(row.days, 0) }}</td>
              <td class="num">{{ row.daily != null ? fmtNum(row.daily, 2) : '—' }}</td>
              <td>{{ row.elapsed || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.items-panel {
  min-width: 0;
}
</style>
