import { Command } from 'commander'
import { getAuthInfo, listWorkspaces, switchWorkspace } from '../../lib/auth.ts'
import { success, outputJson, outputTable } from '../../lib/output.ts'
import { handleError, AuthError } from '../../lib/errors.ts'

export function createWorkspaceCommand (): Command {
  const workspaceCmd = new Command('workspace')
    .alias('ws')
    .description('Manage workspaces')

  workspaceCmd
    .command('switch')
    .description('Switch to another workspace')
    .argument('<namespace>', 'Workspace id, uid, or team name')
    .option('-o, --output <format>', 'Output format: json, table', 'table')
    .action(async (namespace, options) => {
      try {
        const result = await switchWorkspace(namespace)
        if (options.output === 'json') {
          outputJson(result)
          return
        }

        success(`Switched to workspace: ${result.workspace.id || result.workspace.uid || namespace}`)
      } catch (error) {
        handleError(error)
      }
    })

  workspaceCmd
    .command('list')
    .description('List all workspaces')
    .option('-o, --output <format>', 'Output format: json, table', 'table')
    .action(async (options) => {
      try {
        const result = await listWorkspaces()
        if (options.output === 'json') {
          outputJson(result)
          return
        }

        outputTable([
          ['UID', 'ID', 'TEAM', 'ROLE', 'TYPE', 'CURRENT'],
          ...result.workspaces.map(workspace => [
            workspace.uid || '',
            workspace.id || '',
            workspace.teamName || '',
            workspace.role || '',
            workspace.nstype || '',
            workspace.id === result.current ? '*' : ''
          ])
        ])
      } catch (error) {
        handleError(error)
      }
    })

  workspaceCmd
    .command('current')
    .description('Show current workspace')
    .option('-o, --output <format>', 'Output format: json, table', 'table')
    .action(async (options) => {
      try {
        const authInfo = getAuthInfo()
        if (!authInfo.authenticated) {
          throw new AuthError()
        }

        const workspace = authInfo.current_workspace || null
        const result = {
          workspace,
          region: authInfo.region || 'unknown',
          kubeconfig_path: authInfo.kubeconfig_path || 'unknown'
        }

        if (options.output === 'json') {
          outputJson(result)
          return
        }

        outputTable([
          ['Field', 'Value'],
          ['Workspace', workspace?.id || authInfo.workspace || 'unknown'],
          ['Team', workspace?.teamName || 'unknown'],
          ['Region', authInfo.region || 'unknown'],
          ['Kubeconfig', authInfo.kubeconfig_path || 'unknown']
        ])
      } catch (error) {
        handleError(error)
      }
    })

  return workspaceCmd
}
