import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import fs from "fs/promises";
import os from "os";
import pathMod from "path";
import { broadcastTelegramAnnouncement } from "../services/telegramAnnouncement.service";

const QUEUE_NAME = "telegram-broadcast";

let sharedRedis: IORedis | null = null;
let queue: Queue | null = null;
let worker: Worker | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

function getSharedRedis(): IORedis {
  if (!isRedisConfigured()) {
    throw new Error("REDIS_URL is not set");
  }
  if (!sharedRedis) {
    sharedRedis = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
    });
  }
  return sharedRedis;
}

export function getBroadcastStagingDir(): string {
  return pathMod.join(os.tmpdir(), "matara-broadcast-queue");
}

export interface TelegramBroadcastJobData {
  imagePath: string;
  text: string;
  link?: string;
  linkLabel?: string;
}

export function getTelegramBroadcastQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getSharedRedis().duplicate(),
    });
  }
  return queue;
}

/**
 * Enqueue a broadcast job. Image must already live at `data.imagePath` until the worker finishes.
 */
export async function enqueueTelegramBroadcast(
  data: TelegramBroadcastJobData,
  jobId: string
): Promise<void> {
  const q = getTelegramBroadcastQueue();
  await q.add(
    "send",
    {
      imagePath: data.imagePath,
      text: data.text,
      link: data.link,
      linkLabel: data.linkLabel,
    },
    {
      jobId,
      removeOnComplete: { age: 24 * 3600 },
      removeOnFail: { age: 7 * 24 * 3600 },
    }
  );
}

export function startTelegramBroadcastWorker(): void {
  if (!isRedisConfigured()) {
    console.log(
      "Telegram broadcast: REDIS_URL not set — announcements run synchronously on POST (no queue)."
    );
    return;
  }
  if (worker) return;

  worker = new Worker<TelegramBroadcastJobData>(
    QUEUE_NAME,
    async (job) => {
      const { imagePath, text, link, linkLabel } = job.data;
      try {
        return await broadcastTelegramAnnouncement(
          {
            text,
            coverImagePath: imagePath,
            link,
            linkLabel,
          },
          (pct) => job.updateProgress(pct)
        );
      } finally {
        await fs.unlink(imagePath).catch(() => {});
      }
    },
    {
      connection: getSharedRedis().duplicate(),
      concurrency: 1,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`Telegram broadcast job ${job?.id} failed:`, err);
  });

  worker.on("completed", (job) => {
    const r = job.returnvalue as { sent?: number; failed?: number; totalTargets?: number } | undefined;
    console.log(
      `Telegram broadcast job ${job.id} completed: sent=${r?.sent ?? "?"} failed=${r?.failed ?? "?"} total=${r?.totalTargets ?? "?"}`
    );
  });

  console.log("Telegram broadcast worker started (BullMQ, concurrency=1)");
}

export async function closeTelegramBroadcastQueue(): Promise<void> {
  await worker?.close();
  worker = null;
  await queue?.close();
  queue = null;
  if (sharedRedis) {
    await sharedRedis.quit();
    sharedRedis = null;
  }
}
