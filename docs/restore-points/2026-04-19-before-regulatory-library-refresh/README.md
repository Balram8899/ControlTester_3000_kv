# Before Regulatory Library Refresh Restore Point

This restore point captures the `Regulatory Library` page before the page-specific UI refresh created on `2026-04-19`.

Snapshot files in this folder:

- `regulatory-library.snapshot.tsx`

## Restore

Run these PowerShell commands from the repo root:

```powershell
$restoreDir = "docs/restore-points/2026-04-19-before-regulatory-library-refresh"
Copy-Item "$restoreDir/regulatory-library.snapshot.tsx" "kpmg_ui/client/src/pages/regulatory-library.tsx" -Force
```

## Verification

After restoring, verify with:

```powershell
cd kpmg_ui
npm run check
npm run build
```
