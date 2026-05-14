import { Command } from 'commander'
import { getAuthInfo } from '../../lib/auth.ts'
import { outputJson, outputTable } from '../../lib/output.ts'
import { handleError, AuthError } from '../../lib/errors.ts'

export function createWhoamiCommand (): Command {
  return new Command('whoami')
    .description('Display current user information')
    .option('-o, --output <format>', 'Output format: json, table', 'table')
    .action(async (options) => {
      try {
        const authInfo = getAuthInfo()
        if (!authInfo.authenticated) {
          throw new AuthError()
        }

        if (options.output === 'json') {
          outputJson(authInfo)
          return
        }

        const data = [
          ['Field', 'Value'],
          ['Authenticated', 'true'],
          ['Region', authInfo.region || 'unknown'],
          ['Auth Method', authInfo.auth_method || 'unknown'],
          ['Workspace', authInfo.current_workspace?.id || authInfo.workspace || 'unknown'],
          ['Team', authInfo.current_workspace?.teamName || 'unknown'],
          ['Kubeconfig', authInfo.kubeconfig_path || 'unknown'],
          ['Authenticated At', authInfo.authenticated_at || 'unknown']
        ]

        outputTable(data)
      } catch (error) {
        handleError(error)
      }
    })
}
