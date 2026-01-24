import { Command } from 'commander'
import { handleError } from '../../lib/errors.ts'

export function createTemplateCommand (): Command {
  const tplCmd = new Command('template')
    .alias('tpl')
    .description('Manage templates')

  // TODO: 实现模板相关命令

  tplCmd
    .command('list')
    .description('List available templates')
    .action(async () => {
      try {
        console.log('TODO: Implement template list')
      } catch (error) {
        handleError(error)
      }
    })

  return tplCmd
}
