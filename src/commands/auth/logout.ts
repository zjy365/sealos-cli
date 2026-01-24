import { Command } from 'commander'
import { getCurrentContext, removeContext } from '../../lib/config.ts'
import { success, warn } from '../../lib/output.ts'
import { handleError } from '../../lib/errors.ts'

export function createLogoutCommand (): Command {
  return new Command('logout')
    .description('Logout from Sealos Cloud')
    .action(async () => {
      try {
        const context = getCurrentContext()

        if (!context) {
          warn('You are not logged in')
          return
        }

        // TODO: 可选：调用 API 撤销 token

        removeContext(context.name)
        success(`Logged out from ${context.name}`)
      } catch (error) {
        handleError(error)
      }
    })
}
