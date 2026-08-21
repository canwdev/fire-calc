<script setup lang="ts">
import { computed, inject, ref } from 'vue'
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

interface IItemDraft {
  name: string
  date: string
  price: string
  remark: string
  wight: string
  retire_date: string
}

const editMode = ref(false)
const draft = ref<IItemDraft[]>([])

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

function dateOrNull(v: unknown): string | null {
  const s = String(v ?? '').trim()
  return s === '' || isInvalidDate(s) ? null : s
}

function numOrNull(v: unknown): number | null {
  const s = String(v ?? '').trim()
  return s === '' ? null : parseNum(s)
}

function enterEdit() {
  draft.value = data.value.items_of_long_term_use.map(it => ({
    name: it.name,
    date: it.date ?? '',
    price: it.price != null ? String(it.price) : '',
    remark: it.remark ?? '',
    wight: it.wight != null ? String(it.wight) : '',
    retire_date: it.retire_date ?? '',
  }))
  editMode.value = true
}

function cancelEdit() {
  editMode.value = false
  draft.value = []
}

function saveEdit() {
  data.value.items_of_long_term_use = draft.value
    .filter(it => String(it.name).trim() !== '')
    .map(it => ({
      name: String(it.name).trim(),
      date: dateOrNull(it.date),
      price: numOrNull(it.price),
      remark: String(it.remark ?? ''),
      wight: numOrNull(it.wight),
      retire_date: dateOrNull(it.retire_date),
    }))
  editMode.value = false
}

function addItem() {
  draft.value.push({ name: '', date: '', price: '', remark: '', wight: '', retire_date: '' })
}

function removeItem(idx: number) {
  draft.value.splice(idx, 1)
}
</script>

<template>
  <section class="items-panel">
    <div class="card">
      <div class="card-title">
        <span>长期主义物品清单<span class="badge">{{ rows.length }} 件</span></span>
        <button v-if="!editMode" class="a-button edit-toggle" @click="enterEdit">编辑</button>
      </div>

      <div v-if="editMode" class="edit-block">
        <div class="edit-actions">
          <button class="a-button" @click="addItem">＋ 新增物品</button>
          <span class="edit-hint">编辑中</span>
          <button class="a-button save" @click="saveEdit">保存</button>
          <button class="a-button" @click="cancelEdit">取消</button>
        </div>
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
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(it, i) in draft" :key="i">
                <td><input v-model="it.name" class="edit-input" placeholder="名称"></td>
                <td><input v-model="it.date" type="date" class="edit-input"
                    :class="{ 'input-error': isInvalidDate(it.date) }"></td>
                <td class="num"><input v-model="it.price" type="number" min="0" class="edit-input edit-input-num"
                    :class="{ 'input-error': isInvalidNum(it.price) }"></td>
                <td><textarea v-model="it.remark" rows="1" class="edit-input edit-textarea" placeholder="备注"></textarea>
                </td>
                <td class="num"><input v-model="it.wight" type="number" min="0" class="edit-input edit-input-num"
                    :class="{ 'input-error': isInvalidNum(it.wight) }"></td>
                <td><input v-model="it.retire_date" type="date" class="edit-input"
                    :class="{ 'input-error': isInvalidDate(it.retire_date) }"></td>
                <td><button class="a-button" @click="removeItem(i)">删除</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else class="table-scroll">
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
  width: 110px;
  text-align: right;
}

.edit-textarea {
  display: block;
}
</style>
