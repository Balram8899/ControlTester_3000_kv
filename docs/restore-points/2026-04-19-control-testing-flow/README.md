# Control Testing Restore Point

This restore point captures the working `Control Testing` audit flow state created on `2026-04-19`.

It includes snapshots of:

- `kpmg_ui/client/src/pages/control-testing.tsx`
- `kpmg_ui/client/src/contexts/ControlTestingContext.tsx`
- `kpmg_ui/client/src/pages/control-testing.helpers.ts`
- `kpmg_ui/client/src/pages/control-testing.helpers.test.ts`

Snapshot files in this folder:

- `control-testing.page.snapshot.tsx`
- `ControlTestingContext.snapshot.tsx`
- `control-testing.helpers.snapshot.ts`
- `control-testing.helpers.test.snapshot.ts`

## Restore

Use these PowerShell commands from the repo root to restore this exact state:

```powershell
$restoreDir = "docs/restore-points/2026-04-19-control-testing-flow"
Copy-Item "$restoreDir/control-testing.page.snapshot.tsx" "kpmg_ui/client/src/pages/control-testing.tsx" -Force
Copy-Item "$restoreDir/ControlTestingContext.snapshot.tsx" "kpmg_ui/client/src/contexts/ControlTestingContext.tsx" -Force
Copy-Item "$restoreDir/control-testing.helpers.snapshot.ts" "kpmg_ui/client/src/pages/control-testing.helpers.ts" -Force
Copy-Item "$restoreDir/control-testing.helpers.test.snapshot.ts" "kpmg_ui/client/src/pages/control-testing.helpers.test.ts" -Force
```

## Verification

After restoring, verify with:

```powershell
cd kpmg_ui
node --import tsx .\client\src\pages\control-testing.helpers.test.ts
npm run check
npm run build
```
