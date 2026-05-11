# TRACE RBAC, Admin Console & Password Policy — Design Spec

**Date:** 2026-05-11  
**Status:** Approved  
**Scope:** Authentication overhaul, role-based access control, admin console, user request workflow, password policy

---

## 1. Background

The current auth system is entirely client-side: users and plaintext passwords stored in `localStorage`, no server-side session validation, no roles, and no API protection. With TRACE deploying to a GCP VM (public-facing on port 5000), this is insufficient. This spec replaces it with a proper server-side auth system backed by MongoDB, JWT-based sessions, and a full RBAC model.

---

## 2. Roles

Four roles. A user may hold **multiple roles simultaneously**; effective permissions are the **union** of all assigned roles.

| Role | Description |
|---|---|
| `viewer` | Read-only access to all data + chat |
| `analyst` | Viewer + create and run work (assessments, control testing, issues, uploads, RCM) |
| `manager` | Analyst + approve, close, and delete (validation queue, issues, sessions, records) |
| `admin` | Full access + Admin Console (user management, password policy, audit log) |

### Entitlement Matrix

| Feature / Action | Viewer | Analyst | Manager | Admin |
|---|:---:|:---:|:---:|:---:|
| **Asset Registry** | | | | |
| View assets | ✓ | ✓ | ✓ | ✓ |
| Create / edit assets | — | ✓ | ✓ | ✓ |
| Delete assets | — | — | ✓ | ✓ |
| **Controls Library** | | | | |
| View controls | ✓ | ✓ | ✓ | ✓ |
| Upload / import controls | — | ✓ | ✓ | ✓ |
| Run 5W1H quality analysis | — | ✓ | ✓ | ✓ |
| Delete controls | — | — | ✓ | ✓ |
| **Regulatory & Frameworks Library** | | | | |
| View obligations / frameworks | ✓ | ✓ | ✓ | ✓ |
| Upload / import documents | — | ✓ | ✓ | ✓ |
| Delete library entries | — | — | ✓ | ✓ |
| **Risk Assessment** | | | | |
| View assessments & reports | ✓ | ✓ | ✓ | ✓ |
| Create & run assessments | — | ✓ | ✓ | ✓ |
| Delete assessment sessions | — | — | ✓ | ✓ |
| **Control Testing** | | | | |
| View testing sessions & reports | ✓ | ✓ | ✓ | ✓ |
| Create sessions & upload evidence | — | ✓ | ✓ | ✓ |
| Delete testing sessions | — | — | ✓ | ✓ |
| **Issue Management** | | | | |
| View issues | ✓ | ✓ | ✓ | ✓ |
| Create & edit issues | — | ✓ | ✓ | ✓ |
| Attach evidence to issues | — | ✓ | ✓ | ✓ |
| Close / resolve issues | — | — | ✓ | ✓ |
| Delete issues | — | — | ✓ | ✓ |
| **Validation Queue** | | | | |
| View queue items | ✓ | ✓ | ✓ | ✓ |
| Accept / dismiss queue items | — | — | ✓ | ✓ |
| **Chat / LLM** | | | | |
| Use chat assistant | ✓ | ✓ | ✓ | ✓ |
| **Reports & Exports** | | | | |
| Download PDF / workpaper reports | ✓ | ✓ | ✓ | ✓ |
| Generate RCM compliance reports | — | ✓ | ✓ | ✓ |
| **Admin Console** | | | | |
| View user list | — | — | — | ✓ |
| Create / invite users | — | — | — | ✓ |
| Edit user roles | — | — | — | ✓ |
| Disable / delete users | — | — | — | ✓ |
| Review & action access requests | — | — | — | ✓ |
| Configure password policy | — | — | — | ✓ |
| View audit log | — | — | — | ✓ |

---

## 3. Auth Architecture

**FastAPI owns auth** (Option B). Appropriate for GCP VM deployment — FastAPI validates every request independently, so the API is protected even if Express is misconfigured or bypassed.

### Flow

```
Browser → Express BFF (port 5000) → FastAPI (port 8000, internal only)
```

1. User POSTs credentials to Express `/api/auth/login`
2. Express proxies to FastAPI `POST /auth/login`
3. FastAPI validates credentials, returns signed JWT
4. Express sets JWT as `httpOnly` cookie
5. All subsequent requests: Express reads cookie, forwards as `Authorization: Bearer <token>`
6. FastAPI validates token via `get_current_user` dependency on every endpoint

**GCP firewall:** Port 8000 must be blocked externally. Only port 5000 is public-facing.

### Password hashing

`passlib` with `bcrypt`. Passwords are never stored or transmitted in plaintext.

### New FastAPI files

**`api/routers/auth.py`**
- `POST /auth/login` — validate credentials, issue JWT (`python-jose`)
- `POST /auth/logout` — client token invalidation signal
- `POST /auth/change-password` — enforce policy + no-reuse check, clear `must_reset_password`

**`api/utils/auth.py`**
- `get_current_user(token)` — FastAPI dependency; validates JWT, returns user + roles
- `require_roles(*roles)` — dependency factory; raises HTTP 403 if user lacks all required roles

All existing FastAPI routers gain `get_current_user` as a dependency. Role-gated endpoints additionally use `require_roles`.

---

## 4. Data Model

Three new MongoDB collections in `trace_db`.

### `users`

```json
{
  "_id": "uuid",
  "name": "string",
  "email": "string (unique, lowercase)",
  "hashed_password": "string",
  "roles": ["viewer", "analyst", "manager", "admin"],
  "status": "active | disabled",
  "must_reset_password": true,
  "password_history": ["hashed_string"],
  "password_changed_at": "datetime",
  "last_login_at": "datetime",
  "created_at": "datetime",
  "created_by": "user_id | 'system'"
}
```

### `access_requests`

```json
{
  "_id": "uuid",
  "name": "string",
  "email": "string",
  "department": "string",
  "reason": "string",
  "status": "pending | approved | rejected",
  "actioned_by": "user_id",
  "actioned_at": "datetime",
  "rejection_note": "string",
  "created_at": "datetime"
}
```

### `password_policy`

Single document. Admin-configurable via the Admin Console.

```json
{
  "min_length": 12,
  "require_uppercase": true,
  "require_lowercase": true,
  "require_number": true,
  "require_symbol": true,
  "no_reuse_count": 5,
  "expiry_days": 90
}
```

`expiry_days: 0` means passwords never expire.

---

## 5. User Account Creation

Two paths. Both set `must_reset_password: true` and display the generated temporary password on-screen to the admin.

### Path 1 — User-initiated request

1. User visits `/request-access`, fills form (name, email, department, reason), submits
2. Record created in `access_requests` with `status: pending`
3. Admin Console → Requests tab shows a badge with pending count
4. Any admin opens the request, assigns roles (multi-select), clicks Approve or Reject (with optional rejection note)
5. On approval: user account created in `users`, temp password generated, shown to admin on screen
6. On rejection: `access_requests` record updated with note

**Returning user status check:** `/request-access` page has a "Check status" section. User enters their email; the page returns only their own request status and rejection note (if any). No other request data is exposed.

### Path 2 — Admin direct creation

Admin navigates to Admin Console → Users tab → Create User. Fills name, email, assigns roles. System creates account, generates temp password, displays it on screen for the admin to share.

---

## 6. Force Password Reset

Applies to **both** account creation paths.

- After first login, if `must_reset_password: true`, the app redirects to `/set-password`
- All other protected routes redirect to `/set-password` until reset is complete — it cannot be skipped
- `/set-password` shows a live policy checker (each rule ticked off as the user types)
- On submit: validates against current `password_policy`, checks no-reuse against `password_history`, sets `must_reset_password: false`, updates `password_changed_at`

---

## 7. Password Policy Enforcement

Applied at: registration (n/a — admin-created only), `/set-password`, and `POST /auth/change-password`.

| Rule | Default | Configurable |
|---|---|---|
| Minimum length | 12 | Yes |
| Uppercase required | Yes | Yes |
| Lowercase required | Yes | Yes |
| Number required | Yes | Yes |
| Symbol required | Yes | Yes |
| No reuse of last N passwords | 5 | Yes |
| Expiry (days) | 90 | Yes (0 = never) |

Password expiry check runs at login: if `password_changed_at` + `expiry_days` < now, redirect to `/set-password` with an expiry notice.

---

## 8. New UI Pages

### `/request-access`

- Form: Full name, Work email, Department, Reason for access
- Submit creates `access_requests` record
- "Already submitted?" section: email input → shows only own status (`pending` / `approved` / `rejected` + note)
- Replaces the current "Create Account" dialog on the login page

### `/set-password`

- Fields: New password, Confirm password
- Live policy checker: each rule (length, uppercase, lowercase, number, symbol) shown with ✓/✗ in real time
- Cannot be navigated away from until complete
- Handles both first-login force-reset and password expiry

### `/admin`

Dedicated route. Visible in sidebar only for users with `admin` role. Four tabs:

**Users tab**
- Table: name, email, roles (badges), status, last login
- Create User button: form (name + email + roles) → temp password shown on screen
- Per-row: Edit roles, Disable/Enable, Delete

**Requests tab**
- Badge on tab showing pending count
- Table: name, email, department, reason, submitted date, status
- Approve action: modal with role multi-select → confirm
- Reject action: modal with optional rejection note

**Password Policy tab**
- Form: min length, complexity toggles, no-reuse count, expiry days
- Save persists to `password_policy` collection

**Audit Log tab**
- Read-only table: actor, action, target, timestamp
- Events logged: login, logout, role change, user created, user disabled/deleted, request approved/rejected, password reset, policy change

---

## 9. Modified Existing Files

### `kpmg_ui/client/src/contexts/AuthContext.tsx`

- Remove all localStorage logic
- `login()` → `POST /api/auth/login`
- `logout()` → `POST /api/auth/logout`
- Remove `register()`
- `User` type gains `roles: string[]` and `must_reset_password: boolean`
- Add `hasRole(role: string): boolean`
- Add `hasAnyRole(...roles: string[]): boolean`

### `kpmg_ui/client/src/pages/login.tsx`

- Remove "Create Account" dialog and register form
- Replace with "Request Access" link → navigates to `/request-access`
- Login calls FastAPI via API instead of reading localStorage

### App router

- New `<RequireAuth>` wrapper: redirects unauthenticated users to `/login`
- New `<RequireRole roles={string[]}>` wrapper: shows 403 if user lacks required roles
- `/admin` wrapped with `<RequireRole roles={["admin"]}>`
- All protected routes: if `must_reset_password`, redirect to `/set-password`

### Sidebar / navigation

- "Admin" section added at bottom, rendered only when `hasRole("admin")` is true
- Admin Console link with Requests badge count
- User avatar + name in sidebar footer with logout

### `kpmg_ui/server/storage.ts`

- `MemStorage` is no longer the auth source of truth — users now live in MongoDB via FastAPI
- Storage interface can be retained for any Express-layer session caching if needed

### Role gating on existing pages

- Write actions (Create, Edit, Delete, Upload buttons) hidden (not disabled) when user lacks required role
- Uses `hasAnyRole()` inline per page
- Manager-only actions (Delete, Close issue, Accept/Dismiss queue) hidden for Viewer and Analyst

---

## 10. Deployment Notes (GCP)

- Port 5000 (Express): public-facing, allow in GCP firewall
- Port 8000 (FastAPI): internal only, deny in GCP firewall
- Port 27017 (MongoDB): internal only, deny in GCP firewall
- JWT secret key: add `JWT_SECRET_KEY` env var to `docker-compose.yml`
- SMTP: deferred — not in scope for this iteration

---

## 11. Out of Scope

- SMTP / email notifications (deferred)
- SSO / OAuth / LDAP integration
- Per-record ownership (e.g. "only see your own assessments")
- Session revocation / token blocklist
