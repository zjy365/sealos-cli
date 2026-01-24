import { Command } from 'commander'
import { handleError } from '../../lib/errors.ts'

export function createAppCommand (): Command {
  const appCmd = new Command('app')
    .description('Manage applications')

  // TODO: 实现应用相关命令

  appCmd
    .command('list')
    .description('List all applications')
    .action(async () => {
      try {
        console.log('TODO: Implement app list')
      } catch (error) {
        handleError(error)
      }
    })

  return appCmd
}
