import { Command } from 'commander'
import { handleError } from '../../lib/errors.ts'

export function createQuotaCommand (): Command {
  const quotaCmd = new Command('quota')
    .description('View resource quotas')

  // TODO: 实现配额相关命令

  quotaCmd
    .command('get')
    .description('Get quota information')
    .action(async () => {
      try {
        console.log('TODO: Implement quota get')
      } catch (error) {
        handleError(error)
      }
    })

  return quotaCmd
}
