# Before Full KPMG Guideline Revamp Restore Point

This restore point captures the shared UI state before the full KPMG guideline-driven refresh created on `2026-04-19`.

Snapshot files in this folder:

- `kpmg-brand-override.snapshot.css`
- `AppLayout.snapshot.tsx`
- `HeroSection.snapshot.tsx`
- `KpiCard.snapshot.tsx`
- `tabs.snapshot.tsx`
- `chartTheme.snapshot.ts`
- `landing.snapshot.tsx`
- `dashboard.snapshot.tsx`
- `login.snapshot.tsx`

## Restore

Run these PowerShell commands from the repo root:

```powershell
$restoreDir = "docs/restore-points/2026-04-19-before-full-kpmg-guideline-revamp"
Copy-Item "$restoreDir/kpmg-brand-override.snapshot.css" "kpmg_ui/client/src/styles/kpmg-brand-override.css" -Force
Copy-Item "$restoreDir/AppLayout.snapshot.tsx" "kpmg_ui/client/src/components/AppLayout.tsx" -Force
Copy-Item "$restoreDir/HeroSection.snapshot.tsx" "kpmg_ui/client/src/components/HeroSection.tsx" -Force
Copy-Item "$restoreDir/KpiCard.snapshot.tsx" "kpmg_ui/client/src/components/KpiCard.tsx" -Force
Copy-Item "$restoreDir/tabs.snapshot.tsx" "kpmg_ui/client/src/components/ui/tabs.tsx" -Force
Copy-Item "$restoreDir/chartTheme.snapshot.ts" "kpmg_ui/client/src/lib/chartTheme.ts" -Force
Copy-Item "$restoreDir/landing.snapshot.tsx" "kpmg_ui/client/src/pages/landing.tsx" -Force
Copy-Item "$restoreDir/dashboard.snapshot.tsx" "kpmg_ui/client/src/pages/dashboard.tsx" -Force
Copy-Item "$restoreDir/login.snapshot.tsx" "kpmg_ui/client/src/pages/login.tsx" -Force
```

## Verification

After restoring, verify with:

```powershell
cd kpmg_ui
npm run check
npm run build
```
