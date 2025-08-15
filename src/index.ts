// (Your imports and other setup)
import express from "express";
import cors from "cors";
require("dotenv").config();
import http from "http";
import morgan from "morgan";
import crypto from "crypto";
import "./db";
import bot from "./bot";
import WebSocketService from "./ws";
import userRoute from "./routes/user.route";
import taskRouter from "./routes/task.route";
import pingRouter from "./routes/ping.route";
import milestoneRouter from "./routes/milestones.route";
import boostRouter from "./routes/boosts.route";
import bonusRouter from "./routes/bonus.route";

const app = express();
const port = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";
const RENDER_URL = process.env.SERVER_URL;
const TELEGRAM_WEBHOOK_PATH = process.env.BOT_WEBHOOK_PATH;

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

app.use(cors({ origin: true }));
app.use(express.json());
app.use(morgan("dev"));

app.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use("/api/user", userRoute);
app.use("/api/task", taskRouter);
app.use("/api/ping", pingRouter);
app.use("/api/milestone", milestoneRouter);
app.use("/api/boost", boostRouter);
app.use("/api/bonus", bonusRouter);

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
});

const gracefulShutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
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

process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});