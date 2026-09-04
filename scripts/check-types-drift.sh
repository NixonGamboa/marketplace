#!/usr/bin/env bash
# Verifica que los tipos del dominio replicados en `maui-admin-front` no se
# hayan desviado de su fuente de verdad en `MAUI-PWA-customers`.
#
# Source of truth: MAUI-PWA-customers/src/types/{orderService,catalog,cart}.ts
# Réplica:         maui-admin-front/src/types/{orderService,catalog,cart}.ts
#
# Si los archivos no coinciden byte-a-byte, sale con código 1 y reporta los
# archivos divergentes para que el dev sincronice manualmente (ADR-002).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PWA_DIR="$REPO_ROOT/MAUI-PWA-customers/src/types"
ADMIN_DIR="$REPO_ROOT/maui-admin-front/src/types"

FILES=(orderService.ts catalog.ts cart.ts)
DRIFTED=()

for f in "${FILES[@]}"; do
  if ! diff -q "$PWA_DIR/$f" "$ADMIN_DIR/$f" >/dev/null 2>&1; then
    DRIFTED+=("$f")
  fi
done

if [ ${#DRIFTED[@]} -gt 0 ]; then
  echo "✗ types drift detected in:"
  for f in "${DRIFTED[@]}"; do
    echo "  - $f"
    diff -u "$PWA_DIR/$f" "$ADMIN_DIR/$f" || true
  done
  echo ""
  echo "Sincroniza los archivos:"
  echo "  cp MAUI-PWA-customers/src/types/{orderService,catalog,cart}.ts maui-admin-front/src/types/"
  exit 1
fi

echo "✓ types in sync"
