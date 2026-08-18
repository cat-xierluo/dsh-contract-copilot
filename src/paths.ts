/** 路径小工具：~ 展开与合同名归一化 key（与 Python review_runtime._normalize_lookup_key 行为一致）。 */

import { homedir } from 'node:os'
import path from 'node:path'

/** 展开 ~ 前缀为用户主目录。 */
export function expandHome(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return path.join(homedir(), p.slice(2))
  return p
}

/**
 * 合同名归一化 key：剔除所有非字母数字字符后转小写。
 * 与 scripts/review/review_runtime.py 的 _normalize_lookup_key 保持一致，
 * 用于 review_memory.json 的 contracts 命中查询。
 */
export function normalizeContractKey(value: string): string {
  return value.replace(/[^\p{L}\p{N}]+/gu, '').trim().toLowerCase()
}
