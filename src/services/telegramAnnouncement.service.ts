import { Markup } from "telegraf";
import type { InlineKeyboardMarkup } from "telegraf/types";
import bot from "../bot";
import User from "../model/user.model";

const CAPTION_MAX = 1024;
const BUTTON_LABEL_MAX = 64;

/** Parallel sends per batch (Telegram allows ~30 msgs/s to different chats; stay conservative). */
const DEFAULT_CONCURRENCY = Number(process.env.TELEGRAM_BROADCAST_CONCURRENCY || "10");
/** Pause after each batch finishes (ms) to avoid sustained bursts. */
const DEFAULT_BATCH_DELAY_MS = Number(process.env.TELEGRAM_BROADCAST_BATCH_DELAY_MS || "200");

export interface BroadcastAnnouncementInput {
  text: string;
  coverImagePath: string;
  link?: string;
  linkLabel?: string;
}

export interface BroadcastAnnouncementResult {
  totalTargets: number;
  sent: number;
  failed: number;
  sampleErrors: string[];
}

function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getRetryAfterSeconds(err: unknown): number | null {
  const e = err as {
    response?: { error_code?: number; parameters?: { retry_after?: number } };
  };
  if (e?.response?.error_code === 429) {
    const sec = e.response.parameters?.retry_after;
    return typeof sec === "number" && sec > 0 ? sec : 2;
  }
  return null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function sendPhotoToChat(
  chatId: number,
  coverImagePath: string,
  caption: string,
  reply_markup: InlineKeyboardMarkup | undefined
): Promise<void> {
  try {
    await bot.telegram.sendPhoto(
      chatId,
      { source: coverImagePath },
      {
        caption,
        ...(reply_markup ? { reply_markup } : {}),
      }
    );
  } catch (first: unknown) {
    const waitSec = getRetryAfterSeconds(first);
    if (waitSec != null) {
      await sleep(waitSec * 1000 + 200);
      await bot.telegram.sendPhoto(
        chatId,
        { source: coverImagePath },
        {
          caption,
          ...(reply_markup ? { reply_markup } : {}),
        }
      );
      return;
    }
    throw first;
  }
}

/**
 * Sends a photo + caption to every user with a stored Telegram chat id (Blum-style announcement).
 * Uses batched parallelism + optional 429 retry to finish faster than strict serial sends.
 * @param onProgress Optional 0–100 for queue / UI progress.
 */
export async function broadcastTelegramAnnouncement(
  input: BroadcastAnnouncementInput,
  onProgress?: (percent: number) => void | Promise<void>
): Promise<BroadcastAnnouncementResult> {
  const { text, coverImagePath, link, linkLabel = "Open link" } = input;

  if (link && !isValidHttpUrl(link)) {
    throw new Error("link must be a valid http(s) URL");
  }

  const caption = text.slice(0, CAPTION_MAX);
  const buttonText = linkLabel.slice(0, BUTTON_LABEL_MAX);

  const users = await User.find({
    telegramChatId: { $exists: true, $ne: null },
  })
    .select("telegramChatId username")
    .lean();

  const reply_markup: InlineKeyboardMarkup | undefined = link
    ? (Markup.inlineKeyboard([Markup.button.url(buttonText, link)]).reply_markup as InlineKeyboardMarkup)
    : undefined;

  const targets = users.filter(
    (u): u is (typeof u & { telegramChatId: number }) => u.telegramChatId != null
  );

  if (targets.length === 0) {
    console.warn(
      "[telegram broadcast] 0 recipients: no User documents have telegramChatId. " +
        "Recipients are added when someone opens the bot, has a Telegram username, and /start runs " +
        "(POST /api/user/register with telegramChatId). Check MongoDB is the same DB your bot registers against."
    );
  }

  const concurrency = Math.max(1, Math.min(30, DEFAULT_CONCURRENCY || 10));
  const batchDelayMs = Math.max(0, DEFAULT_BATCH_DELAY_MS || 0);

  let sent = 0;
  let failed = 0;
  const sampleErrors: string[] = [];

  const batches = chunk(targets, concurrency);
  const total = targets.length;
  await onProgress?.(0);

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const results = await Promise.allSettled(
      batch.map((u) =>
        sendPhotoToChat(u.telegramChatId, coverImagePath, caption, reply_markup)
      )
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const u = batch[i];
      const chatId = u.telegramChatId;

      if (r.status === "fulfilled") {
        sent++;
      } else {
        failed++;
        const msg = r.reason?.response?.description || r.reason?.message || String(r.reason);
        if (sampleErrors.length < 25) {
          sampleErrors.push(`${u.username ?? chatId}: ${msg}`);
        }
      }
    }

    if (batchDelayMs > 0 && b < batches.length - 1) {
      await sleep(batchDelayMs);
    }

    const done = sent + failed;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
    await onProgress?.(pct);
  }

  await onProgress?.(100);

  return {
    totalTargets: targets.length,
    sent,
    failed,
    sampleErrors,
  };
}
