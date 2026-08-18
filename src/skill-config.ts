/**
 * 读取 contract-copilot skill 的本地配置（只读；写者始终是 Python）。
 *
 * - config/reviewer_profile.json：审查人身份（author/organization 必需才非交互可跑）
 * - config/review_memory.json：按合同名命中的历史审查上下文（§3.2.1 沿用规则）
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export interface ReviewerProfile {
  author?: string
  initials?: string
  organization?: string
  department?: string
  confirmed?: boolean
}

export interface ReviewMemoryRecord {
  contract_name?: string
  client_name?: string
  party_role?: string
  review_intensity?: string
  edit_policy?: string
}

export interface ReviewMemory {
  contracts?: Record<string, ReviewMemoryRecord>
  clients?: Record<string, ReviewMemoryRecord>
}

function readJson(file: string): Record<string, unknown> | undefined {
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch (error) {
    throw new Error(`contract-copilot: 配置文件损坏（${file}），请修复或删除后重试`, { cause: error })
  }
}

/** 读审查人配置；文件不存在返回空对象。author+organization 齐全才算可用。 */
export function readReviewerProfile(skillRoot: string): ReviewerProfile {
  const raw = readJson(path.join(skillRoot, 'config', 'reviewer_profile.json'))
  return raw === undefined ? {} : raw as ReviewerProfile
}

/** 读审查记忆；文件不存在返回空对象。 */
export function readReviewMemory(skillRoot: string): ReviewMemory {
  const raw = readJson(path.join(skillRoot, 'config', 'review_memory.json'))
  return raw === undefined ? {} : raw as ReviewMemory
}

/** 按归一化合同 key 查历史命中。 */
export function findContractMemory(memory: ReviewMemory, contractKey: string): ReviewMemoryRecord | undefined {
  return memory.contracts?.[contractKey]
}
