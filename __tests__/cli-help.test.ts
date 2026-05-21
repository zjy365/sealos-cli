import { execFileSync, spawnSync } from 'node:child_process'
import type { Command } from 'commander'
import { describe, expect, test } from 'vitest'
import packageJson from '../package.json' with { type: 'json' }
import { createProgram } from '../src/main.ts'

interface CommandWithAction {
  _actionHandler?: unknown
}

function collectActionCommands (command: Command, prefix: string[] = []): Array<{ path: string, command: Command }> {
  return command.commands.flatMap(child => {
    const path = [...prefix, child.name()]
    const current = (child as unknown as CommandWithAction)._actionHandler
      ? [{ path: path.join(' '), command: child }]
      : []

    return [
      ...current,
      ...collectActionCommands(child, path)
    ]
  })
}

describe('help output', () => {
  test('top-level help only exposes implemented command modules', () => {
    const help = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })

    expect(help).toMatch(/Usage: sealos-cli/)
    expect(help).toMatch(/auth/)
    expect(help).toMatch(/workspace/)
    expect(help).toMatch(/devbox/)
    expect(help).toMatch(/database/)
    expect(help).toMatch(/template/)
    expect(help).not.toMatch(/\bs3\b/)
    expect(help).not.toMatch(/\bquota\b/)
    expect(help).not.toMatch(/\bapp\b/)
  })

  test('top-level version matches package version', () => {
    const version = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', '--version'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    }).trim()

    expect(version).toBe(packageJson.version)
  })

  test('template deploy help documents raw-only dry-run', () => {
    const help = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'template', 'deploy', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    expect(help).toMatch(/Validate raw template YAML without creating resources/)
    expect(help).toMatch(/Instance name \(defaults to the catalog template name\)/)
    expect(help).toMatch(/sealos-cli template deploy rybbit/)
    expect(help).toMatch(/Catalog:/)
    expect(help).toMatch(/Raw:/)
  })

  test('template deploy validation errors do not print stack traces', () => {
    const result = spawnSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'template', 'deploy', 'rybbit', '--file', './template.yaml'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/Error: Cannot specify both a template name and --file\/--yaml/)
    expect(result.stderr).not.toMatch(/at resolveTemplateDeployMode/)
  })

  test('login help documents token limited mode', () => {
    const help = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'login', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    expect(help).toMatch(/Store a regional token without OAuth device login/)
  })

  test('workspace help documents real workspace commands', () => {
    const workspaceHelp = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'workspace', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    expect(workspaceHelp).toMatch(/switch/)
    expect(workspaceHelp).toMatch(/list/)
    expect(workspaceHelp).toMatch(/current/)

    const listHelp = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'workspace', 'list', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    expect(listHelp).toMatch(/Output format: json, table/)

    const switchHelp = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'workspace', 'switch', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    expect(switchHelp).toMatch(/Workspace id, uid, or team name/)

    const currentHelp = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'workspace', 'current', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    expect(currentHelp).toMatch(/Output format: json, table/)
  })

  test('registered action commands expose JSON as the default output', () => {
    const actionCommands = collectActionCommands(createProgram())
    const missingOutputOption = actionCommands
      .filter(({ command }) => command.options.every(option => option.long !== '--output'))
      .map(({ path }) => path)

    expect(missingOutputOption).toEqual([])

    const nonJsonDefaults = actionCommands
      .map(({ path, command }) => {
        const outputOption = command.options.find(option => option.long === '--output')
        return { path, defaultValue: outputOption?.defaultValue }
      })
      .filter(({ defaultValue }) => defaultValue !== 'json')

    expect(nonJsonDefaults).toEqual([])
  })
})
