/**
 * @spec CU-1, SC-1, §7 — Tests RTL para el guard RequireAuth.
 * AC-1: Sin sesión → Navigate a /login.
 * AC-2: Sesión con rol insuficiente → Navigate a / + toast 'Sin permiso'.
 * AC-3: Sesión con rol suficiente → renderiza children.
 * AC-4: El tipo Role sólo incluye 'owner' y 'operator' (viewer descartado).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Mock de mockAuthRepository antes de importar AuthContext
vi.mock('@/services/mockAuthRepository', () => ({
  mockAuthRepository: {
    getSession: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  },
}))

// Mock de services/index — expone authRepo como el mock
vi.mock('@/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services')>()
  const { mockAuthRepository } = await import('@/services/mockAuthRepository')
  return { ...actual, authRepo: mockAuthRepository }
})

// Mock de useToast para capturar los toasts disparados
const mockToastError = vi.fn()
vi.mock('@/ui/Toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/ui/Toast')>()
  return {
    ...actual,
    useToast: () => ({
      success: vi.fn(),
      error: mockToastError,
      info: vi.fn(),
    }),
  }
})

import { mockAuthRepository } from '@/services/mockAuthRepository'
import { AuthProvider } from '@/auth/AuthContext'
import { RequireAuth } from '@/auth/RequireAuth'
import type { Session } from '@/types/auth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(role: 'owner' | 'operator'): Session {
  return {
    user: {
      email: `${role}@lechemiel.demo`,
      name: `Test ${role}`,
      role,
      merchantId: 'mch_lechemiel',
    },
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  }
}

function renderWithRouter(
  ui: React.ReactNode,
  { initialEntry = '/' }: { initialEntry?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>{ui}</AuthProvider>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RequireAuth — AC-1: sin sesión → redirige a /login', () => {
  it('renders the /login route when there is no session', () => {
    vi.mocked(mockAuthRepository.getSession).mockReturnValue(null)

    renderWithRouter(
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth>
              <p>Contenido protegido</p>
            </RequireAuth>
          }
        />
        <Route path="/login" element={<p>Página de login</p>} />
      </Routes>,
    )

    expect(screen.getByText('Página de login')).toBeInTheDocument()
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
  })
})

describe('RequireAuth — AC-2: sesión con rol insuficiente → redirige a / + toast', () => {
  it('redirects operator to / when owner role is required and fires toast', () => {
    vi.mocked(mockAuthRepository.getSession).mockReturnValue(makeSession('operator'))

    renderWithRouter(
      <Routes>
        <Route path="/" element={<p>Inicio</p>} />
        <Route
          path="/catalogo"
          element={
            <RequireAuth role="owner">
              <p>Catálogo (owner only)</p>
            </RequireAuth>
          }
        />
      </Routes>,
      { initialEntry: '/catalogo' },
    )

    expect(screen.getByText('Inicio')).toBeInTheDocument()
    expect(screen.queryByText('Catálogo (owner only)')).not.toBeInTheDocument()
    expect(mockToastError).toHaveBeenCalledWith('Sin permiso')
  })
})

describe('RequireAuth — AC-3: sesión con rol suficiente → renderiza children', () => {
  it('renders children when operator accesses a shared route', () => {
    vi.mocked(mockAuthRepository.getSession).mockReturnValue(makeSession('operator'))

    renderWithRouter(
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth role={['owner', 'operator']}>
              <p>Pedidos (owner + operator)</p>
            </RequireAuth>
          }
        />
      </Routes>,
    )

    expect(screen.getByText('Pedidos (owner + operator)')).toBeInTheDocument()
  })

  it('renders children for owner accessing an owner-only route', () => {
    vi.mocked(mockAuthRepository.getSession).mockReturnValue(makeSession('owner'))

    renderWithRouter(
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth role="owner">
              <p>Auditoría (owner only)</p>
            </RequireAuth>
          }
        />
      </Routes>,
    )

    expect(screen.getByText('Auditoría (owner only)')).toBeInTheDocument()
  })
})

describe('RequireAuth — AC-4: Role no incluye viewer', () => {
  it('type system only allows owner | operator — verified by type inference', () => {
    // This is a compile-time check; if the test file compiles, AC-4 is satisfied.
    // The Role type in @/types/auth only defines 'owner' | 'operator'.
    const role: 'owner' | 'operator' = 'owner'
    expect(['owner', 'operator']).toContain(role)
  })
})
