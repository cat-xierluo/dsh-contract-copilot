/**
 * python-bridge 单测：buildArgv / classify / parseStdout。
 * 不 spawn 真实 Python，只测纯函数。
 */

import { describe, expect, it } from 'vitest'
import { buildArgv, classify, parseStdout } from '../src/python-bridge.ts'

const BASE_ARGS = {
  skillRoot: '/skills/contract-copilot',
  pythonExecutable: 'python3',
  inputDocx: '/tmp/in.docx',
  planPath: '/tmp/plan.json',
  outputDocx: '/tmp/out.docx',
  reportDocx: '/tmp/报告.docx',
  clientName: '示例公司',
  partyRole: '甲方',
  reviewIntensity: '常规',
  editPolicy: 'revise-first',
  author: '杨卫薪',
  organization: '示例律所',
} as const

describe('buildArgv', () => {
  it('拼装完整 CLI 参数（部门可选用 --department）', () => {
    expect(buildArgv({ ...BASE_ARGS, department: '合规部' })).toEqual([
      '/skills/contract-copilot/scripts/review/apply_review_plan.py',
      '--input', '/tmp/in.docx',
      '--plan', '/tmp/plan.json',
      '--output', '/tmp/out.docx',
      '--report-docx', '/tmp/报告.docx',
      '--client-name', '示例公司',
      '--party-role', '甲方',
      '--review-intensity', '常规',
      '--edit-policy', 'revise-first',
      '--author', '杨卫薪',
      '--organization', '示例律所',
      '--department', '合规部',
    ])
  })

  it('未提供部门时省略 --department', () => {
    const argv = buildArgv(BASE_ARGS)
    expect(argv).not.toContain('--department')
  })

  it('空字符串部门与缺省等价', () => {
    expect(buildArgv({ ...BASE_ARGS, department: '' })).not.toContain('--department')
  })

  it('第一条 argv 永远是 skillRoot 拼出的脚本绝对路径', () => {
    const argv = buildArgv(BASE_ARGS)
    expect(argv[0]).toBe('/skills/contract-copilot/scripts/review/apply_review_plan.py')
  })

  it('关键参数顺序与 Python argparse 定义对齐', () => {
    // 顺序不能动：Python 端要求的参数布局由 argparse 强制。
    const argv = buildArgv(BASE_ARGS)
    const inputIdx = argv.indexOf('--input')
    const planIdx = argv.indexOf('--plan')
    const outputIdx = argv.indexOf('--output')
    expect(inputIdx).toBeLessThan(planIdx)
    expect(planIdx).toBeLessThan(outputIdx)
  })
})

describe('classify', () => {
  it('exit 0 → success', () => {
    expect(classify(0, '')).toBe('success')
  })

  it('exit 1 + stderr 含 integrity 标题 → rejected', () => {
    expect(classify(1, '报告未通过完整性复核：\n  - 缺法条依据')).toBe('rejected')
  })

  it('exit 1 + stderr "存在失败项" → partial', () => {
    expect(classify(1, '存在失败项，请检查归档目录中的执行日志与审查报告。')).toBe('partial')
  })

  it('exit 1 + 其他 stderr → error', () => {
    expect(classify(1, 'ValueError: 缺参数')).toBe('error')
  })

  it('exit 2（外部异常） → error', () => {
    expect(classify(2, '')).toBe('error')
  })

  it('null exitCode（被 signal 终止或未启动） → error', () => {
    expect(classify(null, '')).toBe('error')
  })

  it('integrity 与 partial 都在 stderr 时优先 rejected（更具体）', () => {
    const stderr = '报告未通过完整性复核：\n  - x\n存在失败项，请检查'
    expect(classify(1, stderr)).toBe('rejected')
  })

  it('错把 0 + integrity stderr 也判为 success（0 是权威信号）', () => {
    // 防止未来 Python 出现"非零退码但成功"时把判据降级；exit 0 即 success。
    expect(classify(0, '报告未通过完整性复核：异常')).toBe('success')
  })
})

describe('parseStdout', () => {
  it('解析产物路径与执行统计四元组', () => {
    const stdout = `输入 DOCX: /tmp/in.docx
输出 DOCX: /tmp/out_reviewed.docx
输出报告 DOCX: /tmp/out_审查报告.docx
执行日志: /tmp/日志.json
归档目录: /tmp/archive/run-1
审查上下文: 客户=示例公司，立场=甲方，口径=常规
执行统计: 成功=5，失败=1，跳过=0，仅意见书=2`
    expect(parseStdout(stdout)).toEqual({
      reviewedDocx: '/tmp/out_reviewed.docx',
      reportDocx: '/tmp/out_审查报告.docx',
      archiveDir: '/tmp/archive/run-1',
      stats: { applied: 5, failed: 1, skipped: 0, reportOnly: 2 },
    })
  })

  it('缺归档目录行时 archiveDir 留空', () => {
    const stdout = '输出 DOCX: /tmp/o.docx\n输出报告 DOCX: /tmp/r.docx\n执行统计: 成功=1，失败=0，跳过=0，仅意见书=0'
    expect(parseStdout(stdout)).toMatchObject({
      reviewedDocx: '/tmp/o.docx',
      reportDocx: '/tmp/r.docx',
      archiveDir: undefined,
      stats: { applied: 1, failed: 0, skipped: 0, reportOnly: 0 },
    })
  })

  it('空 stdout 全部 undefined', () => {
    expect(parseStdout('')).toEqual({
      reviewedDocx: undefined,
      reportDocx: undefined,
      archiveDir: undefined,
      stats: undefined,
    })
  })

  it('统计行数字不为零容忍：中文逗号/空格', () => {
    const stdout = '输出 DOCX: /a.docx\n执行统计: 成功=0，失败=10，跳过=3，仅意见书=0'
    expect(parseStdout(stdout)?.stats).toEqual({ applied: 0, failed: 10, skipped: 3, reportOnly: 0 })
  })

  it('执行统计格式错误（不是精确中文逗号） → stats undefined，但路径仍能解析', () => {
    const stdout = '输出 DOCX: /a.docx\n输出报告 DOCX: /b.docx\n执行统计 成功 1 失败 0'
    const parsed = parseStdout(stdout)
    expect(parsed.reviewedDocx).toBe('/a.docx')
    expect(parsed.stats).toBeUndefined()
  })
})