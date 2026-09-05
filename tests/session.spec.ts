/**
 * session 状态机单测：create / transition / 原子落盘 / 损坏恢复 / version 拒绝 /
 * latestByContractKey 索引。文件落盘用 os.tmpdir() 子目录。
 */

import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionStore, type ContractSession } from '../src/session.ts'

let dir: string
let store: SessionStore

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'cc-session-'))
  store = new SessionStore(dir)
})

afterEach(() => {
  // mkdtemp 的临时目录由系统回收；本测试只关心 store 自身行为。
})

describe('create + get', () => {
  it('create 返回 created 状态、归一化 contractKey（与 Python _normalize_lookup_key 行为一致：`.` 也是非字母数字字符）', () => {
    const session = store.create('/tmp/合同 V2.docx', '合同 V2.docx')
    expect(session.state).toBe('created')
    expect(session.contractName).toBe('合同 V2.docx')
    expect(session.contractKey).toBe('合同v2docx') // 与 Python re.sub(r'[\W_]+', '', ...) 完全一致
    expect(session.history).toEqual([])
    expect(session.progressCounter).toBe(0)
  })

  it('create 原子写入 <id>.json（落盘内容是合法 JSON）', () => {
    const session = store.create('/tmp/x.docx', 'x.docx')
    const file = path.join(dir, `${session.id}.json`)
    const raw = readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw)
    expect(parsed.id).toBe(session.id)
  })

  it('get 返回内存副本与磁盘一致；第二次 get 不再读盘', () => {
    const session = store.create('/tmp/y.docx', 'y.docx')
    const fromMem = store.get(session.id)
    expect(fromMem?.contractName).toBe('y.docx')
  })
})

describe('transition', () => {
  it('合法跃迁写历史并递增 progressCounter', () => {
    const session = store.create('/tmp/z.docx', 'z.docx')
    store.transition(session.id, 'contract_copilot_intake', 'intake_done')
    const got = store.get(session.id)
    expect(got?.state).toBe('intake_done')
    expect(got?.progressCounter).toBe(1)
    expect(got?.history).toEqual([
      expect.objectContaining({ tool: 'contract_copilot_intake', from: 'created', to: 'intake_done' }),
    ])
  })

  it('mutate 回调可写 intake 等附加数据', () => {
    const session = store.create('/tmp/z.docx', 'z.docx')
    store.transition(session.id, 'contract_copilot_intake', 'intake_done', (target) => {
      target.intake = {
        clientName: '客户',
        partyRole: '甲方',
        reviewPurpose: '签约前把关',
        reviewIntensity: '常规',
        editPolicy: 'revise-first',
        reviewer: { author: '杨卫薪', organization: '示例律所' },
      }
    })
    expect(store.get(session.id)?.intake?.clientName).toBe('客户')
  })

  it('对不存在的 session 抛错（misconfiguration fails loud）', () => {
    expect(() => store.transition('no-such-id', 'x', 'applied')).toThrow(/session 不存在/)
  })
})

describe('artifactsDir + session 文件损坏', () => {
  it('artifactsDir 惰性创建子目录', () => {
    const session = store.create('/tmp/w.docx', 'w.docx')
    const dir = store.artifactsDir(session.id)
    // 子目录存在且路径在 sessions 根下
    expect(dir.endsWith(session.id)).toBe(true)
  })

  it('读到非法 JSON → 改名留证 + 重新抛出（§6.4）', () => {
    // 关键：用新 store（不用内存缓存）才能让 loadFromDisk 真的跑一遍
    const session = store.create('/tmp/q.docx', 'q.docx')
    const file = path.join(dir, `${session.id}.json`)
    writeFileSync(file, '{not json', 'utf8')
    const fresh = new SessionStore(dir)
    expect(() => fresh.get(session.id)).toThrow(/session 文件损坏/)
    // 留证文件出现
    const siblings = require('node:fs').readdirSync(dir) as string[]
    expect(siblings.some((name) => name.startsWith(`${session.id}.json.corrupt-`))).toBe(true)
  })

  it('version 不匹配 → 拒绝加载', () => {
    const session = store.create('/tmp/p.docx', 'p.docx')
    const file = path.join(dir, `${session.id}.json`)
    writeFileSync(file, JSON.stringify({ ...session, version: 99 }), 'utf8')
    const fresh = new SessionStore(dir)
    expect(() => fresh.get(session.id)).toThrow(/session 版本不支持/)
  })
})

describe('latestByContractKey', () => {
  it('按合同名归一化 key 命中最近 session（id 前缀比对）', () => {
    const session = store.create('/tmp/Sale.docx', 'Sale.docx')
    // 归一化后 'Sale.docx' -> 'saledocx'；id 形如 saledocx-<时间戳>
    const got = store.latestByContractKey('saledocx')
    expect(got?.id).toBe(session.id)
  })

  it('空字符串 contractKey → undefined', () => {
    expect(store.latestByContractKey('')).toBeUndefined()
    expect(store.latestByContractKey('   ')).toBeUndefined()
  })

  it('不同合同不会误命中', () => {
    store.create('/tmp/Sale.docx', 'Sale.docx')
    const result = store.latestByContractKey('purchasecontractdocx')
    expect(result).toBeUndefined()
  })
})

describe('同合同同秒多次建案 id 唯一（CC-V5-007）', () => {
  // 固定时钟：所有 create 落在同一秒，逼出同秒 id 碰撞路径；不依赖真实计时。
  const PINNED = new Date('2026-09-05T08:30:00.000Z')
  // 'Sale.docx' -> 'saledocx'；时间戳是 toISOString 去符号后的前 14 位
  const BASE = 'saledocx-20260905083000'

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(PINNED)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('连续 create 同合同 12 次：id、内存对象、磁盘 JSON 逐个唯一，早期内容不被覆盖', () => {
    const ids = Array.from({ length: 12 }, (_, i) => {
      const session = store.create('/tmp/Sale.docx', 'Sale.docx')
      // 每个 session 写入独立标记 + 跃迁；若 id 被后续 create 覆盖，标记即丢失
      store.transition(session.id, 'contract_copilot_intake', 'intake_done', (target) => {
        target.pendingAnswers = { marker: `#${i}` }
      })
      return session.id
    })

    // id 确定且唯一：base、base-2 … base-12（首个空位顺序分配）
    expect(ids).toEqual(Array.from({ length: 12 }, (_, i) => (i === 0 ? BASE : `${BASE}-${i + 1}`)))
    expect(new Set(ids).size).toBe(12)

    ids.forEach((id, i) => {
      // 内存对象未被覆盖
      const fromMem = store.get(id)
      expect(fromMem?.id).toBe(id)
      expect(fromMem?.pendingAnswers?.marker).toBe(`#${i}`)
      expect(fromMem?.progressCounter).toBe(1)
      // 磁盘 JSON 未被覆盖
      const parsed = JSON.parse(readFileSync(path.join(dir, `${id}.json`), 'utf8')) as ContractSession
      expect(parsed.id).toBe(id)
      expect(parsed.pendingAnswers?.marker).toBe(`#${i}`)
      expect(parsed.progressCounter).toBe(1)
    })
    // 12 个独立落盘文件，而不是少数文件被反复改写
    const files = readdirSync(dir).filter((name) => name.endsWith('.json'))
    expect(files).toHaveLength(12)
  })

  it('冷启动恢复：sessionsDir 已有 base/base-2/base-3 → 下一个 id 跳到 base-4', () => {
    const warmer = new SessionStore(dir)
    expect(warmer.create('/tmp/Sale.docx', 'Sale.docx').id).toBe(BASE)
    expect(warmer.create('/tmp/Sale.docx', 'Sale.docx').id).toBe(`${BASE}-2`)
    expect(warmer.create('/tmp/Sale.docx', 'Sale.docx').id).toBe(`${BASE}-3`)

    // 模拟重启：新 store 内存为空，仅凭磁盘 JSON 判定占用
    const cold = new SessionStore(dir)
    expect(cold.create('/tmp/Sale.docx', 'Sale.docx').id).toBe(`${BASE}-4`)
  })

  it('磁盘占用有空位：base 与 base-3 已占、base-2 空缺 → 下一个 id 取首个空位 base-2', () => {
    for (const id of [BASE, `${BASE}-3`]) {
      const seeded: ContractSession = {
        version: 1,
        id,
        contractPath: '/tmp/Sale.docx',
        contractKey: 'saledocx',
        contractName: 'Sale.docx',
        state: 'created',
        outputs: {},
        progressCounter: 0,
        lastInjectedCounter: 0,
        history: [],
        createdAt: PINNED.toISOString(),
        updatedAt: PINNED.toISOString(),
      }
      writeFileSync(path.join(dir, `${id}.json`), `${JSON.stringify(seeded, null, 2)}\n`, 'utf8')
    }
    const cold = new SessionStore(dir)
    expect(cold.create('/tmp/Sale.docx', 'Sale.docx').id).toBe(`${BASE}-2`)
  })
})
