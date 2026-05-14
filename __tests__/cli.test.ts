import { execFileSync } from 'node:child_process'
import { describe, expect, test } from 'vitest'
import { resolveDbproviderHost, resolveTemplateProviderHost } from '../src/lib/api-client.ts'
import { createDatabaseCommand } from '../src/commands/database/index.ts'
import {
  buildAutoBackup,
  buildQuota,
  collectOption,
  extractVersionsMap,
  normalizeDatabaseType,
  normalizeLogDbType,
  normalizeLogType,
  parseIntegerValue,
  parseKeyValueArgs,
  parseNumericValue,
  summarizeVersions
} from '../src/commands/database/index.ts'
import {
  buildCatalogTemplateDeployBody,
  buildRawTemplateDeployBody,
  resolveTemplateDeployMode
} from '../src/commands/template/index.ts'

describe('template deploy validation', () => {
  test('rejects dry-run for catalog deploys', () => {
    expect(() => {
      resolveTemplateDeployMode('perplexica', {
        name: 'app',
        set: [],
        dryRun: true
      }, true)
    }).toThrow(/--dry-run is only supported for raw template deploys/)
  })

  test('rejects mixed catalog and raw inputs', () => {
    expect(() => {
      resolveTemplateDeployMode('perplexica', {
        name: 'app',
        file: './template.yaml',
        set: []
      }, true)
    }).toThrow(/Cannot specify both a template name and --file\/--yaml\/stdin/)
  })

  test('requires --name for catalog deploys', () => {
    expect(() => {
      resolveTemplateDeployMode('perplexica', {
        set: []
      }, true)
    }).toThrow(/--name is required when deploying from the template catalog/)
  })

  test('builds catalog deploy request body without dryRun', () => {
    expect(
      buildCatalogTemplateDeployBody('perplexica', {
        name: 'app',
        set: ['OPENAI_API_KEY=secret']
      })
    ).toEqual({
      name: 'app',
      template: 'perplexica',
      args: {
        OPENAI_API_KEY: 'secret'
      }
    })
  })

  test('builds raw deploy request body with dryRun', () => {
    expect(
      buildRawTemplateDeployBody('apiVersion: app.sealos.io/v1\nkind: Template', {
        set: ['OPENAI_API_KEY=secret'],
        dryRun: true
      })
    ).toEqual({
      yaml: 'apiVersion: app.sealos.io/v1\nkind: Template',
      args: {
        OPENAI_API_KEY: 'secret'
      },
      dryRun: true
    })
  })
})

describe('database command helpers', () => {
  test('normalizes database and log types', () => {
    expect(normalizeDatabaseType('postgres')).toBe('postgresql')
    expect(normalizeDatabaseType('mongo')).toBe('mongodb')
    expect(normalizeDatabaseType('redis')).toBe('redis')
    expect(() => normalizeDatabaseType('sqlite')).toThrow(/Unsupported database type/)
    expect(normalizeLogDbType('postgres')).toBe('postgresql')
    expect(() => normalizeLogDbType('kafka')).toThrow(/Logs API only supports/)
    expect(normalizeLogType('runtimeLog')).toBe('runtimeLog')
    expect(() => normalizeLogType('audit')).toThrow(/Unsupported log type/)
  })

  test('parses resources and key-value options', () => {
    expect(parseNumericValue('2c', 'cpu')).toBe(2)
    expect(parseNumericValue('4Gi', 'memory')).toBe(4)
    expect(parseNumericValue('10gb', 'storage')).toBe(10)
    expect(parseIntegerValue('3', 'replicas')).toBe(3)
    expect(() => parseIntegerValue('1.5', 'replicas')).toThrow(/must be an integer/)
    expect(parseKeyValueArgs(['max_connections=200', 'timezone=Asia/Shanghai'])).toEqual({
      max_connections: '200',
      timezone: 'Asia/Shanghai'
    })
    expect(() => parseKeyValueArgs(['broken'])).toThrow(/Invalid KEY=VALUE/)
    expect(collectOption('b', ['a'])).toEqual(['a', 'b'])
  })

  test('builds quota and backup request fragments', () => {
    expect(buildQuota({ cpu: '2c', memory: '4g', storage: '20', replicas: '2' })).toEqual({
      cpu: 2,
      memory: 4,
      storage: 20,
      replicas: 2
    })
    expect(buildQuota({})).toEqual({})
    expect(buildAutoBackup({
      backupStart: true,
      backupType: 'week',
      backupWeek: ['mon', 'fri'],
      backupHour: '02',
      backupMinute: '30',
      backupSaveTime: '7',
      backupSaveType: 'days'
    })).toEqual({
      start: true,
      type: 'week',
      week: ['mon', 'fri'],
      hour: '02',
      minute: '30',
      saveTime: 7,
      saveType: 'days'
    })
    expect(buildAutoBackup({ backupWeek: [] })).toBeUndefined()
  })

  test('normalizes versions payloads and summaries', () => {
    expect(extractVersionsMap({ data: { postgresql: ['14', '15'] } })).toEqual({ postgresql: ['14', '15'] })
    expect(extractVersionsMap({ redis: ['7'] })).toEqual({ redis: ['7'] })
    expect(() => extractVersionsMap([])).toThrow(/Unexpected versions response shape/)
    expect(summarizeVersions(['1', '2', '3'])).toBe('1, 2, 3')
    expect(summarizeVersions(['1', '2', '3', '4'])).toBe('1, 2, 3 ... (4 total)')
  })

  test('registers all OpenAPI-backed database subcommands', () => {
    const command = createDatabaseCommand()
    expect(command.name()).toBe('database')
    expect(command.aliases()).toContain('db')
    expect(command.commands.map(subcommand => subcommand.name())).toEqual([
      'list',
      'versions',
      'create',
      'get',
      'connection',
      'update',
      'start',
      'pause',
      'restart',
      'delete',
      'backups',
      'backup',
      'backup-delete',
      'restore',
      'enable-public',
      'disable-public',
      'logs',
      'log-files'
    ])
  })
})

describe('help output', () => {
  test('template deploy help documents raw-only dry-run', () => {
    const help = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'template', 'deploy', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    expect(help).toMatch(/Validate raw template YAML without creating resources/)
    expect(help).toMatch(/Catalog:/)
    expect(help).toMatch(/Raw:/)
  })

  test('login help documents token limited mode', () => {
    const help = execFileSync('node', ['--import', 'tsx', 'src/bin/cli.ts', 'login', '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    })
    expect(help).toMatch(/Store a regional token without OAuth device login/)
  })
})

describe('api client host resolution', () => {
  test('adds template prefix for template service hosts', () => {
    expect(resolveTemplateProviderHost('https://hzh.sealos.run')).toBe('https://template.hzh.sealos.run')
  })

  test('adds dbprovider prefix for database service hosts', () => {
    expect(resolveDbproviderHost('https://hzh.sealos.run')).toBe('https://dbprovider.hzh.sealos.run')
  })

  test('preserves localhost and existing prefixed hosts', () => {
    expect(resolveTemplateProviderHost('http://localhost:3000')).toBe('http://localhost:3000')
    expect(resolveTemplateProviderHost('https://template.hzh.sealos.run')).toBe('https://template.hzh.sealos.run')
    expect(resolveDbproviderHost('http://localhost:3000')).toBe('http://localhost:3000')
    expect(resolveDbproviderHost('https://dbprovider.hzh.sealos.run')).toBe('https://dbprovider.hzh.sealos.run')
  })
})
