import { describe, expect, it } from 'vitest'
import { formatAge } from './formatAge'

const NOW = Date.parse('2026-10-03T12:00:00Z')
const ago = (ms: number) => formatAge(NOW - ms, NOW)

describe('formatAge', () => {
  it('describe la antigüedad en la unidad adecuada', () => {
    expect(ago(0)).toBe('hace un momento')
    expect(ago(59_999)).toBe('hace un momento')
    expect(ago(60_000)).toBe('hace 1 min')
    expect(ago(59 * 60_000 + 59_000)).toBe('hace 59 min')
    expect(ago(60 * 60_000)).toBe('hace 1 h')
    expect(ago(23 * 3_600_000 + 59 * 60_000)).toBe('hace 23 h')
    expect(ago(24 * 3_600_000)).toBe('hace 1 día')
    expect(ago(3 * 24 * 3_600_000)).toBe('hace 3 días')
  })

  it('una marca en el futuro (reloj corregido) se trata como «hace un momento»', () => {
    expect(formatAge(NOW + 5000, NOW)).toBe('hace un momento')
  })
})
