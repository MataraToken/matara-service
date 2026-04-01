# Admin dashboard: Telegram bot announcements

Send a **photo + caption** to every user who has opened your bot and completed `/start` (same pattern as Blum-style in-chat announcements). Optional **inline button** opens a URL.

## Prerequisites

1. **`telegramChatId` on users**  
   The bot now sends `telegramChatId` with `POST /api/user/register` when a user taps **Start**. Existing users get their chat id updated on the next `/start` (username already exists path still updates `telegramChatId`).

2. **Bot & server**  
   The announcement API uses the same `TELEGRAM_BOT_TOKEN` as the running bot process.

3. **Optional: Redis for async queue**  
   Set **`REDIS_URL`** (same format as ioredis, e.g. `redis://localhost:6379`) to enqueue broadcasts instead of blocking the HTTP request until every user is processed. Without Redis, the handler still works: it runs the broadcast **synchronously** and returns **`200`** when done.

## Endpoint

```http
POST /api/admin/bot/announcement
Authorization: Bearer <admin_jwt>
Content-Type: multipart/form-data
```

### Form fields

| Field       | Required | Description |
|------------|----------|-------------|
| `cover`    | **Yes**  | Image file (same rules as other admin uploads: image MIME, max ~10MB). |
| `text`     | **Yes**  | Caption under the photo (plain text). Max **1024** characters (Telegram limit); longer text is truncated. |
| `link`     | No       | If set, adds one **URL** button. Must be `http://` or `https://`. |
| `linkLabel`| No       | Button label (default: `Open link`). Max **64** characters (Telegram limit). |

### Success — queued (`REDIS_URL` set) — `202 Accepted`

```json
{
  "message": "Announcement queued; processing in background",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "pollUrl": "/api/admin/bot/announcement/jobs/550e8400-e29b-41d4-a716-446655440000"
}
```

Poll job status (same admin auth and IP rules as the POST):

```http
GET /api/admin/bot/announcement/jobs/:jobId
Authorization: Bearer <admin_jwt>
```

Example response while running or after completion:

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "state": "completed",
  "progress": 100,
  "result": {
    "totalTargets": 120,
    "sent": 118,
    "failed": 2,
    "sampleErrors": ["someuser: Forbidden: bot was blocked by the user"]
  },
  "failedReason": null
}
```

- **`state`**: BullMQ job state (e.g. `waiting`, `active`, `completed`, `failed`).
- **`progress`**: `0`–`100` while the worker reports batch progress.
- **`result`**: same shape as the synchronous `data` object when the job completes successfully.
- If Redis is not configured, this endpoint returns **`503`**.

### Success — synchronous (no `REDIS_URL`) — `200 OK`

```json
{
  "message": "Announcement broadcast finished",
  "data": {
    "totalTargets": 120,
    "sent": 118,
    "failed": 2,
    "sampleErrors": [
      "someuser: Forbidden: bot was blocked by the user"
    ]
  }
}
```

- **`totalTargets`**: users with a stored `telegramChatId`.
- **`sent` / `failed`**: per-recipient send results.
- **`sampleErrors`**: up to 25 error lines (blocked bot, invalid chat, etc.).

### Errors

| Status | When |
|--------|------|
| `400`  | Missing `cover` or `text`, or invalid `link` URL. |
| `401` / `403` | Missing admin token or not admin. |
| `404`  | (GET job status) Unknown `jobId`. |
| `503`  | (GET job status) Redis not configured. |
| `500`  | Server / Telegram error. |

## Example: `curl`

```bash
curl -X POST "https://<api-host>/api/admin/bot/announcement" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -F "text=New season is live! Tap the button to open the app." \
  -F "link=https://matara-tma.vercel.app/" \
  -F "linkLabel=Open Matara" \
  -F "cover=@/path/to/banner.png"
```

## Example: browser `FormData`

```ts
const form = new FormData();
form.append("text", caption);
form.append("cover", fileInput.files[0]); // File from <input type="file" accept="image/*">
if (actionUrl) {
  form.append("link", actionUrl);
  form.append("linkLabel", "Open app");
}

const res = await fetch(`${API}/api/admin/bot/announcement`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});

if (res.status === 202) {
  const { jobId, pollUrl } = await res.json();
  // Poll GET `${API}${pollUrl}` until state is completed or failed
}
```

Do **not** set `Content-Type` manually when using `FormData` in the browser (the boundary is set automatically).

## Behaviour notes

- With **`REDIS_URL`**, the upload is moved to a temp staging directory, a BullMQ job is added, and the API returns immediately; a worker (concurrency **1**) runs the same broadcast logic and deletes the image when done.
- Sends are **batched** with configurable concurrency and delay (`TELEGRAM_BROADCAST_CONCURRENCY`, `TELEGRAM_BROADCAST_BATCH_DELAY_MS`) to reduce Telegram rate-limit risk. Without Redis, large audiences may take minutes and the HTTP request stays open until the broadcast finishes.
- Users who **never** pressed `/start` after this deploy (or who never got `telegramChatId` saved) are **not** in the audience.
- If a user **blocks** the bot, that send counts as `failed` and may appear in `sampleErrors`.

## IP allowlist

If production uses `adminIPWhitelist`, calls must come from an allowed IP (or via a server-side proxy from the dashboard).
