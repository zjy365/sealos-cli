import { Command } from 'commander'
import { handleError } from '../../lib/errors.ts'

export function createAppCommand (): Command {
  const appCmd = new Command('app')
    .description('Future application placeholder outside the v1 release surface')

  // Future, non-v1 placeholder. Do not register this command until application
  // APIs are implemented and ready for release.

  appCmd
    .command('list')
    .description('Future application list placeholder outside the v1 release surface')
    .action(async () => {
      try {
        console.log('Application commands are not part of the v1 release surface yet.')
      } catch (error) {
        handleError(error)
      }
    })

  return appCmd
}
