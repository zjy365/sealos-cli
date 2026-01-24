import { Command } from 'commander'
import { upsertContext } from '../../lib/config.ts'
import { success, error as logError, spinner } from '../../lib/output.ts'
import { handleError } from '../../lib/errors.ts'

export function createLoginCommand (): Command {
  return new Command('login')
    .description('Login to Sealos Cloud')
    .argument('[host]', 'Sealos host (e.g., hzh.sealos.run)')
    .option('-t, --token <token>', 'Login with token')
    .action(async (host, options) => {
      try {
        const spin = spinner('Logging in...')

        // TODO: 实现登录逻辑
        // 1. 如果提供 --token，直接使用 token 登录
        if (options.token) {
          // 直接保存 token
          const context = {
            name: host || 'default',
            host: host ? `https://${host}` : '',
            token: options.token,
            workspace: 'default'
          }
          upsertContext(context)
          spin.succeed(`Logged in to ${host || 'default'}`)
          return
        }

        // 2. 否则唤起浏览器授权
        // TODO: 实现 OAuth 流程
        // - 启动本地 HTTP 服务器监听回调
        // - 打开浏览器到授权页面
        // - 等待回调并获取 token
        // - 保存 token 到配置文件

        // 3. 验证 token 是否有效
        // TODO: 调用 API 验证

        spin.succeed('Login successful')
        success(`You are now logged in to ${host || 'Sealos Cloud'}`)
      } catch (err) {
        logError('Login failed')
        handleError(err)
      }
    })
}
