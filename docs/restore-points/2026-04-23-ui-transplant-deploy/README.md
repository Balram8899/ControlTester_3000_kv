# UI Transplant Deploy Restore Point

This restore point captures the deploy-ready `kpmg_ui` state for the fork UI transplant created on `2026-04-23`.

It preserves the exact frontend shell, transplanted pages, supporting data/components, Windows-safe package scripts, the Windows-compatible server listen change, and the Docker runtime script copy fix used for this deploy.

Snapshot contents live under:

- `docs/restore-points/2026-04-23-ui-transplant-deploy/snapshot/kpmg_ui`

## Restore

Use these PowerShell commands from the repo root to restore this exact `kpmg_ui` state:

```powershell
$restoreDir = "docs/restore-points/2026-04-23-ui-transplant-deploy/snapshot/kpmg_ui"
Copy-Item "$restoreDir\*" "kpmg_ui" -Recurse -Force
```

## Verification

After restoring, verify with:

```powershell
cd kpmg_ui
node --import tsx .\client\src\ui-transplant.routes.test.ts
node --import tsx .\client\src\components\app-layout.sidebar.test.ts
node --import tsx .\client\src\package-scripts.test.ts
node --import tsx .\client\src\server-listen-options.test.ts
Get-Content .\client\src\dockerfile.start-server.test.ts -Raw | node --input-type=module -
npm run check
npm run build
```
