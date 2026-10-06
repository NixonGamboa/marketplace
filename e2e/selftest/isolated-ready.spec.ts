import { expect, test } from '@playwright/test'
// @ts-expect-error módulo .mjs del launcher, sin declaraciones de tipos
import { parseReady, readyStamp } from '../../scripts/e2e-ready.mjs'

const origin = 'https://marketplace-git-feature-me01-me04-mejoras-ux-test.vercel.app'
const proof = () => ({
  kind: 'maui-isolated-preflight', ok: true, verifiedAt: new Date().toISOString(), metadataVerifiedAt: new Date().toISOString(),
  sha: 'a'.repeat(40), ref: 'feature/me01-me04-mejoras-ux', deploymentId: 'dpl_independent', target: 'preview',
  origin, alias: new URL(origin).hostname, runId: 'run-independent-001',
  isolation: { projectId: 'rough-morning-66975813', parentId: 'br-rough-mud-au9ohq6s', branchId: 'br-clone-real', default: false, primary: false, database: 'maui', host: 'ep-clone-real-pooler.c-10.us-east-1.aws.neon.tech', endpointId: 'ep-clone-real', includedResourcesConfirmed: true },
  baseline: { preservesExistingOrders: true, orderCount: 12, legacyOrdersSha256: 'b'.repeat(64), catalogStoreSha256: 'c'.repeat(64), resetPerformed: false, seedPerformed: false },
})
const ready = () => {
  const p = proof()
  return { ready: true, mode: 'real', dataMode: 'isolated-preserved-baseline', sha: p.sha, ref: p.ref, deploymentId: p.deploymentId,
    target: p.target, origin, authOrigin: origin, verifiedAt: p.verifiedAt, runId: p.runId, isolation: p.isolation, baseline: p.baseline }
}

test('ready aislado compara proof independiente y conserva el modo legacy', () => {
  expect(parseReady(JSON.stringify(ready()), { verifiedProof: proof() })).toMatchObject({ origin, sha: 'a'.repeat(40), runId: 'run-independent-001' })
  expect(parseReady(JSON.stringify({ previewUrl: origin, sha: 'a'.repeat(40), mode: 'real', seedClean: true }))).toEqual({ origin, sha: 'a'.repeat(40) })
})

test('ready aislado no puede autorizarse con sus propios valores', () => {
  expect(() => parseReady(JSON.stringify(ready()))).toThrow(/preflight independiente/)
  expect(() => parseReady(JSON.stringify(ready()), { verifiedProof: ready() })).toThrow(/preflight independiente/)
})

for (const [label, patch] of Object.entries({
  'deployment distinto': { deploymentId: 'dpl_another' }, 'SHA distinto': { sha: 'd'.repeat(40) },
  'ref develop': { ref: 'develop' }, 'Production': { target: 'production' }, 'alias distinto': { origin: 'https://otro.vercel.app' },
  'AUTH_ORIGIN distinto': { authOrigin: 'https://otro.vercel.app' }, 'seedClean inventado': { seedClean: true },
  'seedClean falso': { seedClean: false }, 'reset inventado': { resetAt: new Date().toISOString() },
  'runId distinto': { runId: 'run-other-001' }, 'modo desconocido': { dataMode: 'anything' },
})) test(`rechaza ${label}`, () => expect(() => parseReady(JSON.stringify({ ...ready(), ...patch }), { verifiedProof: proof() })).toThrow())

for (const [label, patch] of Object.entries({
  dev: { branchId: 'br-rough-mud-au9ohq6s' }, main: { branchId: 'br-patient-mouse-au2580c5' },
  default: { default: true }, primary: { primary: true }, parent: { parentId: 'br-patient-mouse-au2580c5' },
  host: { host: 'ep-tiny-feather-aug4p4jh-pooler.c-10.us-east-1.aws.neon.tech' }, resources: { includedResourcesConfirmed: false },
})) test(`rechaza aislamiento ${label} aunque ready y proof lo afirmen`, () => {
  const p = proof(), r = ready()
  Object.assign(p.isolation, patch); Object.assign(r.isolation, patch)
  expect(() => parseReady(JSON.stringify(r), { verifiedProof: p })).toThrow()
})

test('rechaza cambios de baseline, proof vencido y metadata vencida', () => {
  const r = ready(); r.baseline.legacyOrdersSha256 = 'd'.repeat(64)
  expect(() => parseReady(JSON.stringify(r), { verifiedProof: proof() })).toThrow(/Baseline legacy/)
  expect(() => parseReady(JSON.stringify(ready()), { verifiedProof: { ...proof(), verifiedAt: new Date(Date.now() - 61_000).toISOString() } })).toThrow(/preflight independiente/)
  expect(() => parseReady(JSON.stringify(ready()), { verifiedProof: { ...proof(), metadataVerifiedAt: new Date(Date.now() - 301_000).toISOString() } })).toThrow(/preflight independiente/)
})

test('rechaza stamp consumido y runId reutilizado aunque cambie el texto', () => {
  const r = ready(), text = JSON.stringify(r)
  expect(() => parseReady(text, { verifiedProof: proof(), consumed: { stamps: [{ stamp: readyStamp(text) }] } })).toThrow(/consumido/)
  expect(() => parseReady(JSON.stringify({ ...r, verifiedAt: new Date().toISOString() }), { verifiedProof: proof(), consumed: { stamps: [{ stamp: 'other', runId: r.runId }] } })).toThrow(/consumido/)
})
