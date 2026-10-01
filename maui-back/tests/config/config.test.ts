import { describe, expect, it } from 'vitest'
import { ConfigurationError, getPostgresUrl, loadConfig } from '../../src/shared/config.js'

const testEnvironment = (): NodeJS.ProcessEnv => ({
  APP_ENV: 'test', NODE_ENV: 'production', VERCEL_ENV: 'preview', DB_DRIVER: 'postgres',
  DATABASE_URL: 'postgresql://usuario:secreto@ep-test-pooler.us-east-2.aws.neon.tech/maui?sslmode=require',
  TEST_DATABASE_HOST: 'ep-test.us-east-2.aws.neon.tech', TEST_DATABASE_NAME: 'maui',
  PRODUCTION_DATABASE_HOST: 'ep-production.us-east-2.aws.neon.tech', PRODUCTION_DATABASE_NAME: 'maui',
})

describe('configuración explícita y aislamiento', () => {
  it('Preview usa APP_ENV=test aunque NODE_ENV sea production', () => {
    expect(loadConfig(testEnvironment())).toMatchObject({ APP_ENV: 'test', NODE_ENV: 'production', DB_DRIVER: 'postgres' })
  })

  it('permite Postgres producción únicamente en su endpoint y DB declarados', () => {
    const environment = { ...testEnvironment(), APP_ENV: 'production', VERCEL_ENV: 'production',
      DATABASE_URL: 'postgresql://usuario:secreto@ep-production.us-east-2.aws.neon.tech/maui' }
    expect(loadConfig(environment).APP_ENV).toBe('production')
    expect(() => loadConfig({ ...environment, DATABASE_URL: testEnvironment().DATABASE_URL })).toThrow(ConfigurationError)
  })

  it('APP_ENV no se deduce de NODE_ENV ni del nombre del hostname', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', DB_DRIVER: 'memory' })).toThrow(ConfigurationError)
    expect(() => loadConfig({ ...testEnvironment(), DATABASE_URL: 'postgresql://u:p@dev.neon.tech/maui' })).toThrow(ConfigurationError)
  })

  it.each(['local', 'production'])('rechaza Preview con APP_ENV=%s', APP_ENV => {
    expect(() => loadConfig({ ...testEnvironment(), APP_ENV })).toThrow(ConfigurationError)
  })

  it.each(['local', 'test'])('rechaza Production con APP_ENV=%s', APP_ENV => {
    expect(() => loadConfig({ ...testEnvironment(), VERCEL_ENV: 'production', APP_ENV })).toThrow(ConfigurationError)
  })

  it('permite memory en desarrollo local y pruebas unitarias locales', () => {
    expect(loadConfig({ APP_ENV: 'local', DB_DRIVER: 'memory' }).DB_DRIVER).toBe('memory')
    expect(loadConfig({ APP_ENV: 'test', NODE_ENV: 'test', DB_DRIVER: 'memory' }).DB_DRIVER).toBe('memory')
  })

  it.each([
    { APP_ENV: 'test', VERCEL_ENV: 'preview', NODE_ENV: 'test' },
    { APP_ENV: 'production', VERCEL_ENV: 'production', NODE_ENV: 'test' },
    { APP_ENV: 'production', NODE_ENV: 'test' },
    { APP_ENV: 'test', NODE_ENV: 'development' },
    { APP_ENV: 'local', NODE_ENV: 'production' },
  ])('memory no se usa en runtime desplegado o productivo: %j', environment => {
    expect(() => loadConfig({ ...environment, DB_DRIVER: 'memory' })).toThrow(ConfigurationError)
  })

  it.each(['DATABASE_URL', 'TEST_DATABASE_HOST', 'TEST_DATABASE_NAME', 'PRODUCTION_DATABASE_HOST', 'PRODUCTION_DATABASE_NAME'])
  ('rechaza configuración incompleta: %s', key => {
    const environment = testEnvironment()
    delete environment[key]
    expect(() => loadConfig(environment)).toThrow(ConfigurationError)
  })

  it.each([
    'postgresql://u:p@ep-production.us-east-2.aws.neon.tech/maui',
    'postgresql://u:p@ep-production-pooler.us-east-2.aws.neon.tech/maui',
    'postgresql://u:p@EP-PRODUCTION.us-east-2.aws.neon.tech./maui',
    'postgresql://u:p@%65p-production.us-east-2.aws.neon.tech/maui',
  ])('prohíbe endpoint de producción en test aun con distinta representación', DATABASE_URL => {
    expect(() => loadConfig({ ...testEnvironment(), DATABASE_URL })).toThrow(ConfigurationError)
  })

  it('prohíbe usar el mismo endpoint en ambas declaraciones', () => {
    expect(() => loadConfig({ ...testEnvironment(), PRODUCTION_DATABASE_HOST: 'ep-test-pooler.us-east-2.aws.neon.tech' }))
      .toThrow(ConfigurationError)
  })

  it('verifica también el nombre de base de datos', () => {
    expect(() => loadConfig({ ...testEnvironment(), TEST_DATABASE_NAME: 'otra' })).toThrow(ConfigurationError)
  })

  it.each(['localhost', '127.0.0.1', '[::1]'])('local acepta únicamente Postgres loopback: %s', host => {
    const settings = loadConfig({ APP_ENV: 'local', DB_DRIVER: 'postgres', DATABASE_URL: `postgresql://u:p@${host}/maui` })
    expect(getPostgresUrl(settings)).toContain(host)
  })

  it.each(['ep-test.us-east-2.aws.neon.tech', 'ep-production-pooler.us-east-2.aws.neon.tech', 'remoto-desconocido.example'])
  ('APP_ENV=local no permite eludir declaraciones para BD remota: %s', host => {
    expect(() => loadConfig({ ...testEnvironment(), APP_ENV: 'local', VERCEL_ENV: undefined,
      DATABASE_URL: `postgresql://u:p@${host}/maui` })).toThrow(ConfigurationError)
  })

  it('local rechaza loopback declarado como productivo', () => {
    expect(() => loadConfig({ APP_ENV: 'local', DATABASE_URL: 'postgresql://u:p@localhost/maui',
      PRODUCTION_DATABASE_HOST: 'localhost' })).toThrow(ConfigurationError)
  })

  it('producción exige un runtime production explícito', () => {
    expect(() => loadConfig({ ...testEnvironment(), APP_ENV: 'production', VERCEL_ENV: 'production', NODE_ENV: 'test' }))
      .toThrow(ConfigurationError)
  })

  it('herramientas Postgres rechazan memory aunque contenga URL', () => {
    const settings = loadConfig({ APP_ENV: 'local', DB_DRIVER: 'memory', DATABASE_URL: 'postgresql://u:p@localhost/maui' })
    expect(() => getPostgresUrl(settings)).toThrow(ConfigurationError)
  })

  it.each(['host', 'hostaddr', 'dbname', 'database', 'db', 'port', 'user', 'password', 'options', 'sslcert'])
  ('rechaza overrides de conexión por query string: %s', key => {
    const DATABASE_URL = `${testEnvironment().DATABASE_URL}&${key}=override`
    expect(() => loadConfig({ ...testEnvironment(), DATABASE_URL })).toThrow(ConfigurationError)
  })

  it.each(['https://u:p@ep-test.us-east-2.aws.neon.tech/maui', 'postgresql://ep-test.us-east-2.aws.neon.tech/maui',
    'postgresql://u:p@ep-test.us-east-2.aws.neon.tech/', 'postgresql://u:p@ep-test.us-east-2.aws.neon.tech/maui%2Fother',
    'valor secreto inválido'])('rechaza URLs inválidas sin incluir su valor en el error', DATABASE_URL => {
    try {
      loadConfig({ ...testEnvironment(), DATABASE_URL })
      expect.fail('Debió rechazar la configuración')
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError)
      expect(String(error)).not.toContain(DATABASE_URL)
      expect(JSON.stringify(error)).not.toContain(DATABASE_URL)
    }
  })
})
