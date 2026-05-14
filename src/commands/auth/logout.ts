import { Command } from 'commander'
import { checkAuth, clearAuth } from '../../lib/auth.ts'
import { success, warn } from '../../lib/output.ts'
import { handleError } from '../../lib/errors.ts'

export function createLogoutCommand (): Command {
  return new Command('logout')
    .description('Logout from Sealos Cloud')
    .action(async () => {
      try {
        const status = checkAuth()
        if (!status.authenticated) {
          warn('You are not logged in')
          return
        }

        clearAuth()
        success('Logged out from Sealos Cloud')
      } catch (error) {
        handleError(error)
      }
    })
}
