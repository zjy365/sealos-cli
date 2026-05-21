import { Command } from 'commander'
import { checkAuth, clearAuth } from '../../lib/auth.ts'
import { outputJson, success, warn } from '../../lib/output.ts'
import { handleError } from '../../lib/errors.ts'

export function createLogoutCommand (): Command {
  return new Command('logout')
    .description('Logout from Sealos Cloud')
    .option('-o, --output <format>', 'Output format: json, table', 'json')
    .action(async (options) => {
      try {
        const status = checkAuth()
        if (!status.authenticated) {
          if (options.output === 'json') {
            outputJson({
              success: true,
              action: 'logout',
              authenticated: false,
              changed: false
            })
            return
          }
          warn('You are not logged in')
          return
        }

        clearAuth()
        if (options.output === 'json') {
          outputJson({
            success: true,
            action: 'logout',
            authenticated: false,
            changed: true
          })
          return
        }
        success('Logged out from Sealos Cloud')
      } catch (error) {
        handleError(error)
      }
    })
}
