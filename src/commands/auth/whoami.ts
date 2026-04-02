import { Command } from 'commander'
import { getCurrentContext } from '../../lib/config.ts'
import { info, warn, outputTable } from '../../lib/output.ts'
import { handleError, AuthError } from '../../lib/errors.ts'
import { createApiClient } from '../../lib/api.ts'

export function createWhoamiCommand (): Command {
  return new Command('whoami')
    .description('Display current user information')
    .action(async () => {
      try {
        const context = getCurrentContext()

        if (!context) {
          throw new AuthError()
        }

        // TODO: 调用 API 获取用户信息
        const api = createApiClient()
        // const userInfo = await api.get('/api/v1/user/info')

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
