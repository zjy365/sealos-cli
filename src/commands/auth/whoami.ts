import { Command } from 'commander'
import { getCurrentContext } from '../../lib/config.ts'
import { info, outputTable } from '../../lib/output.ts'
import { handleError, AuthError } from '../../lib/errors.ts'

export function createWhoamiCommand (): Command {
  return new Command('whoami')
    .description('Display current user information')
    .action(async () => {
      try {
        const context = getCurrentContext()

        if (!context) {
          throw new AuthError()
        }

        // 暂时显示配置中的信息
        const data = [
          ['Field', 'Value'],
          ['Context', context.name],
          ['Host', context.host],
          ['Workspace', context.workspace],
          ['Token', context.token ? '***' + context.token.slice(-8) : 'N/A']
        ]

        outputTable(data)

        info('To get more details, API integration is needed')
      } catch (error) {
        handleError(error)
      }
    })
}
