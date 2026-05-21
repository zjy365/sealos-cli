import { Command } from 'commander'
import { handleError } from '../../lib/errors.ts'

export function createQuotaCommand (): Command {
  const quotaCmd = new Command('quota')
    .description('Future quota placeholder outside the v1 release surface')

  // Future, non-v1 placeholder. Do not register this command until quota APIs
  // are implemented and ready for release.

  quotaCmd
    .command('get')
    .description('Get quota information')
    .action(async () => {
      try {
        console.log('Quota commands are not part of the v1 release surface yet.')
      } catch (error) {
        handleError(error)
      }
    })

  return quotaCmd
}
