/**
 * 转为可写入 IndexedDB 的纯对象。
 * structuredClone 无法克隆 Vue 响应式代理（会抛 DataCloneError），
 * 存储的数据都是 JSON 兼容的（字符串、数字、数组、data URL），用 JSON 往返即可。
 */
export function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}
