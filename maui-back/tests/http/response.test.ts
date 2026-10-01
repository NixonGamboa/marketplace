import { afterEach, describe, expect, it, vi } from 'vitest'
import { fail } from '../../../api/_lib/response.js'
import notFound from '../../../api/not-found.js'
import { ConfigurationError } from '../../src/shared/config.js'
import { ValidationError } from '../../src/shared/errors.js'
import { apiErrorSchema } from '../../../shared/contracts/errors.js'
import { request, response } from './responseFixture.js'

afterEach(() => vi.restoreAllMocks())

describe('errores JSON', () => {
  it('ruta desconocida devuelve 404 incluso con configuración inválida', () => {
    const { res, http } = response()
    notFound(request('GET'), http)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(apiErrorSchema.parse(res.json.mock.calls[0]?.[0])).toEqual({ error: 'NOT_FOUND', message: 'Ruta API no encontrada' })
  })

  it('HEAD ruta inexistente no devuelve cuerpo', () => {
    const { res, http } = response()
    notFound(request('HEAD'), http)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.end).toHaveBeenCalledOnce()
    expect(res.json).not.toHaveBeenCalled()
  })

  it('error inesperado no se filtra en JSON ni logs', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { res, http } = response()
    fail(http, new Error('postgresql://user:secreto@host/db datos privados'))
    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'INTERNAL_ERROR', message: 'Internal server error' })
    expect(log).toHaveBeenCalledWith('Unhandled API error')
  })

  it('configuration failure tiene envelope 503 seguro', () => {
    const { res, http } = response()
    fail(http, new ConfigurationError(['TEST_DATABASE_HOST_REQUIRED']))
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({ error: 'SERVICE_UNAVAILABLE', message: 'Servicio no disponible' })
  })

  it('errores de validación usan issues del contrato único', () => {
    const { res, http } = response()
    fail(http, new ValidationError('Datos inválidos', [{ path: 'items.0.qty', message: 'Debe ser positivo' }]))
    expect(res.status).toHaveBeenCalledWith(400)
    expect(apiErrorSchema.parse(res.json.mock.calls[0]?.[0]).issues).toEqual([{ path: 'items.0.qty', message: 'Debe ser positivo' }])
  })
})
