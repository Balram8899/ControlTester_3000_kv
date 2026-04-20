# KPMG Enterprise-Ready UI Restore Point

This restore point captures the `2026-04-19` enterprise-ready KPMG UI pass.

Snapshot files in this folder:

- `kpmg-brand-override.snapshot.css`
- `AppLayout.snapshot.tsx`
- `HeroSection.snapshot.tsx`
- `landing.snapshot.tsx`
- `dashboard.snapshot.tsx`

## Restore

Run these PowerShell commands from the repo root:

```powershell
$restoreDir = "docs/restore-points/2026-04-19-kpmg-enterprise-ready-ui"
Copy-Item "$restoreDir/kpmg-brand-override.snapshot.css" "kpmg_ui/client/src/styles/kpmg-brand-override.css" -Force
Copy-Item "$restoreDir/AppLayout.snapshot.tsx" "kpmg_ui/client/src/components/AppLayout.tsx" -Force
Copy-Item "$restoreDir/HeroSection.snapshot.tsx" "kpmg_ui/client/src/components/HeroSection.tsx" -Force
Copy-Item "$restoreDir/landing.snapshot.tsx" "kpmg_ui/client/src/pages/landing.tsx" -Force
Copy-Item "$restoreDir/dashboard.snapshot.tsx" "kpmg_ui/client/src/pages/dashboard.tsx" -Force
```

## Verification

After restoring, verify with:

```powershell
cd kpmg_ui
npm run check
node --import tsx .\client\src\pages\control-testing.helpers.test.ts
npm run build
```
