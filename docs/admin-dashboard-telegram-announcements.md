# Admin dashboard: Telegram bot announcements

Send a **photo + caption** to every user who has opened your bot and completed `/start` (same pattern as Blum-style in-chat announcements). Optional **inline button** opens a URL.

## Prerequisites

1. **`telegramChatId` on users**  
   The bot now sends `telegramChatId` with `POST /api/user/register` when a user taps **Start**. Existing users get their chat id updated on the next `/start` (username already exists path still updates `telegramChatId`).

2. **Bot & server**  
   The announcement API uses the same `TELEGRAM_BOT_TOKEN` as the running bot process.

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

### Success — `200 OK`

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
```

Do **not** set `Content-Type` manually when using `FormData` in the browser (the boundary is set automatically).

## Behaviour notes

- Sends are **sequential** with a short delay (~40ms) between chats to reduce Telegram rate-limit risk. Large audiences may take minutes; the HTTP request stays open until the broadcast finishes—consider timeouts on the admin UI or a future async job if needed.
- Users who **never** pressed `/start` after this deploy (or who never got `telegramChatId` saved) are **not** in the audience.
- If a user **blocks** the bot, that send counts as `failed` and may appear in `sampleErrors`.

## IP allowlist

If production uses `adminIPWhitelist`, calls must come from an allowed IP (or via a server-side proxy from the dashboard).
