// (Your imports and other setup)
import express from "express";
import cors from "cors";
require("dotenv").config();
import http from "http";
import morgan from "morgan";
import "./db";
import bot from "./bot";
import WebSocketService from "./ws";
import { startDepositListener, stopDepositListener } from "./services/depositListener.service";
import userRoute from "./routes/user.route";
import taskRouter from "./routes/task.route";
import projectRouter from "./routes/project.route";
import pingRouter from "./routes/ping.route";
import milestoneRouter from "./routes/milestones.route";
import boostRouter from "./routes/boosts.route";
import bonusRouter from "./routes/bonus.route";
import mineRouter from "./routes/mine.route";
import statsRouter from "./routes/stats.route";
import adminRouter from "./routes/admin.route";
import authRouter from "./routes/auth.route";
import swapRouter from "./routes/swap.route";
import transactionRouter from "./routes/transaction.route";
import transferRouter from "./routes/transfer.route";
import {
  securityHeaders,
  generalRateLimiter,
  sanitizeInput,
  requestTimeout,
} from "./middleware/security";
import { validateEnv } from "./utils/env-validator";
import {
  closeTelegramBroadcastQueue,
  startTelegramBroadcastWorker,
} from "./queues/telegramBroadcast.queue";

const app = express();
const port = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";

// Behind Render/nginx/etc. the proxy sets X-Forwarded-For; express-rate-limit v8 requires this.
// Set TRUST_PROXY=0 if Node is exposed directly with no trusted proxy (spoofing risk if mis-set).
{
  const raw = process.env.TRUST_PROXY?.trim().toLowerCase();
  if (raw === "false" || raw === "0") {
    // leave Express default (trust proxy off)
  } else if (raw && raw !== "true") {
    const n = parseInt(process.env.TRUST_PROXY!, 10);
    if (Number.isFinite(n) && n > 0) {
      app.set("trust proxy", n);
    }
  } else if (raw === "true" || NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }
}

const RENDER_URL = process.env.SERVER_URL;
const TELEGRAM_WEBHOOK_PATH = process.env.BOT_WEBHOOK_PATH;

// Validate environment variables
const envValidation = validateEnv();
if (!envValidation.valid) {
  console.error("❌ Environment validation failed:");
  envValidation.errors.forEach((error) => console.error(`  - ${error}`));
  if (process.env.NODE_ENV === "production") {
    throw new Error("Environment validation failed. Please fix the errors above.");
  } else {
    console.warn("⚠️  Continuing in development mode despite validation errors");
  }
}

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required");
}

if (!RENDER_URL) {
  throw new Error("SERVER_URL is required");
}

if(!TELEGRAM_WEBHOOK_PATH) {
  throw new Error("TELEGRAM_WEBHOOK_URL is required");
}


const webhookPath = `/telegraf/${TELEGRAM_WEBHOOK_PATH}`;

const allowedOrigins = [
  "https://matara-admin.vercel.app", // your frontend
  "http://localhost:5173",  
  "http://localhost:5174",  
  "http://localhost:3000",  
  "https://matara-tma.vercel.app"         // local dev
];

// Security headers (must be first)
app.use(securityHeaders);

// CORS configuration
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle all OPTIONS requests
app.options("*", cors());

// Request timeout (30 seconds)
app.use(requestTimeout(30000));

// Input sanitization
app.use(sanitizeInput);

// General rate limiting
app.use(generalRateLimiter);

// Increase body size limits for file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan("dev"));

app.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use("/api/user", userRoute);
app.use("/api/task", taskRouter);
app.use("/api/project", projectRouter);
app.use("/api/ping", pingRouter);
app.use("/api/milestone", milestoneRouter);
app.use("/api/boost", boostRouter);
app.use("/api/bonus", bonusRouter);
app.use("/api/mine", mineRouter);
app.use("/api/stats", statsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/auth", authRouter);
app.use("/api/swap", swapRouter);
app.use("/api/transaction", transactionRouter);
app.use("/api/transfer", transferRouter);


let botRunning = false;
let isSettingUpBot = false;

const setupBot = async () => {
  if (isSettingUpBot) return;
  isSettingUpBot = true;

  try {
    if (NODE_ENV === "production") {
      if (!RENDER_URL) {
        throw new Error("SERVER_URL is required in production mode");
      }
      
      // Use Telegraf's webhook middleware
      app.use(bot.webhookCallback(webhookPath));
      console.log(`Webhook callback middleware registered for path: ${webhookPath}`);

      const webhookUrl = `${RENDER_URL}${webhookPath}`;
      console.log(`Attempting to set webhook to: ${webhookUrl}`);
      
      await bot.telegram.setWebhook(webhookUrl);
      console.log(`✅ Webhook set successfully to: ${webhookUrl}`);
      
      botRunning = true;
    } else {
      await bot.telegram.deleteWebhook();
      console.log("Deleted webhook for development");
      await bot.launch({ dropPendingUpdates: true });
      console.log("🤖 Bot started in polling mode");
      botRunning = true;
    }
  } catch (error) {
    console.error("❌ Failed to set up bot:", error);
    botRunning = false;
  } finally {
    isSettingUpBot = false;
  }
};

const server = http.createServer(app);
WebSocketService(server);

server.listen(port, async () => {
  console.log(`🚀 Server listening on port ${port}`);
  // Set up bot after server is ready
  await setupBot();
  startTelegramBroadcastWorker();

  // Deposit listener disabled for now
  // try {
  //   await startDepositListener();
  //   console.log("✅ Deposit listener started");
  // } catch (error) {
  //   console.error("❌ Failed to start deposit listener:", error);
  // }
});

const gracefulShutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);

  try {
    await closeTelegramBroadcastQueue();
  } catch (error) {
    console.error("Error closing Telegram broadcast queue:", error);
  }

  // Stop deposit listener
  try {
    // stopDepositListener();
    console.log("Deposit listener stopped");
  } catch (error) {
    console.error("Error stopping deposit listener:", error);
  }

  // Only stop the bot if it's in polling mode
  if (botRunning && NODE_ENV !== "production") {
    try {
      bot.stop(signal);
      console.log("Bot stopped successfully");
    } catch (error) {
      console.error("Error stopping bot:", error);
    }
  }

  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });

  setTimeout(() => {
    console.log("Force exit");
    process.exit(1);
  }, 10000);
};

process.once("SIGINT", () => void gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => void gracefulShutdown("SIGTERM"));

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  void gracefulShutdown("UNCAUGHT_EXCEPTION");
});
