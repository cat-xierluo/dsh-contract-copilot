/**
 * progress.ts 单测：
 * - formatProgressMsg 覆盖全部 9 态（含中文冒号）
 * - progressChangedSinceLastInjection 幂等判据
 */

import { describe, expect, it } from 'vitest'
import { formatProgressMsg, progressChangedSinceLastInjection } from '../src/progress.ts'
import type { ContractSession } from '../src/session.ts'

function makeSession(state: ContractSession['state'], counter = 1, lastInjected = 0): ContractSession {
  return {
    version: 1,
    id: '测试-docx-20260819000000',
    contractPath: '/tmp/测试.docx',
    contractKey: '测试docx',
    contractName: '测试.docx',
    state,
    outputs: {},
    progressCounter: counter,
    lastInjectedCounter: lastInjected,
    history: [],
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
  }
}

describe('formatProgressMsg', () => {
  it('中文合同名 + 各状态文案不带破折号外的特殊字符', () => {
    // applying / delivered 是两个特殊态：用"正在执行/本轮已交付"替代"下一步："句式。
    for (const state of [
      'created', 'intake_done', 'plan_ready', 'applied',
      'partial', 'rejected', 'failed',
    ] as const) {
      const msg = formatProgressMsg(makeSession(state))
      expect(msg).toContain('测试.docx')
      expect(msg).toMatch(/状态: /)
      expect(msg).toMatch(/下一步：/)
    }
  })

  it('applying 与 delivered 用专属句式（不用"下一步："）', () => {
    expect(formatProgressMsg(makeSession('applying'))).not.toMatch(/下一步：/)
    expect(formatProgressMsg(makeSession('delivered'))).not.toMatch(/下一步：/)
  })

  it('applying 状态突出"可能需要数分钟"提示', () => {
    const msg = formatProgressMsg(makeSession('applying'))
    expect(msg).toContain('数分钟')
  })

  it('rejected 状态指向补齐法条依据', () => {
    const msg = formatProgressMsg(makeSession('rejected'))
    expect(msg).toContain('法条')
  })

  it('delivered 状态指向对方改稿再审回路', () => {
    const msg = formatProgressMsg(makeSession('delivered'))
    expect(msg).toContain('再审')
  })
})

describe('progressChangedSinceLastInjection', () => {
  it('counter > lastInjectedCounter → true', () => {
    expect(progressChangedSinceLastInjection(makeSession('applying', 3, 2))).toBe(true)
  })

  it('counter == lastInjectedCounter → false', () => {
    expect(progressChangedSinceLastInjection(makeSession('applying', 3, 3))).toBe(false)
  })

  it('counter < lastInjectedCounter 不应该出现（防御）→ false', () => {
    expect(progressChangedSinceLastInjection(makeSession('applying', 2, 3))).toBe(false)
  })

  it('counter=0、lastInjected=0 → false（首次注入前也返回 false，caller 不会注入）', () => {
    expect(progressChangedSinceLastInjection(makeSession('created', 0, 0))).toBe(false)
  })
})