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
  output: string
}

export type TemplateDeployMode = 'catalog' | 'raw'

interface TemplateInstanceResource {
  name: string
  uid?: string
  resourceType: string
  quota?: {
    cpu?: number
    memory?: number
    storage?: number
    replicas?: number
  }
}

interface TemplateInstanceResult {
  name: string
  uid?: string
  displayName?: string
  createdAt?: string
  resourceType?: string
  dryRun?: boolean
  args?: Record<string, string>
  resources?: TemplateInstanceResource[]
}

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

function formatValue (value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}

function printInstanceResult (instance: TemplateInstanceResult, options: { template?: string; raw?: boolean; dryRun?: boolean } = {}): void {
  if (options.dryRun) {
    console.log(chalk.dim(`  Name: ${instance.name}`))
  } else {
    console.log(chalk.dim(`  Name:    ${instance.name}`))
    if (instance.displayName) {
      console.log(chalk.dim(`  Display: ${instance.displayName}`))
    }
    if (instance.uid) {
      console.log(chalk.dim(`  UID:     ${instance.uid}`))
    }
    if (instance.createdAt) {
      console.log(chalk.dim(`  Created: ${instance.createdAt}`))
    }
    if (options.template) {
      console.log(chalk.dim(`  Template:${options.template}`))
    }
  }

  const argEntries = Object.entries(instance.args ?? {})
  if (argEntries.length > 0) {
    console.log(chalk.dim('\n  Arguments:'))
    outputTable([
      [chalk.bold('Name'), chalk.bold('Value')],
      ...argEntries.map(([key, value]) => [key, value])
    ])
  }

  if (instance.resources && instance.resources.length > 0) {
    console.log(chalk.dim(options.dryRun ? '\n  Resources that would be created:' : '\n  Resources:'))
    outputTable([
      [chalk.bold('Name'), chalk.bold('Type'), chalk.bold('UID'), chalk.bold('CPU'), chalk.bold('Memory'), chalk.bold('Storage'), chalk.bold('Replicas')],
      ...instance.resources.map(resource => [
        formatValue(resource.name),
        formatValue(resource.resourceType),
        formatValue(resource.uid),
        resource.quota?.cpu != null ? `${resource.quota.cpu} vCPU` : '-',
        resource.quota?.memory != null ? `${resource.quota.memory} GiB` : '-',
        resource.quota?.storage != null ? `${resource.quota.storage} GiB` : '-',
        formatValue(resource.quota?.replicas)
      ])
    ])
  }
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

      if (deployOptions.output === 'json') {
        ctx.spinner.stop()
        outputJson(data)
        return
      }
      ctx.spinner.succeed(`Instance "${data.name}" created successfully`)
      printInstanceResult(data, { template: catalogTemplate })
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

    if (deployOptions.output === 'json') {
      ctx.spinner.stop()
      outputJson(data)
      return
    }

    if (deployOptions.dryRun) {
      ctx.spinner.succeed('Raw template validation passed; no resources were created')
      printInstanceResult(data, { raw: true, dryRun: true })
      return
    }

    ctx.spinner.succeed(`Raw template deployed as "${data.name}"`)
    printInstanceResult(data, { raw: true })
  })

  // ── list ─────────────────────────────────────────────────────────
  tplCmd
    .command('list')
    .description('List available templates')
    .option('-c, --category <category>', 'Filter by category')
    .option('-l, --language <language>', 'Language code (for example: en, zh)')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withErrorHandling({ spinnerText: 'Loading templates...' }, async (ctx, options: { category?: string; language?: string; output: string }) => {
      const client = createTemplateClient()
      const { data, error, response } = await client.GET('/templates', {
        params: { query: options.language ? { language: options.language } : {} }
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
    .option('-l, --language <language>', 'Language code (for example: en, zh)')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withErrorHandling({ spinnerText: 'Loading template...' }, async (ctx, name: string, options: { language?: string; output: string }) => {
      const client = createTemplateClient()
      const { data, error, response } = await client.GET('/templates/{name}', {
        params: {
          path: { name },
          query: options.language ? { language: options.language } : {}
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

  // -- delete --------------------------------------------------------
  tplCmd
    .command('delete <instance>')
    .alias('rm')
    .description('Delete a deployed template instance')
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .action(withAuth({ spinnerText: 'Deleting template instance...' }, async (ctx, instance: string, options: { output: string }) => {
      const client = createTemplateClient()
      const { error, response } = await client.DELETE('/templates/instances/{instanceName}', {
        headers: ctx.auth,
        params: {
          path: { instanceName: instance }
        }
      })

      if (error) throw mapApiError(response.status, error as ApiErrorBody)

      if (options.output === 'json') {
        ctx.spinner.stop()
        outputJson({
          success: true,
          action: 'delete',
          resource: 'template-instance',
          instance,
          status: 'deleted'
        })
        return
      }
      ctx.spinner.succeed(`Instance "${instance}" deleted`)
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
    .option('-o, --output <format>', 'Output format (json|table)', 'json')
    .addHelpText('after', `
Examples:
  Catalog:
    sealos-cli template deploy perplexica --name my-app --set OPENAI_API_KEY=xxx

  Raw:
    sealos-cli template deploy --file ./template.yaml --dry-run
    sealos-cli template deploy --yaml 'apiVersion: app.sealos.io/v1\nkind: Template\n...'
    cat template.yaml | sealos-cli template deploy --dry-run
`)
    .action(async (template: string | undefined, options: TemplateDeployOptions) => {
      const mode = resolveTemplateDeployMode(template, options)
      await deployTemplate(template, options, mode)
    })

  return tplCmd
}
