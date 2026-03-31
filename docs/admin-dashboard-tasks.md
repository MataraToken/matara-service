# Admin dashboard: ending tasks manually

This document describes how the admin frontend should integrate with the **end / reopen task** APIs so operators can close tasks from the dashboard and prevent new user submissions.

## Base URL

Use your deployed API origin plus the admin prefix:

- **Production example:** `https://<your-api-host>/api/admin`
- **Local example:** `http://localhost:<port>/api/admin`

All paths below are relative to `/api/admin`.

## Authentication

Every request must include the **admin JWT** from `POST /api/admin/login` (same as other admin routes):

```http
Authorization: Bearer <admin_access_token>
```

If the token is missing, invalid, or the user is not an admin, the API returns `401` / `403`.

Some deployments also enforce an **IP allowlist** for admin routes. If calls fail from the browser, confirm with backend that your dashboard origin / IP is allowed, or use a server-side proxy.

## Task lifecycle fields

Tasks returned from the API include:

| Field       | Type     | Meaning |
|------------|----------|---------|
| `status`   | `string` | `"active"` (default) or `"ended"`. |
| `endedAt`  | `string \| null` | ISO date when the task was ended, or `null` if active / never ended. |

**Legacy tasks** created before this feature may omit `status`; treat missing `status` as **`active`**.

## Endpoints

### 1. End a task (manual close)

Stops new submissions for this task. Users who call “complete task” receive **403** with a clear message.

```http
POST /api/admin/tasks/:slug/end
Authorization: Bearer <token>
```

**Path parameter**

- `:slug` — Task **slug** (URL-safe identifier), not the MongoDB `_id`. Same slug used in public routes like `GET /api/tasks/:slug`.

**Success — `200 OK`**

```json
{
  "message": "Task ended successfully",
  "data": {
    "_id": "...",
    "title": "...",
    "slug": "...",
    "status": "ended",
    "endedAt": "2026-03-31T12:00:00.000Z",
    ...
  }
}
```

**Errors**

| Status | When |
|--------|------|
| `400`  | Task is already ended (`"Task is already ended"`). |
| `404`  | No task with that slug. |
| `401` / `403` | Auth / not admin. |
| `500`  | Server error. |

**UI suggestions**

- Show “End task” only when `status !== 'ended'` (or missing).
- After success, refresh task detail / list and show `Ended` badge using `status` + `endedAt`.

---

### 2. Reopen a task

Sets the task back to **active** so users can submit again.

```http
POST /api/admin/tasks/:slug/reopen
Authorization: Bearer <token>
```

**Path parameter**

- `:slug` — Same as above.

**Success — `200 OK`**

```json
{
  "message": "Task reopened successfully",
  "data": {
    "_id": "...",
    "slug": "...",
    "status": "active",
    "endedAt": null,
    ...
  }
}
```

**Errors**

| Status | When |
|--------|------|
| `400`  | Task is not ended (`"Task is not ended"`). |
| `404`  | No task with that slug. |
| `401` / `403` | Auth / not admin. |

**UI suggestions**

- Show “Reopen task” only when `status === 'ended'`.

---

## Fetching tasks for the dashboard

Existing admin routes still apply, for example:

- `GET /api/admin/project/:projectId/tasks` — list tasks for a project (include `status` / `endedAt` in the payload for badges and buttons).

Use the **slug** from each task row when calling `POST .../tasks/:slug/end` or `.../reopen`.

## User-facing behavior (for support copy)

When a task is **ended**, authenticated users cannot submit a completion for that task. The public completion endpoint returns:

- **HTTP `403`**
- Body includes a message such as: *“This task has ended and no longer accepts submissions.”*

The dashboard does not need to call that endpoint; it is documented so support and UX copy stay aligned.

## Example: fetch + end (TypeScript-style)

```ts
const API = "https://your-api.example.com/api/admin";
const token = "<admin_jwt>";

async function endTask(slug: string) {
  const res = await fetch(`${API}/tasks/${encodeURIComponent(slug)}/end`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || res.statusText);
  return body;
}
```

Use the same pattern for `/reopen` with `method: "POST"` and path `/tasks/${slug}/reopen`.

## Checklist for implementers

- [ ] Store admin token after login; send `Authorization: Bearer` on all admin calls.
- [ ] Use task **slug** from list/detail APIs in the URL (encode with `encodeURIComponent` if needed).
- [ ] Show **End** when task is active; **Reopen** when `status === 'ended'`.
- [ ] Handle `400` for idempotent clicks (already ended / not ended).
- [ ] Refresh task data after success so `status` and `endedAt` update in the UI.
