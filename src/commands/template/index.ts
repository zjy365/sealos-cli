import { Command } from 'commander'
import chalk from 'chalk'
import { readFileSync } from 'node:fs'
import { createTemplateClient } from '../../lib/api-client.ts'
import { type ApiErrorBody, mapApiError } from '../../lib/errors.ts'
import { outputJson, outputTable } from '../../lib/output.ts'
import { withAuth, withErrorHandling } from '../../lib/with-auth.ts'

interface TemplateDeployOptions {
  name?: string
  file?: string
  yaml?: string
  set: string[]
  dryRun?: boolean
}

export type TemplateDeployMode = 'catalog' | 'raw'

export function parseSetArgs (sets: string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (const s of sets) {
    const idx = s.indexOf('=')
    if (idx === -1) {
      throw new Error(`Invalid --set format: "${s}". Expected KEY=VALUE`)
    }
    args[s.slice(0, idx)] = s.slice(idx + 1)
  }
  return args
}

function readStdin (): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      reject(new Error('No input provided. Use --file, --yaml, or pipe YAML via stdin.'))
      return
    }
    const chunks: Buffer[] = []
    process.stdin.on('data', (chunk) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8').trim()))
    process.stdin.on('error', reject)
  })
}

async function resolveYaml (options: { file?: string; yaml?: string }, spinner: { stop: () => void; start: (text?: string) => void }): Promise<string> {
  if (options.file) {
    return readFileSync(options.file, 'utf-8')
  }
  if (options.yaml) {
    return options.yaml
  }
  spinner.stop()
  const content = await readStdin()
  spinner.start('Deploying template...')
  return content
}

export function resolveTemplateDeployMode (
  template: string | undefined,
  options: TemplateDeployOptions,
  stdinIsTTY: boolean = process.stdin.isTTY
): TemplateDeployMode {
  const isRaw = !!(options.file || options.yaml || !stdinIsTTY)

  if (template && isRaw) {
    throw new Error('Cannot specify both a template name and --file/--yaml/stdin. Use one or the other.')
  }
  if (!template && !isRaw) {
    throw new Error('Provide a template name or use --file/--yaml/stdin to supply raw YAML.')
  }
  if (template) {
    if (!options.name) {
      throw new Error('--name is required when deploying from the template catalog.')
    }
    if (options.dryRun) {
      throw new Error('--dry-run is only supported for raw template deploys (--file, --yaml, or stdin).')
    }
    return 'catalog'
  }

  return 'raw'
}

export function buildCatalogTemplateDeployBody (
  template: string,
  options: Pick<TemplateDeployOptions, 'name' | 'set'>
): { name: string; template: string; args?: Record<string, string> } {
  const body: { name: string; template: string; args?: Record<string, string> } = {
    name: options.name!,
    template
  }
  if (options.set.length > 0) {
    body.args = parseSetArgs(options.set)
  }
  return body
}

export function buildRawTemplateDeployBody (
  yaml: string,
  options: Pick<TemplateDeployOptions, 'set' | 'dryRun'>
): { yaml: string; args?: Record<string, string>; dryRun?: boolean } {
  const body: { yaml: string; args?: Record<string, string>; dryRun?: boolean } = {
    yaml
  }
  if (options.set.length > 0) {
    body.args = parseSetArgs(options.set)
  }
  if (options.dryRun) {
    body.dryRun = true
  }
  return body
}

export function createTemplateCommand (): Command {
  const tplCmd = new Command('template')
    .alias('tpl')
    .description('Manage templates')

  const deployTemplate = withAuth({
    spinnerText: 'Deploying template...'
  }, async (
    ctx,
    catalogTemplate: string | undefined,
    deployOptions: TemplateDeployOptions,
    deployMode: TemplateDeployMode
  ) => {
    const client = createTemplateClient()

    // ── deploy from catalog ──
    if (deployMode === 'catalog') {
      const body = buildCatalogTemplateDeployBody(catalogTemplate!, deployOptions)
      const { data, error, response } = await client.POST('/templates/instances', {
        headers: ctx.auth,
        body
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      ctx.spinner.succeed(`Instance "${data.name}" created successfully from catalog template "${catalogTemplate}"`)
      console.log(chalk.dim(`  UID:     ${data.uid}`))
      console.log(chalk.dim(`  Created: ${data.createdAt}`))

      if (data.resources && data.resources.length > 0) {
        console.log(chalk.dim('\n  Resources:'))
        const rows: string[][] = [
          [chalk.bold('Name'), chalk.bold('Type'), chalk.bold('CPU'), chalk.bold('Memory'), chalk.bold('Storage')]
        ]
        for (const r of data.resources) {
          rows.push([
            r.name,
            r.resourceType,
            r.quota?.cpu != null ? `${r.quota.cpu} vCPU` : '-',
            r.quota?.memory != null ? `${r.quota.memory} GiB` : '-',
            r.quota?.storage != null ? `${r.quota.storage} GiB` : '-'
          ])
        }
        outputTable(rows)
      }
      return
    }

    // ── deploy from raw YAML ──
    const yamlContent = await resolveYaml(deployOptions, ctx.spinner)
    const body = buildRawTemplateDeployBody(yamlContent, deployOptions)

    const { data, error, response } = await client.POST('/templates/raw', {
      headers: ctx.auth,
      body
    })

    if (error) throw mapApiError(response.status, error as ApiErrorBody)

    if (deployOptions.dryRun) {
      ctx.spinner.succeed('Raw template validation passed; no resources were created')
      console.log(chalk.dim(`  Name: ${data.name}`))
      if (data.resources && data.resources.length > 0) {
        console.log(chalk.dim('\n  Resources that would be created:'))
        for (const r of data.resources) {
          console.log(chalk.dim(`    - ${r.resourceType}: ${r.name}`))
        }
      }
      return
    }

    ctx.spinner.succeed(`Raw template deployed as "${data.name}"`)
    if ('uid' in data) {
      console.log(chalk.dim(`  UID:     ${data.uid}`))
    }
    if ('createdAt' in data) {
      console.log(chalk.dim(`  Created: ${data.createdAt}`))
    }
  })

  // ── list ─────────────────────────────────────────────────────────
  tplCmd
    .command('list')
    .description('List available templates')
    .option('-c, --category <category>', 'Filter by category')
    .option('-o, --output <format>', 'Output format (json|table)', 'table')
    .action(withErrorHandling({ spinnerText: 'Loading templates...' }, async (ctx, options: { category?: string; output: string }) => {
      const client = createTemplateClient()
      const { data, error, response } = await client.GET('/templates', {
        params: { query: {} }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      ctx.spinner.stop()

      let templates = data
      if (options.category) {
        templates = templates.filter((tpl: typeof data[number]) => tpl.category.includes(options.category!))
      }

      if (options.output === 'json') {
        outputJson(templates)
        return
      }

      const rows: string[][] = [
        [chalk.bold('Name'), chalk.bold('Description'), chalk.bold('Category'), chalk.bold('Deploys')]
      ]
      for (const tpl of templates) {
        rows.push([
          tpl.name,
          tpl.description.length > 50 ? tpl.description.slice(0, 47) + '...' : tpl.description,
          tpl.category.join(', '),
          String(tpl.deployCount)
        ])
      }
      outputTable(rows)
    }))

  // ── get ──────────────────────────────────────────────────────────
  tplCmd
    .command('get <name>')
    .alias('describe')
    .description('Get template details')
    .option('-o, --output <format>', 'Output format (json|table)', 'table')
    .action(withErrorHandling({ spinnerText: 'Loading template...' }, async (ctx, name: string, options: { output: string }) => {
      const client = createTemplateClient()
      const { data, error, response } = await client.GET('/templates/{name}', {
        params: {
          path: { name }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      ctx.spinner.stop()

      if (options.output === 'json') {
        outputJson(data)
        return
      }

      console.log(chalk.bold(`\n  ${data.name}\n`))
      console.log(`  ${chalk.dim('Description:')}  ${data.description}`)
      console.log(`  ${chalk.dim('Category:')}     ${data.category.join(', ')}`)
      console.log(`  ${chalk.dim('Git Repo:')}     ${data.gitRepo}`)
      console.log(`  ${chalk.dim('Deploys:')}      ${data.deployCount}`)

      if (data.quota) {
        console.log(`\n  ${chalk.dim('Resources:')}`)
        console.log(`    CPU:       ${data.quota.cpu} vCPU`)
        console.log(`    Memory:    ${data.quota.memory} GiB`)
        console.log(`    Storage:   ${data.quota.storage} GiB`)
        console.log(`    NodePort:  ${data.quota.nodeport}`)
      }

      const argEntries = Object.entries(data.args)
      if (argEntries.length > 0) {
        console.log(`\n  ${chalk.dim('Arguments:')}`)
        const argRows: string[][] = [
          [chalk.bold('Name'), chalk.bold('Type'), chalk.bold('Required'), chalk.bold('Default'), chalk.bold('Description')]
        ]
        for (const [key, arg] of argEntries) {
          argRows.push([
            key,
            arg.type,
            arg.required ? chalk.red('yes') : 'no',
            arg.default || chalk.dim('-'),
            arg.description
          ])
        }
        outputTable(argRows)
      }
    }))

  // ── deploy ──────────────────────────────────────────────────────
  tplCmd
    .command('deploy [template]')
    .description('Deploy a template (from catalog or raw YAML)')
    .option('--name <name>', 'Instance name (required when deploying from catalog)')
    .option('--file <path>', 'Path to template YAML file')
    .option('--yaml <yaml>', 'Template YAML string')
    .option('--set <KEY=VALUE...>', 'Set template arguments', (val: string, prev: string[]) => [...prev, val], [] as string[])
    .option('--dry-run', 'Validate raw template YAML without creating resources')
    .addHelpText('after', `
Examples:
  Catalog:
    sealos template deploy perplexica --name my-app --set OPENAI_API_KEY=xxx

  Raw:
    sealos template deploy --file ./template.yaml --dry-run
    sealos template deploy --yaml 'apiVersion: app.sealos.io/v1\nkind: Template\n...'
    cat template.yaml | sealos template deploy --dry-run
`)
    .action(async (template: string | undefined, options: TemplateDeployOptions) => {
      const mode = resolveTemplateDeployMode(template, options)
      await deployTemplate(template, options, mode)
    })

  return tplCmd
}
