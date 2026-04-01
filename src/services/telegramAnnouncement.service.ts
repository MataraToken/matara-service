import { Markup } from "telegraf";
import bot from "../bot";
import User from "../model/user.model";

const CAPTION_MAX = 1024;
const BUTTON_LABEL_MAX = 64;
const DELAY_MS = 40;

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

/**
 * Sends a photo + caption to every user with a stored Telegram chat id (Blum-style announcement).
 */
export async function broadcastTelegramAnnouncement(
  input: BroadcastAnnouncementInput
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

  const reply_markup = link
    ? Markup.inlineKeyboard([Markup.button.url(buttonText, link)]).reply_markup
    : undefined;

  let sent = 0;
  let failed = 0;
  const sampleErrors: string[] = [];

  for (const u of users) {
    const chatId = u.telegramChatId;
    if (chatId == null) continue;

    try {
      await bot.telegram.sendPhoto(
        chatId,
        { source: coverImagePath },
        {
          caption,
          ...(reply_markup ? { reply_markup } : {}),
        }
      );
      sent++;
    } catch (e: unknown) {
      failed++;
      const err = e as { response?: { description?: string }; message?: string };
      const msg = err?.response?.description || err?.message || String(e);
      if (sampleErrors.length < 25) {
        sampleErrors.push(`${u.username ?? chatId}: ${msg}`);
      }
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  return {
    totalTargets: users.length,
    sent,
    failed,
    sampleErrors,
  };
}
