/** Browser adapter tests for authenticated Contract Copilot workbench calls. */

import { describe, expect, it, vi } from 'vitest'
import { ContractCopilotClient, type WorkbenchConnection } from '../src/client/api.ts'
import { WORKBENCH_RPC_CHANNEL } from '../src/workbench-protocol.ts'

describe('ContractCopilotClient', () => {
  it('通过插件自有 RPC channel 调用 state', async () => {
    const call = vi.fn().mockResolvedValue({ ok: true, value: { sessions: [] } })
    const client = new ContractCopilotClient({ rpc: { call } } as WorkbenchConnection)

    await expect(client.state()).resolves.toEqual({ sessions: [] })
    expect(call).toHaveBeenCalledWith(WORKBENCH_RPC_CHANNEL, 'state', {}, undefined)
  })

  it('保留 Host 失败码与消息', async () => {
    const connection = {
      rpc: {
        call: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'contract-copilot/not-found', message: 'session 不存在', details: {} },
        }),
      },
    }
    const client = new ContractCopilotClient(connection)

    await expect(client.detail('missing')).rejects.toThrow('contract-copilot/not-found: session 不存在')
  })

  it('下载 URL 编码 session 与产物类型', () => {
    const client = new ContractCopilotClient({ rpc: { call: vi.fn() } } as WorkbenchConnection)
    const url = new URL(client.downloadUrl('合同-20260904', 'reviewed'))

    expect(url.pathname).toBe('/api/contract-copilot.download')
    expect(url.searchParams.get('sessionId')).toBe('合同-20260904')
    expect(url.searchParams.get('kind')).toBe('reviewed')
  })
})
