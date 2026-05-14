import { Command } from 'commander'
import { createLoginCommand } from './login.ts'
import { createLogoutCommand } from './logout.ts'
import { createWhoamiCommand } from './whoami.ts'
import { checkAuth, getAuthInfo, listWorkspaces, switchWorkspace } from '../../lib/auth.ts'
import { handleError, AuthError } from '../../lib/errors.ts'
import { outputJson, outputTable, success } from '../../lib/output.ts'

/**
 * Register all authentication related commands
 */
export function registerAuthCommands (program: Command): void {
  program.addCommand(createLoginCommand())
  program.addCommand(createLogoutCommand())
  program.addCommand(createWhoamiCommand())
  program.addCommand(createAuthCommand())
}

export function createAuthCommand (): Command {
  const authCmd = new Command('auth')
    .description('Manage Sealos authentication')

  authCmd
    .command('check')
    .description('Check authentication status')
    .option('-o, --output <format>', 'Output format: json, table', 'json')
    .action(async (options) => {
      try {
        const status = checkAuth()
        if (options.output === 'table') {
          outputTable([
            ['Field', 'Value'],
            ['Authenticated', String(status.authenticated)],
            ['Region', status.region || 'unknown'],
            ['Workspace', status.workspace || 'unknown'],
            ['Kubeconfig', status.kubeconfig_path || 'unknown']
          ])
        } else {
          outputJson(status)
        }
      } catch (error) {
        handleError(error)
      }
    })

  authCmd
    .command('info')
    .description('Show current auth details')
    .option('-o, --output <format>', 'Output format: json, table', 'json')
    .action(async (options) => {
      try {
        const info = getAuthInfo()
        if (!info.authenticated) {
          throw new AuthError()
        }

        if (options.output === 'table') {
          outputTable([
            ['Field', 'Value'],
            ['Authenticated', String(info.authenticated)],
            ['Region', info.region || 'unknown'],
            ['Auth Method', info.auth_method || 'unknown'],
            ['Workspace', info.current_workspace?.id || info.workspace || 'unknown'],
            ['Team', info.current_workspace?.teamName || 'unknown'],
            ['Kubeconfig', info.kubeconfig_path || 'unknown'],
            ['Authenticated At', info.authenticated_at || 'unknown']
          ])
        } else {
          outputJson(info)
        }
      } catch (error) {
        handleError(error)
      }
    })

  authCmd
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

  authCmd
    .command('switch')
    .description('Switch workspace')
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

  return authCmd
}
