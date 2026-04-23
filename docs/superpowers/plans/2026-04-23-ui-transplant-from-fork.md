# UI Transplant From Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transplant the fork branch's UI into the local branch page by page while preserving the local branch's backend logic, feature behavior, and recent non-UI work.

**Architecture:** Treat the fork branch as a frontend design source, not as a merge target. Copy shared UI primitives and page-level presentation changes into the local `kpmg_ui` app while preserving local route behavior, auth behavior unless explicitly wanted, and any existing feature logic that is not purely visual. Use focused source-based tests plus TypeScript checks to catch accidental behavior drift in the overlap-heavy files.

**Tech Stack:** React 18, TypeScript, Vite, wouter, shadcn/ui, lightweight `tsx` assertion tests

---

### Task 1: Lock In Route And Shell Expectations Before The Transplant

**Files:**
- Create: `kpmg_ui/client/src/ui-transplant.routes.test.ts`
- Modify: `kpmg_ui/client/src/components/app-layout.sidebar.test.ts`
- Test: `kpmg_ui/client/src/ui-transplant.routes.test.ts`
- Test: `kpmg_ui/client/src/components/app-layout.sidebar.test.ts`

- [ ] **Step 1: Write the failing route/source test**

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const appSource = fs.readFileSync(path.resolve("client/src/App.tsx"), "utf8");

assert.match(appSource, /controls-diagnostics/, "App routes should expose the transplanted Controls Diagnostics entry point");
assert.doesNotMatch(appSource, /risk-register/, "App routes should not expose an unresolved Risk Register route");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx .\client\src\ui-transplant.routes.test.ts`
Expected: FAIL before the new routes are added

- [ ] **Step 3: Extend the existing shell source test for the new shared shell**

```ts
assert.match(appLayoutSource, /Footer/, "App layout should render the transplanted footer");
assert.match(appLayoutSource, /collapsed, setCollapsed/, "App layout should keep the collapsible sidebar behavior used locally");
```

- [ ] **Step 4: Run verification**

Run: `node --import tsx .\client\src\components\app-layout.sidebar.test.ts`
Expected: FAIL until the layout transplant is in place

### Task 2: Transplant Shared UI Infrastructure First

**Files:**
- Modify: `kpmg_ui/client/src/App.tsx`
- Modify: `kpmg_ui/client/src/components/AppLayout.tsx`
- Create: `kpmg_ui/client/src/components/Footer.tsx`
- Modify: `kpmg_ui/client/src/components/HeroSection.tsx`
- Create: `kpmg_ui/client/src/components/HowItWorks.tsx`
- Create: `kpmg_ui/client/src/components/TraceNavBar.tsx`
- Modify: `kpmg_ui/client/src/styles/kpmg-brand-override.css`
- Test: `kpmg_ui/client/src/ui-transplant.routes.test.ts`
- Test: `kpmg_ui/client/src/components/app-layout.sidebar.test.ts`

- [ ] **Step 1: Write minimal implementation**

```tsx
if (location === "/controls-diagnostics") {
  return <ControlsDiagnosticsPage />;
}
```

```tsx
<main className="flex-1 overflow-hidden">{children}</main>
<Footer />
```

- [ ] **Step 2: Preserve local behavior while applying the new shell**

```tsx
const [collapsed, setCollapsed] = useState(true);
```

```tsx
if (location.startsWith("/control-360/") || location === "/control-360") {
  return <Control360Page />;
}
```

- [ ] **Step 3: Run verification**

Run: `node --import tsx .\client\src\ui-transplant.routes.test.ts`
Expected: PASS

Run: `node --import tsx .\client\src\components\app-layout.sidebar.test.ts`
Expected: PASS

### Task 3: Transplant Landing And Login Without Regressing Auth

**Files:**
- Modify: `kpmg_ui/client/src/pages/landing.tsx`
- Modify: `kpmg_ui/client/src/pages/login.tsx`
- Modify: `kpmg_ui/client/src/contexts/AuthContext.tsx`
- Test: `kpmg_ui/client/src/ui-transplant.routes.test.ts`
- Test: `npm run check`

- [ ] **Step 1: Write the failing landing source assertion**

```ts
const landingSource = fs.readFileSync(path.resolve("client/src/pages/landing.tsx"), "utf8");
assert.match(landingSource, /Controls Diagnostics/, "Landing should expose the transplanted Controls Diagnostics card");
assert.doesNotMatch(landingSource, /path:\s*"\/risk-register"/, "Landing should not keep the fork's broken Risk Register link");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx .\client\src\ui-transplant.routes.test.ts`
Expected: FAIL until landing is updated

- [ ] **Step 3: Write minimal implementation**

```tsx
{
  title: "Controls Diagnostics",
  path: "/controls-diagnostics",
}
```

```ts
const DEFAULT_ADMIN: StoredUser = {
  email: "admin@bank.com",
  name: "Admin",
  password: "admin123",
};
```

- [ ] **Step 4: Run verification**

Run: `node --import tsx .\client\src\ui-transplant.routes.test.ts`
Expected: PASS

Run: `npm run check`
Expected: exit code 0

### Task 4: Transplant The Feature Pages That Consume The New Shared Components

**Files:**
- Modify: `kpmg_ui/client/src/pages/control-testing.tsx`
- Modify: `kpmg_ui/client/src/pages/regulatory-testing.tsx`
- Modify: `kpmg_ui/client/src/pages/risk-assessment.tsx`
- Create: `kpmg_ui/client/src/pages/controls-diagnostics.tsx`
- Create: `kpmg_ui/client/src/pages/risk-controls-coverage.tsx`
- Create: `kpmg_ui/client/src/pages/control-quality-analysis.tsx`
- Create: `kpmg_ui/client/src/pages/regulation-controls-coverage.tsx`
- Create: `kpmg_ui/client/src/pages/control-360.tsx`
- Create: `kpmg_ui/client/src/data/apex-controls-data.ts`
- Create: `kpmg_ui/client/src/data/apex-obligations-data.ts`
- Create: `kpmg_ui/client/src/data/apex-risks-data.ts`
- Test: `npm run check`

- [ ] **Step 1: Keep existing logic, add transplanted presentation**

```tsx
<HowItWorks steps={[...]} />
```

- [ ] **Step 2: Add the new frontend-only diagnostics pages and data files**

```tsx
export default function ControlsDiagnosticsPage() {
  return <div>...</div>;
}
```

- [ ] **Step 3: Run verification**

Run: `npm run check`
Expected: exit code 0

### Task 5: Bring Along The Fork's UI Deployment Extras Only If They Remain Harmless

**Files:**
- Modify: `kpmg_ui/Dockerfile`
- Create: `kpmg_ui/vercel.json`
- Test: `npm run build`

- [ ] **Step 1: Keep only non-behavioral build-file updates**

```dockerfile
RUN npm ci
```

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Run verification**

Run: `npm run build`
Expected: exit code 0
