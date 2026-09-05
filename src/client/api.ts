/** Authenticated browser adapter for the Contract Copilot Host data plane. */

import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client'
import {
  WORKBENCH_DOWNLOAD_PATH,
  WORKBENCH_EVENTS_PATH,
  WORKBENCH_RPC_CHANNEL,
  type DocumentView,
  type ApprovePlanResult,
  type FindingDecisionRequest,
  type RecheckResult,
  type SessionDetail,
  type StartReviewResult,
  type WorkbenchRpcEndpoint,
  type WorkbenchRpcMap,
  type WorkbenchState,
} from '../workbench-protocol.ts'

interface WorkbenchRpc {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<ConnectionRpcResult<unknown>>
}

/** Client Connection subset used by the workbench. */
export interface WorkbenchConnection {
  readonly rpc: WorkbenchRpc
}

/** Convert a Host RPC failure into one stable browser error. */
function rpcError(endpoint: string, result: Extract<ConnectionRpcResult<unknown>, { readonly ok: false }>): Error {
  return new Error(`${result.error.code}: ${result.error.message}`, {
    cause: { endpoint, details: result.error.details },
  })
}

/** Typed client over the Connection-owned authenticated transport. */
export class ContractCopilotClient {
  constructor(private readonly connection: WorkbenchConnection) {}

  state(signal?: AbortSignal): Promise<WorkbenchState> {
    return this.call('state', {}, signal)
  }

  detail(sessionId: string, signal?: AbortSignal): Promise<SessionDetail> {
    return this.call('detail', { sessionId }, signal)
  }

  document(sessionId: string, signal?: AbortSignal): Promise<DocumentView> {
    return this.call('document', { sessionId }, signal)
  }

  submitAnswers(sessionId: string, fields: Record<string, string>, signal?: AbortSignal): Promise<{ readonly ok: true }> {
    return this.call('answers', { sessionId, fields }, signal)
  }

  approvePlan(
    sessionId: string,
    sourcePlanHash: string,
    decisions: FindingDecisionRequest[],
    signal?: AbortSignal,
  ): Promise<ApprovePlanResult> {
    return this.call('approve', { sessionId, sourcePlanHash, decisions }, signal)
  }

  startReview(contractPath: string, signal?: AbortSignal): Promise<StartReviewResult> {
    return this.call('start', { contractPath }, signal)
  }

  recheck(sessionId: string, newContractPath: string, signal?: AbortSignal): Promise<RecheckResult> {
    return this.call('recheck', { sessionId, newContractPath }, signal)
  }

  runAnalysis(sessionId: string, signal?: AbortSignal): Promise<WorkbenchRpcMap['run-analysis']['output']> {
    return this.call('run-analysis', { sessionId }, signal)
  }

  runDelivery(sessionId: string, signal?: AbortSignal): Promise<WorkbenchRpcMap['run-delivery']['output']> {
    return this.call('run-delivery', { sessionId }, signal)
  }

  cancel(sessionId: string, signal?: AbortSignal): Promise<{ readonly accepted: true }> {
    return this.call('cancel', { sessionId }, signal)
  }

  /** Same-origin EventSource URL protected by the Connection browser cookie. */
  eventsUrl(): string {
    return WORKBENCH_EVENTS_PATH
  }

  /** Same-origin download URL protected by the Connection browser cookie. */
  downloadUrl(sessionId: string, kind: 'reviewed' | 'report' | 'source'): string {
    const url = new URL(WORKBENCH_DOWNLOAD_PATH, hostBase())
    url.searchParams.set('sessionId', sessionId)
    url.searchParams.set('kind', kind)
    return url.toString()
  }

  private async call<Endpoint extends WorkbenchRpcEndpoint>(
    endpoint: Endpoint,
    payload: WorkbenchRpcMap[Endpoint]['input'],
    signal?: AbortSignal,
  ): Promise<WorkbenchRpcMap[Endpoint]['output']> {
    const result = await this.connection.rpc.call(WORKBENCH_RPC_CHANNEL, endpoint, payload, signal)
    if (!result.ok) throw rpcError(endpoint, result)
    return result.value as WorkbenchRpcMap[Endpoint]['output']
  }
}

function hostBase(): string {
  const origin = (globalThis as { readonly location?: { readonly origin?: string } }).location?.origin
  return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'
}
