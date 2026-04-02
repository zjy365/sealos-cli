import { Command } from 'commander'
import { getCurrentContext } from '../../lib/config.ts'
import { success, outputTable, info } from '../../lib/output.ts'
import { handleError, AuthError } from '../../lib/errors.ts'

export function createWorkspaceCommand (): Command {
  const workspaceCmd = new Command('workspace')
    .alias('ws')
    .description('Manage workspaces')

  // workspace switch
  workspaceCmd
    .command('switch')
    .description('Switch to another workspace')
    .argument('<name>', 'Workspace name')
    .action(async (name) => {
      try {
        // TODO: 调用 API 验证 workspace 是否存在
        // const api = createApiClient()
        // await api.get(`/api/v1/workspaces/${name}`)

        // 更新配置
        const context = getCurrentContext()
        if (context) {
          context.workspace = name
          // TODO: 更新到配置文件
        }

        success(`Switched to workspace: ${name}`)
      } catch (error) {
        handleError(error)
      }
    })

  // workspace list
  workspaceCmd
    .command('list')
    .description('List all workspaces')
    .action(async () => {
      try {
        const context = getCurrentContext()
        if (!context) {
          throw new AuthError()
        }

        // TODO: 调用 API 获取 workspace 列表
        // 示例数据
        const data = [
          ['NAME', 'STATUS', 'CURRENT'],
          ['default', 'Active', context.workspace === 'default' ? '*' : ''],
          ['production', 'Active', context.workspace === 'production' ? '*' : '']
        ]

        outputTable(data)
        info('API integration needed for real data')
      } catch (error) {
        handleError(error)
      }
    })

  // workspace current
  workspaceCmd
    .command('current')
    .description('Show current workspace')
    .action(async () => {
      try {
        const context = getCurrentContext()
        if (!context) {
          throw new AuthError()
        }

        const data = [
          ['Field', 'Value'],
          ['Workspace', context.workspace],
          ['Context', context.name]
        ]

        outputTable(data)
      } catch (error) {
        handleError(error)
      }
    })

  return workspaceCmd
}
