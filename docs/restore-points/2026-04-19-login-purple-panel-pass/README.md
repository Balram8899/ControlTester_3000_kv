# Login Purple Panel Pass Restore Point

This restore point captures the blue-violet login redesign created on `2026-04-19`.

Snapshot files in this folder:

- `login.snapshot.tsx`
- `kpmg-brand-override.snapshot.css`

## Restore

Run these PowerShell commands from the repo root:

```powershell
$restoreDir = "docs/restore-points/2026-04-19-login-purple-panel-pass"
Copy-Item "$restoreDir/login.snapshot.tsx" "kpmg_ui/client/src/pages/login.tsx" -Force
Copy-Item "$restoreDir/kpmg-brand-override.snapshot.css" "kpmg_ui/client/src/styles/kpmg-brand-override.css" -Force
```

## Verification

After restoring, verify with:

```powershell
cd kpmg_ui
npm run check
npm run build
```
