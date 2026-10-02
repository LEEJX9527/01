import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reactive, ref } from 'vue'
import { toPlain } from './plain.ts'

test('Vue 响应式对象可转为可存储的纯对象', () => {
  const s = ref({ id: '1', title: 't', draft: '', updatedAt: 1 })
  const m = reactive({ id: 'm', items: [{ name: '米饭', grams: 150, kcal: 174 }] })
  assert.throws(() => structuredClone(s.value)) // 复现原 bug
  const plain = toPlain(s.value)
  assert.deepEqual(structuredClone(plain), { id: '1', title: 't', draft: '', updatedAt: 1 })
  assert.deepEqual(structuredClone(toPlain(m)).items[0].kcal, 174)
})
