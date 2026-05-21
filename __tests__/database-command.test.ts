import { describe, expect, test } from 'vitest'
import {
  buildConsolePublicConnection,
  buildAutoBackup,
  buildQuota,
  collectOption,
  createDatabaseCommand,
  extractVersionsMap,
  normalizeDatabaseType,
  normalizeLogDbType,
  normalizeLogType,
  parseIntegerValue,
  parseKeyValueArgs,
  parseNumericValue,
  summarizeVersions
} from '../src/commands/database/index.ts'

describe('database command helpers', () => {
  test('builds console-compatible public connection strings', () => {
    expect(buildConsolePublicConnection({
      dbType: 'postgresql',
      username: 'postgres',
      password: 'secret',
      domain: 'dbconn.usw-1.sealos.app',
      nodePort: 41085
    })).toBe('postgresql://postgres:secret@dbconn.usw-1.sealos.app:41085/?directConnection=true')

    expect(buildConsolePublicConnection({
      dbType: 'mysql',
      username: 'root',
      password: 'secret',
      domain: 'dbconn.usw-1.sealos.app',
      nodePort: 41086
    })).toBe('mysql://root:secret@dbconn.usw-1.sealos.app:41086')

    expect(buildConsolePublicConnection({
      dbType: 'milvus',
      domain: 'dbconn.usw-1.sealos.app',
      nodePort: 41087
    })).toBe('dbconn.usw-1.sealos.app:41087')
  })

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
    const publicCommands = command.commands.filter(subcommand => subcommand.name() !== '*')
    expect(publicCommands.map(subcommand => subcommand.name())).toEqual([
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

    expect(command.commands.find(subcommand => subcommand.name() === 'enable-public')?.aliases()).toContain('expose')
    expect(command.commands.find(subcommand => subcommand.name() === 'disable-public')?.aliases()).toContain('unexpose')
  })
})
