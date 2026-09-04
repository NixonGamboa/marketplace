/**
 * @spec TASK-009b, ADR-008
 * Cobertura directa de los helpers de teléfono.
 */
import { describe, it, expect } from 'vitest'
import {
  normalizePhone,
  formatPhonePretty,
  phoneLast4,
  phoneMatchesQuery,
} from '../phone'

describe('lib/phone', () => {
  describe('normalizePhone', () => {
    it('quita espacios, +, guiones y deja sólo dígitos', () => {
      expect(normalizePhone('+57 301 555-0101')).toBe('573015550101')
      expect(normalizePhone('301 5550101')).toBe('3015550101')
      expect(normalizePhone('(301) 555.01.01')).toBe('3015550101')
    })

    it('tolera entrada vacía o null', () => {
      expect(normalizePhone('')).toBe('')
      expect(normalizePhone(null as unknown as string)).toBe('')
    })
  })

  describe('formatPhonePretty', () => {
    it('formatea número colombiano de 12 dígitos con prefijo 57', () => {
      expect(formatPhonePretty('573015550101')).toBe('+57 301 555 0101')
    })

    it('formatea número de 10 dígitos como XXX XXX XXXX', () => {
      expect(formatPhonePretty('3015550101')).toBe('301 555 0101')
    })

    it('fallback: agrupa en bloques de 3', () => {
      expect(formatPhonePretty('12345')).toBe('123 45')
    })
  })

  describe('phoneLast4', () => {
    it('devuelve los últimos 4 dígitos', () => {
      expect(phoneLast4('573015550101')).toBe('0101')
      expect(phoneLast4('+57 301 555 0202')).toBe('0202')
    })

    it('devuelve string corto si el phone tiene menos de 4 dígitos', () => {
      expect(phoneLast4('12')).toBe('12')
    })
  })

  describe('phoneMatchesQuery', () => {
    it('AC-3: 4 dígitos → endsWith', () => {
      expect(phoneMatchesQuery('573015550101', '0101')).toBe(true)
      expect(phoneMatchesQuery('573015550101', '5550')).toBe(false)
    })

    it('AC-4: >4 dígitos → includes', () => {
      expect(phoneMatchesQuery('573015550101', '01015')).toBe(false)
      expect(phoneMatchesQuery('573015550101', '55501')).toBe(true)
    })

    it('AC-5: query no numérica → false', () => {
      expect(phoneMatchesQuery('573015550101', 'juan')).toBe(false)
    })

    it('query vacía → false', () => {
      expect(phoneMatchesQuery('573015550101', '')).toBe(false)
      expect(phoneMatchesQuery('573015550101', '   ')).toBe(false)
    })

    it('query con menos de 4 dígitos → false (ni prefijo ni suffix)', () => {
      expect(phoneMatchesQuery('573015550101', '101')).toBe(false)
    })
  })
})
