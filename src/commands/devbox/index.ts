import { Command } from 'commander'
import { getCurrentContext } from '../../lib/config.ts'
import { success, spinner, outputTable, formatOutput, info } from '../../lib/output.ts'
import { handleError, AuthError } from '../../lib/errors.ts'

export function createDevboxCommand (): Command {
  const devboxCmd = new Command('devbox')
    .alias('dev')
    .description('Manage devbox instances')

  // devbox create
  devboxCmd
    .command('create')
    .description('Create a new devbox')
    .argument('[path]', 'Project path', '.')
    .option('--name <name>', 'Devbox name')
    .option('--template <template>', 'Template to use', 'default')
    .option('--cpu <cpu>', 'CPU configuration', '1c')
    .option('--memory <memory>', 'Memory configuration', '2g')
    .option('--port <port>', 'Port number')
    .option('--config <config>', 'Config file path')
    .action(async (path, options) => {
      try {
        const context = getCurrentContext()
        if (!context) {
          throw new AuthError()
        }

        const spin = spinner('Creating devbox...')

        // TODO: 实现创建 devbox
        // 1. 读取配置文件（如果有）
        // 2. 调用 API 创建 devbox
        // const result = await api.post('/api/v1/devbox', {
        //   name: options.name,
        //   template: options.template,
        //   resources: {
        //     cpu: options.cpu,
        //     memory: options.memory
        //   }
        // })

        // 3. 等待创建完成
        // 4. 返回访问地址

        spin.succeed('Devbox created successfully')
        success('Devbox URL: https://example.sealos.run')
        info(`Run "sealos devbox connect ${options.name || 'devbox'}" to connect`)
      } catch (error) {
        handleError(error)
      }
    })

  // devbox list
  devboxCmd
    .command('list')
    .description('List all devboxes')
    .option('-o, --output <format>', 'Output format: json, yaml, table', 'table')
    .option('--selector <selector>', 'Label selector')
    .action(async (options) => {
      try {
        const context = getCurrentContext()
        if (!context) {
          throw new AuthError()
        }

        // 示例数据
        const data = [
          ['NAME', 'STATUS', 'CPU', 'MEMORY', 'CREATED'],
          ['my-devbox', 'Running', '2c', '4g', '2h ago'],
          ['test-box', 'Stopped', '1c', '2g', '1d ago']
        ]

        if (options.output === 'json') {
          formatOutput({ items: data.slice(1) }, 'json')
        } else if (options.output === 'yaml') {
          formatOutput({ items: data.slice(1) }, 'yaml')
        } else {
          outputTable(data)
        }
      } catch (error) {
        handleError(error)
      }
    })

  // devbox get
  devboxCmd
    .command('get')
    .description('Get devbox details')
    .argument('<name>', 'Devbox name')
    .action(async (name) => {
      try {
        const context = getCurrentContext()
        if (!context) {
          throw new AuthError()
        }

        const data = [
          ['Field', 'Value'],
          ['Name', name],
          ['Status', 'Running'],
          ['CPU', '2c'],
          ['Memory', '4g'],
          ['URL', 'https://example.sealos.run']
        ]

        outputTable(data)
      } catch (error) {
        handleError(error)
      }
    })

  // devbox start/stop/restart/delete
  const actions = ['start', 'stop', 'restart', 'delete']
  actions.forEach(action => {
    const cmd = devboxCmd
      .command(action)
      .description(`${action.charAt(0).toUpperCase() + action.slice(1)} a devbox`)
      .argument('<name>', 'Devbox name')

    if (action === 'delete') {
      cmd.option('-f, --force', 'Force delete without confirmation')
    }

    cmd.action(async (name, options) => {
      try {
        const context = getCurrentContext()
        if (!context) {
          throw new AuthError()
        }

        const spin = spinner(`${action}ing devbox...`)

        // TODO: 实现对应操作
        spin.succeed(`Devbox ${action}ed successfully`)
      } catch (error) {
        handleError(error)
      }
    })
  })

  // devbox connect
  devboxCmd
    .command('connect')
    .description('Connect to a devbox')
    .argument('<name>', 'Devbox name')
    .option('--ide <ide>', 'IDE type: vscode, cursor', 'vscode')
    .action(async (name, options) => {
      try {
        const context = getCurrentContext()
        if (!context) {
          throw new AuthError()
        }

        // TODO: 实现连接 devbox
        // 1. 获取 devbox 信息
        // 2. 根据 IDE 类型打开对应的连接

        info(`Opening ${name} in ${options.ide}...`)
        success(`Connect URL: ${options.ide}://remote-ssh/devbox-${name}`)
      } catch (error) {
        handleError(error)
      }
    })

  // devbox publish
  devboxCmd
    .command('publish')
    .description('Publish a devbox')
    .argument('<name>', 'Devbox name')
    .action(async (name) => {
      try {
        const context = getCurrentContext()
        if (!context) {
          throw new AuthError()
        }

        const spin = spinner('Publishing devbox...')

        // TODO: 实现发布 devbox
        spin.succeed('Devbox published successfully')
      } catch (error) {
        handleError(error)
      }
    })

  // devbox template 子命令
  const templateCmd = devboxCmd
    .command('template')
    .description('Manage devbox templates')

  templateCmd
    .command('build')
    .description('Build a devbox template')
    .option('--name <name>', 'Template name')
    .action(async (options) => {
      try {
        // TODO: 实现构建 template
        info('Building template...')
      } catch (error) {
        handleError(error)
      }
    })

  templateCmd
    .command('list')
    .description('List devbox templates')
    .action(async () => {
      try {
        // TODO: 列出 devbox templates
        const data = [
          ['NAME', 'DESCRIPTION', 'VERSION'],
          ['nextjs', 'Next.js development environment', '1.0.0'],
          ['python', 'Python 3.11 environment', '1.0.0']
        ]

        outputTable(data)
      } catch (error) {
        handleError(error)
      }
    })

  return devboxCmd
}
