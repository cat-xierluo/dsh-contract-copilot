#!/usr/bin/env node
/**
 * CC-V5-003 force_edit 修订产物验收脚本（独立于 vitest 的可重复工程验收）。
 *
 * 用法：
 *   node scripts/acceptance/force-edit-acceptance.mjs [--keep <dir>]
 *
 * 链路：脱敏合成 DOCX + force_edit:true plan → 真实 apply_review_plan.py
 *   → 断言修订 DOCX 的 word/document.xml 同时含 w:ins 与 w:del
 *   → 经生产渲染入口（host-api.documentView 同一函数组合：
 *     extractDocxParts + renderDocumentWithAnchors）断言 HTML 同时含 cc-ins 与 cc-del。
 *
 * 退出码契约：
 *   0 = 通过
 *   1 = FAIL（断言不满足 / CLI 非零退出 / CLI 超时）
 *   2 = BLOCKED（环境不具备验收条件：依赖缺失、依赖探测超时、fixture 生成或
 *       抽取工具超时、生产渲染入口不可用；具名原因输出到 stderr）
 *
 * 任何退出路径都不直接 process.exit：BLOCKED/FAIL 一律具名异常 → main 的
 * finally 保证临时目录清理（--keep 目录除外）。
 * --keep <dir> 保留产物（修订 DOCX / plan / 归档）供后续真实浏览器样例固定输入。
 */

import { spawnSync } from 'node:child_process'
import { accessSync, constants as fsConstants, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const SKILL_ROOT = process.env.CONTRACT_COPILOT_SKILL_ROOT
  ?? '/Users/maoking/Library/Application Support/maoscripts/skills/legal-skills/skills/contract-copilot'
const CLI_ENTRY = path.join(SKILL_ROOT, 'scripts', 'review', 'apply_review_plan.py')
const PYTHON = process.env.CONTRACT_COPILOT_PYTHON ?? 'python3'

const PROBE_TIMEOUT_MS = 15_000
const GEN_TIMEOUT_MS = 30_000
const CLI_TIMEOUT_MS = 180_000
const EXTRACT_TIMEOUT_MS = 30_000

/** 具名阻塞：环境不具备验收条件 → 退出码 2，必须与断言失败(1)可区分。 */
class BlockedError extends Error {
  constructor(reason) {
    super(`[force-edit-acceptance] BLOCKED：${reason}`)
    this.name = 'BlockedError'
    this.blocked = true
  }
}

/** 具名失败：断言或执行不满足 → 退出码 1。 */
function fail(message) {
  throw new Error(`[force-edit-acceptance] FAIL：${message}`)
}

function isReadableDir(target) {
  try {
    return statSync(target).isDirectory() && (accessSync(target, fsConstants.R_OK), true)
  } catch {
    return false
  }
}

function isReadableFile(target) {
  try {
    return statSync(target).isFile() && (accessSync(target, fsConstants.R_OK), true)
  } catch {
    return false
  }
}

/** spawnSync 是否因超时被杀（error.code=ETIMEDOUT 或 status=null+SIGTERM）。 */
function timedOut(result) {
  return result.error?.code === 'ETIMEDOUT'
    || (result.error === undefined && result.status === null && result.signal === 'SIGTERM')
}

function probeDeps() {
  const missing = []
  for (const [name, code] of [
    ['python3', 'pass'],
    ['defusedxml', 'import defusedxml'],
    ['python-docx', 'import docx'],
  ]) {
    const probe = spawnSync(PYTHON, ['-c', code], { stdio: 'pipe', timeout: PROBE_TIMEOUT_MS })
    if (timedOut(probe)) {
      throw new BlockedError(`依赖探测超时（>${PROBE_TIMEOUT_MS}ms，SIGTERM）：${name}`)
    }
    if (probe.status !== 0 || probe.error !== undefined) {
      missing.push(name === 'python3' ? 'python3（可执行文件不存在）'
        : `${name}（pip install -r scripts/requirements.txt）`)
    }
  }
  if (!isReadableDir(SKILL_ROOT)) {
    missing.push(`skill root 不可读：${SKILL_ROOT}（可用 CONTRACT_COPILOT_SKILL_ROOT 覆盖）`)
  } else if (!isReadableFile(CLI_ENTRY)) {
    missing.push(`CLI 入口不可读：${CLI_ENTRY}`)
  }
  if (missing.length > 0) throw new BlockedError(`真实 CLI 链路依赖缺失 → ${missing.join('；')}`)
}

/** spawn python 的公共封装：超时按 blockedOnTimeout 归类为 BLOCKED 或 FAIL。 */
function runPython(args, { timeout, label, blockedOnTimeout }) {
  const result = spawnSync(PYTHON, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
  })
  if (timedOut(result)) {
    const reason = `${label} 超时（>${timeout}ms，SIGTERM）`
    if (blockedOnTimeout) throw new BlockedError(reason)
    fail(reason)
  }
  return result
}

/**
 * 生产渲染入口：优先 src/docx-view.ts（源代码真值）。仅当错误明确是
 * TypeScript loader 能力缺失（node 无法处理 .ts 扩展名）时才回退到已构建的
 * lib/docx-view.js；源入口的任何其他异常（文件缺失、语法错误、加载失败等）
 * 直接 FAIL，绝不静默退回可能陈旧的 lib 假绿。
 */
async function importRenderer() {
  const srcUrl = new URL('../../src/docx-view.ts', import.meta.url)
  let srcError
  try {
    return (await import(srcUrl.href)).renderDocumentWithAnchors
  } catch (error) {
    srcError = error
  }
  const capabilityMiss = srcError?.code === 'ERR_UNKNOWN_FILE_EXTENSION'
  if (!capabilityMiss) {
    fail(`src/docx-view.ts 渲染入口加载失败（code=${srcError?.code ?? 'unknown'}：`
      + `${srcError?.message ?? srcError}）——不回退 lib 以防陈旧产物假绿`)
  }
  const libUrl = new URL('../../lib/docx-view.js', import.meta.url)
  try {
    return (await import(libUrl.href)).renderDocumentWithAnchors
  } catch (libError) {
    throw new BlockedError(
      `当前 node（${process.version}）不支持加载 .ts（${srcError.code}），且已构建的 `
      + `lib/docx-view.js 不可用（${libError.code ?? libError.message}；需先 pnpm run build）`,
    )
  }
}

function parseArgs(argv) {
  const options = { keep: undefined }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--keep') {
      const value = argv[++i]
      if (value === undefined) throw new BlockedError('--keep 需要目录参数')
      options.keep = path.resolve(value)
    }
  }
  return options
}

function extractDocumentXml(docxPath) {
  // 与 src/docx-view.ts extractDocxParts 相同的抽取方式：python3 zipfile 读 word/document.xml
  const script = [
    'import sys, zipfile',
    'z = zipfile.ZipFile(sys.argv[1])',
    "sys.stdout.write(z.read('word/document.xml').decode('utf-8'))",
  ].join('\n')
  const result = runPython(['-c', script, docxPath], {
    timeout: EXTRACT_TIMEOUT_MS,
    label: 'word/document.xml 抽取',
    blockedOnTimeout: true,
  })
  if (result.status !== 0) {
    fail(`word/document.xml 抽取失败（exit=${result.status}）：${result.stderr ?? ''}`)
  }
  return result.stdout
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const ownedDir = options.keep === undefined
  let dir
  try {
    // 0) 环境与 CLI 入口探测（BLOCKED → 2；此时未建目录，finally 幂等）
    probeDeps()

    dir = options.keep ?? mkdtempSync(path.join(tmpdir(), 'cc-force-edit-acceptance-'))
    mkdirSync(path.join(dir, 'config'), { recursive: true })

    // 1) 脱敏合成 DOCX
    const genScript = path.join(dir, 'gen-force-edit-fixture.py')
    writeFileSync(genScript, [
      'from docx import Document',
      'd = Document()',
      `d.add_heading(${JSON.stringify('合成验收采购合同')}, 0)`,
      ...[
        '甲方：测试甲公司（合成数据）',
        '乙方：测试乙公司（合成数据）',
        '本合同为插件工程验收专用的合成样例，不构成任何真实交易安排。',
        '任何一方违约应赔偿对方全部损失。',
        '第二条 争议解决：因本合同引起的争议，双方应先友好协商解决。',
      ].map((text) => `d.add_paragraph(${JSON.stringify(text)})`),
      `d.save(${JSON.stringify(path.join(dir, '合成验收采购合同.docx'))})`,
    ].join('\n'), 'utf8')
    const gen = runPython([genScript], {
      timeout: GEN_TIMEOUT_MS,
      label: '合成 DOCX 生成',
      blockedOnTimeout: true,
    })
    if (gen.status !== 0) fail(`合成 DOCX 生成失败（exit=${gen.status}）：${gen.stderr ?? ''}`)
    const sourceDocx = path.join(dir, '合成验收采购合同.docx')

    // 2) force_edit plan（与 tests/force-edit-fixture.ts buildForceEditPlan 同一份数据）
    const targetText = '任何一方违约应赔偿对方全部损失。'
    const replacementText = '违约赔偿以合同总价款的百分之二十为限。'
    const planPath = path.join(dir, 'review-plan.json')
    writeFileSync(planPath, `${JSON.stringify({
      meta: {
        contract_name: '合成验收采购合同',
        client_name: '测试甲公司',
        party_role: '甲方',
        review_intensity: '常规',
        edit_policy: 'revise-first',
      },
      summary: {
        contract_type: '采购合同（合成验收样例）',
        parties: { party_a: '测试甲公司', party_b: '测试乙公司' },
        business_overview: '用于插件工程验收的合成采购安排',
        contract_amount: '人民币一元（合成数据）',
        payment_terms: '验收一次性付清（合成数据）',
        rights_obligations: '双方权利义务由合成条款约定',
        overall_risk: '低',
        core_conclusion: '按建议修订后可签（合成数据）',
        key_recommendations: ['为违约赔偿设置上限（合成数据）'],
      },
      findings: [{
        id: 'R001',
        risk: '违约赔偿上限缺失（合成验收）',
        severity: 'P1',
        target_text: targetText,
        replacement_text: replacementText,
        action: 'replace',
        force_edit: true,
        legal_basis: '《民法典》第五百八十五条',
      }],
    }, null, 2)}\n`, 'utf8')

    // 3) 真实 Python CLI（argv 与 src/python-bridge.ts buildArgv 一致；带超时）
    const outputDocx = path.join(dir, 'output', '合成验收采购合同_reviewed.docx')
    mkdirSync(path.dirname(outputDocx), { recursive: true })
    const reportDocx = path.join(dir, 'output', '合成验收采购合同_审查报告.docx')
    const cli = runPython([
      CLI_ENTRY,
      '--input', sourceDocx,
      '--plan', planPath,
      '--output', outputDocx,
      '--report-docx', reportDocx,
      '--client-name', '测试甲公司',
      '--party-role', '甲方',
      '--review-intensity', '常规',
      '--edit-policy', 'revise-first',
      '--author', '验收测试律师',
      '--organization', '合成验收律所',
      '--archive-dir', path.join(dir, 'archive'),
    ], { timeout: CLI_TIMEOUT_MS, label: 'apply_review_plan.py', blockedOnTimeout: false })
    const stdout = cli.stdout ?? ''
    console.log(stdout.trim())

    // 4) 核心断言 A：CLI success 且修订 DOCX 的 word/document.xml 同时含 w:ins 与 w:del
    if (cli.status !== 0) {
      fail(`apply_review_plan.py exit=${cli.status}\n${cli.stderr ?? ''}`)
    }
    const reviewedDocx = /^输出 DOCX: (.+)$/mu.exec(stdout)?.[1]?.trim() ?? outputDocx
    const documentXml = extractDocumentXml(reviewedDocx)
    const hasIns = documentXml.includes('<w:ins ')
    const hasDel = documentXml.includes('<w:del ')
    console.log(`修订 DOCX: ${reviewedDocx}`)
    console.log(`OOXML 断言: w:ins=${hasIns ? 'OK' : 'MISSING'} w:del=${hasDel ? 'OK' : 'MISSING'}`)
    if (!hasIns || !hasDel) fail('修订 DOCX 未同时含 w:ins 与 w:del')

    // 5) 核心断言 B：生产渲染入口 HTML 同时含 cc-ins 与 cc-del
    const renderDocumentWithAnchors = await importRenderer()
    const html = renderDocumentWithAnchors(documentXml, new Map()).html
    const hasCcIns = /<ins class="cc-ins">[^<]+<\/ins>/.test(html)
    const hasCcDel = /<del class="cc-del">[^<]+<\/del>/.test(html)
    // CLI 落的是最小差异修订：新增实质内容以片段形式合并在场
    const visibleText = html.replace(/<[^>]+>/g, '')
    const hasInserted = visibleText.includes('以合同总价款的百分之二十为限')
    console.log(`工作台投影断言: cc-ins=${hasCcIns ? 'OK' : 'MISSING'} cc-del=${hasCcDel ? 'OK' : 'MISSING'} 插入内容=${hasInserted ? 'OK' : 'MISSING'}`)
    if (!hasCcIns || !hasCcDel || !hasInserted || visibleText.includes(targetText)) {
      fail('工作台 HTML 未同时含 cc-ins/cc-del 或插入内容未按最小差异在场')
    }

    console.log(`[force-edit-acceptance] PASS：force_edit 修订产物链路验收通过${options.keep === undefined ? '' : `，产物保留在 ${dir}`}`)
  } finally {
    // 唯一清理出口：BLOCKED / FAIL / PASS 都经过这里（--keep 目录除外）
    if (ownedDir && dir !== undefined) rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  if (error instanceof BlockedError) {
    console.error(error.message)
    process.exitCode = 2
  } else {
    console.error(error?.message ?? String(error))
    process.exitCode = 1
  }
})
