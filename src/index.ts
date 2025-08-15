
// import express from "express";
// import cors from "cors";
// import http from "http";
// import morgan from "morgan";
// import crypto from "crypto";
// require("dotenv").config();

// import "./db";
// import bot from "./bot";
// import WebSocketService from "./ws";

// import userRoute from "./routes/user.route";
// import taskRouter from "./routes/task.route";
// import pingRouter from "./routes/ping.route";
// import milestoneRouter from "./routes/milestones.route";
// import boostRouter from "./routes/boosts.route";
// import bonusRouter from "./routes/bonus.route";
// // import cabalRouter from "./routes/cabal.route";

// const app = express();
// const port = process.env.PORT || 4000;
// const NODE_ENV = process.env.NODE_ENV || "development";
// const RENDER_URL = process.env.SERVER_URL; // e.g., https://your-app.onrender.com

// // Generate a secure random path for webhook
// const secretPath =
//   NODE_ENV === "production"
//     ? `/telegraf/${process.env.BOT_WEBHOOK_PATH || "default-webhook"}`
//     : `/telegraf/${Math.random().toString(36).substring(2)}`;
// // Middleware setup
// app.use(cors({ origin: true }));
// app.use(express.json());
// app.use(morgan("dev"));

// // CORS allowed origins
// app.use((req, res, next) => {
//   const allowedOrigins = ["", "", "localhost:5173"];

//   const origin = req.headers.origin;
//   if (origin && allowedOrigins.includes(origin)) {
//     res.setHeader("Access-Control-Allow-Origin", origin);
//   }
//   res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
//   res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
//   next();
// });

// // API routes
// app.use("/api/user", userRoute);
// app.use("/api/task", taskRouter);
// app.use("/api/ping", pingRouter);
// app.use("/api/milestone", milestoneRouter);
// app.use("/api/boost", boostRouter);
// app.use("/api/bonus", bonusRouter);
// // app.use("/api/cabal", cabalRouter);

// if (NODE_ENV === "production") {
//   // Webhook mode for production
//   app.use(secretPath, bot.webhookCallback(secretPath));
//   const webhookUrl = `${RENDER_URL}${secretPath}`;
//   bot.telegram
//     .setWebhook(webhookUrl)
//     .then(() => {
//       console.log(`✅ Webhook successfully set to: ${webhookUrl}`);
//     })
//     .catch((err) => {
//       console.error("❌ Failed to set webhook:", err);
//     });
// } else {
//   // Polling mode for development
//   bot.launch({ dropPendingUpdates: true }).then(() => {
//     console.log("🤖 Bot running in polling mode (development)");
//   });
// }

// // WebSocket + HTTP server
// const server = http.createServer(app);
// WebSocketService(server);

// server.listen(port, () => {
//   console.log(`🚀 Server listening on port localhost:${port}`);
// });



import express from "express";
import cors from "cors";
import http from "http";
import morgan from "morgan";
import crypto from "crypto";
require("dotenv").config();

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
const RENDER_URL = process.env.SERVER_URL; // e.g., https://your-app.onrender.com

// Generate webhook path using bot token hash (consistent across restarts)
const generateWebhookPath = () => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
  
  if (NODE_ENV === "production") {
    // Use a hash of the bot token for consistent webhook path
    const hash = crypto.createHash('sha256').update(botToken).digest('hex').substring(0, 32);
    return `/telegraf/${hash}`;
  } else {
    // For development, use a simple path
    return `/telegraf/dev`;
  }
};

const secretPath = generateWebhookPath();

// Middleware setup
app.use(cors({ origin: true }));
app.use(express.json());
app.use(morgan("dev"));

// CORS allowed origins
app.use((req, res, next) => {
  const allowedOrigins = ["http://localhost:5173", "https://your-frontend-domain.com"];

  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// API routes
app.use("/api/user", userRoute);
app.use("/api/task", taskRouter);
app.use("/api/ping", pingRouter);
app.use("/api/milestone", milestoneRouter);
app.use("/api/boost", boostRouter);
app.use("/api/bonus", bonusRouter);

// Bot setup
let botRunning = false;

const setupBot = async () => {
  try {
    if (NODE_ENV === "production") {
      // Webhook mode for production
      console.log(`Setting up webhook at path: ${secretPath}`);
      
      // Set up the webhook callback BEFORE setting the webhook URL
      app.use(secretPath, bot.webhookCallback(secretPath));
      
      const webhookUrl = `${RENDER_URL}${secretPath}`;
      console.log(`Setting webhook URL to: ${webhookUrl}`);
      
      // Set the webhook
      await bot.telegram.setWebhook(webhookUrl);
      console.log(`✅ Webhook successfully set to: ${webhookUrl}`);
      botRunning = true;
      
    } else {
      // Polling mode for development
      // Make sure to delete webhook first in development
      await bot.telegram.deleteWebhook();
      console.log("Deleted webhook for development mode");
      
      await bot.launch({ dropPendingUpdates: true });
      console.log("🤖 Bot running in polling mode (development)");
      botRunning = true;
    }
  } catch (error) {
    console.error("❌ Failed to setup bot:", error);
  }
};

// WebSocket + HTTP server
const server = http.createServer(app);
WebSocketService(server);

server.listen(port, async () => {
  console.log(`🚀 Server listening on port localhost:${port}`);
  await setupBot();
});

// Graceful shutdown with proper checks
const gracefulShutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  if (botRunning) {
    try {
      bot.stop(signal);
      botRunning = false;
      console.log("Bot stopped successfully");
    } catch (error) {
      console.error("Error stopping bot:", error);
    }
  }
  
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
};

process.once("SIGINT", () => gracefulShutdown("SIGINT"));
process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Handle uncaught exceptions
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});