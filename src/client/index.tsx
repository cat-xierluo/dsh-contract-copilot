/** Contract Copilot browser entry registered through DSH's official sidebar slot. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { ContractCopilotClient } from './api.ts'
import { RailEntryButton, type WorkbenchFace } from './Workbench.tsx'

/** Client services required by the authenticated workbench entry. */
export const inject = ['slots', 'connection']

/** Register one additive action at the bottom of the shipped sidebar. */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  const client = new ContractCopilotClient(connection)
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'contract-copilot',
    order: 50,
    label: '合同审查',
    inject: (): WorkbenchFace => ({ client }),
  }, RailEntryButton))
}
