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
 * 退出码：0=通过；1=核心断言失败（绝不假绿）；2=环境依赖缺失（具名阻塞）。
 * --keep <dir> 保留产物（修订 DOCX / plan / 归档）供后续真实浏览器样例固定输入；
 * 默认使用临时目录并在结束时清理。
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const SKILL_ROOT = process.env.CONTRACT_COPILOT_SKILL_ROOT
  ?? '/Users/maoking/Library/Application Support/maoscripts/skills/legal-skills/skills/contract-copilot'
const PYTHON = process.env.CONTRACT_COPILOT_PYTHON ?? 'python3'

/** 与 tests/force-edit-fixture.ts 保持同一份合成数据（脚本需独立于 TS 运行时）。 */
const CONTRACT_NAME = '合成验收采购合同'
const CONTRACT_PARAGRAPHS = [
  '甲方：测试甲公司（合成数据）',
  '乙方：测试乙公司（合成数据）',
  '本合同为插件工程验收专用的合成样例，不构成任何真实交易安排。',
  '任何一方违约应赔偿对方全部损失。',
  '第二条 争议解决：因本合同引起的争议，双方应先友好协商解决。',
]
const TARGET_TEXT = '任何一方违约应赔偿对方全部损失。'
const REPLACEMENT_TEXT = '违约赔偿以合同总价款的百分之二十为限。'

const PLAN = {
  meta: {
    contract_name: CONTRACT_NAME,
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
  findings: [
    {
      id: 'R001',
      risk: '违约赔偿上限缺失（合成验收）',
      severity: 'P1',
      target_text: TARGET_TEXT,
      replacement_text: REPLACEMENT_TEXT,
      action: 'replace',
      force_edit: true,
      legal_basis: '《民法典》第五百八十五条',
    },
  ],
}

function failBlocked(reason) {
  console.error(`[force-edit-acceptance] BLOCKED：${reason}`)
  process.exit(2)
}

function probeDeps() {
  const missing = []
  for (const [name, code] of [
    ['python3', 'pass'],
    ['defusedxml', 'import defusedxml'],
    ['python-docx', 'import docx'],
  ]) {
    const probe = spawnSync(PYTHON, ['-c', code], { stdio: 'pipe' })
    if (probe.status !== 0 || probe.error !== undefined) {
      missing.push(name === 'python3' ? 'python3（可执行文件不存在）'
        : `${name}（pip install -r scripts/requirements.txt）`)
    }
  }
  if (missing.length > 0) failBlocked(`真实 CLI 链路依赖缺失 → ${missing.join('；')}`)
}

/**
 * 生产渲染入口：优先 src/docx-view.ts（node >= 22.6 需 --experimental-strip-types，
 * >= 23.6 原生支持），退化到已构建的 lib/docx-view.js（先 pnpm run build）。
 * 两者都不可用 → 具名阻塞，绝不静默跳过断言。
 */
async function importRenderer() {
  const srcUrl = new URL('../../src/docx-view.ts', import.meta.url)
  try {
    return (await import(srcUrl.href)).renderDocumentWithAnchors
  } catch (srcError) {
    const libUrl = new URL('../../lib/docx-view.js', import.meta.url)
    try {
      return (await import(libUrl.href)).renderDocumentWithAnchors
    } catch (libError) {
      failBlocked(
        `无法加载生产渲染入口：src/docx-view.ts（${srcError.code ?? srcError.message}；`
        + `需 node >= 22.6 且启用 --experimental-strip-types，node >= 23.6 原生支持）；`
        + `lib/docx-view.js（${libError.code ?? libError.message}；需先 pnpm run build）`,
      )
    }
  }
}

function parseArgs(argv) {
  const options = { keep: undefined }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--keep') {
      const value = argv[++i]
      if (value === undefined) failBlocked('--keep 需要目录参数')
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
  return execFileSync(PYTHON, ['-c', script, docxPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  probeDeps()

  const ownedDir = options.keep === undefined
  const dir = options.keep ?? mkdtempSync(path.join(tmpdir(), 'cc-force-edit-acceptance-'))
  mkdirSync(path.join(dir, 'config'), { recursive: true })

  try {
    // 1) 脱敏合成 DOCX
    const genScript = path.join(dir, 'gen-force-edit-fixture.py')
    writeFileSync(genScript, [
      'from docx import Document',
      'd = Document()',
      `d.add_heading(${JSON.stringify(CONTRACT_NAME)}, 0)`,
      ...CONTRACT_PARAGRAPHS.map((text) => `d.add_paragraph(${JSON.stringify(text)})`),
      `d.save(${JSON.stringify(path.join(dir, `${CONTRACT_NAME}.docx`))})`,
    ].join('\n'), 'utf8')
    execFileSync(PYTHON, [genScript], { stdio: 'pipe' })
    const sourceDocx = path.join(dir, `${CONTRACT_NAME}.docx`)

    // 2) force_edit plan
    const planPath = path.join(dir, 'review-plan.json')
    writeFileSync(planPath, `${JSON.stringify(PLAN, null, 2)}\n`, 'utf8')

    // 3) 真实 Python CLI（argv 与 src/python-bridge.ts buildArgv 一致）
    const outputDocx = path.join(dir, 'output', `${CONTRACT_NAME}_reviewed.docx`)
    mkdirSync(path.dirname(outputDocx), { recursive: true })
    const reportDocx = path.join(dir, 'output', `${CONTRACT_NAME}_审查报告.docx`)
    const cli = spawnSync(PYTHON, [
      `${SKILL_ROOT}/scripts/review/apply_review_plan.py`,
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
    ], {
      encoding: 'utf8',
      env: { ...process.env, CONTRACT_COPILOT_CONFIG_DIR: path.join(dir, 'config') },
    })
    const stdout = cli.stdout ?? ''
    console.log(stdout.trim())

    // 4) 核心断言 A：CLI success 且修订 DOCX 的 word/document.xml 同时含 w:ins 与 w:del
    if (cli.status !== 0) {
      console.error(`[force-edit-acceptance] FAIL：apply_review_plan.py exit=${cli.status}\n${cli.stderr ?? ''}`)
      process.exitCode = 1
      return
    }
    const reviewedDocx = /^输出 DOCX: (.+)$/mu.exec(stdout)?.[1]?.trim() ?? outputDocx
    const documentXml = extractDocumentXml(reviewedDocx)
    const hasIns = documentXml.includes('<w:ins ')
    const hasDel = documentXml.includes('<w:del ')
    console.log(`修订 DOCX: ${reviewedDocx}`)
    console.log(`OOXML 断言: w:ins=${hasIns ? 'OK' : 'MISSING'} w:del=${hasDel ? 'OK' : 'MISSING'}`)
    if (!hasIns || !hasDel) {
      console.error('[force-edit-acceptance] FAIL：修订 DOCX 未同时含 w:ins 与 w:del')
      process.exitCode = 1
      return
    }

    // 5) 核心断言 B：生产渲染入口 HTML 同时含 cc-ins 与 cc-del
    const renderDocumentWithAnchors = await importRenderer()
    const html = renderDocumentWithAnchors(documentXml, new Map()).html
    const hasCcIns = /<ins class="cc-ins">[^<]+<\/ins>/.test(html)
    const hasCcDel = /<del class="cc-del">[^<]+<\/del>/.test(html)
    // CLI 落的是最小差异修订：新增实质内容以片段形式合并在场
    const visibleText = html.replace(/<[^>]+>/g, '')
    const hasInserted = visibleText.includes('以合同总价款的百分之二十为限')
    console.log(`工作台投影断言: cc-ins=${hasCcIns ? 'OK' : 'MISSING'} cc-del=${hasCcDel ? 'OK' : 'MISSING'} 插入内容=${hasInserted ? 'OK' : 'MISSING'}`)
    if (!hasCcIns || !hasCcDel || !hasInserted || visibleText.includes(TARGET_TEXT)) {
      console.error('[force-edit-acceptance] FAIL：工作台 HTML 未同时含 cc-ins/cc-del 或插入内容未按最小差异在场')
      process.exitCode = 1
      return
    }

    console.log(`[force-edit-acceptance] PASS：force_edit 修订产物链路验收通过${options.keep === undefined ? '' : `，产物保留在 ${dir}`}`)
  } finally {
    if (ownedDir) rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`[force-edit-acceptance] FAIL：${error?.message ?? error}`)
  process.exitCode = 1
})
