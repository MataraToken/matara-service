// import express from "express";
// require("dotenv").config();
// import cors from "cors";
// import http from "http";
// import morgan from "morgan";
// import "./db";
// import bot from "./bot";
// import WebSocketService from "./ws";
// const app = express();
// const port = process.env.PORT || 4000;
// import userRoute from "./routes/user.route";
// import taskRouter from "./routes/task.route";
// import pingRouter from "./routes/ping.route";
// import milestoneRouter from './routes/milestones.route';
// import boostRouter from './routes/boosts.route';
// import bonusRouter from './routes/bonus.route';
// import crpyto from "crypto";
// const cry = crpyto.randomBytes(20).toString("hex");
// // import cabalRouter from "./routes/cabal.route";

// //express app
// app.use(cors({ origin: true }));
// app.use(express.json());
// app.use(morgan("dev"));

// app.use((req, res, next) => {
//   const allowedOrigins = [
//     "https://sunflower-flame.vercel.app/",
//     "https://23d8-102-90-65-72.ngrok-free.app",
//     "localhost:5173",
//   ];

//   const origin = req.headers.origin;
//   if (allowedOrigins.includes(origin)) {
//     res.setHeader("Access-Control-Allow-Origin", origin);
//   }
//   res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
//   res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
//   next();
// });

// app.use(bot.webhookCallback(`/telegraf/${cry}`))
// app.use("/api/user", userRoute);
// app.use("/api/task", taskRouter);
// app.use("/api/ping", pingRouter);
// app.use("/api/milestone", milestoneRouter);
// app.use("/api/boost", boostRouter);
// app.use("/api/bonus", bonusRouter);
// // app.use("/api/cabal", cabalRouter);

// const server = http.createServer(app);
// WebSocketService(server);

// server.listen(port, () => {
//   console.log(`Server listening on port localhost:${port}`);
//   bot.launch();
// });

import express from "express";
import cors from "cors";
import http from "http";
import morgan from "morgan";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

import "./db";
import bot from "./bot";
import WebSocketService from "./ws";

import userRoute from "./routes/user.route";
import taskRouter from "./routes/task.route";
import pingRouter from "./routes/ping.route";
import milestoneRouter from "./routes/milestones.route";
import boostRouter from "./routes/boosts.route";
import bonusRouter from "./routes/bonus.route";
// import cabalRouter from "./routes/cabal.route";

const app = express();
const port = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";
const RENDER_URL = process.env.SERVER_URL; // e.g., https://your-app.onrender.com

// Generate a secure random path for webhook
const secretPath = `/telegraf/${crypto.randomBytes(20).toString("hex")}`;

// Middleware setup
app.use(cors({ origin: true }));
app.use(express.json());
app.use(morgan("dev"));

// CORS allowed origins
app.use((req, res, next) => {
  const allowedOrigins = ["", "", "localhost:5173"];

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
// app.use("/api/cabal", cabalRouter);

if (NODE_ENV === "production") {
  // Webhook mode for production
  app.use(secretPath, bot.webhookCallback(secretPath));
  const webhookUrl = `${RENDER_URL}${secretPath}`;
  bot.telegram
    .setWebhook(webhookUrl)
    .then(() => {
      console.log(`✅ Webhook successfully set to: ${webhookUrl}`);
    })
    .catch((err) => {
      console.error("❌ Failed to set webhook:", err);
    });
} else {
  // Polling mode for development
  bot.launch({ dropPendingUpdates: true }).then(() => {
    console.log("🤖 Bot running in polling mode (development)");
  });
}

// WebSocket + HTTP server
const server = http.createServer(app);
WebSocketService(server);

server.listen(port, () => {
  console.log(`🚀 Server listening on port localhost:${port}`);
});
