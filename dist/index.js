"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// (Your imports and other setup)
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
require("dotenv").config();
const http_1 = __importDefault(require("http"));
const morgan_1 = __importDefault(require("morgan"));
require("./db");
const bot_1 = __importDefault(require("./bot"));
const ws_1 = __importDefault(require("./ws"));
const user_route_1 = __importDefault(require("./routes/user.route"));
const task_route_1 = __importDefault(require("./routes/task.route"));
const ping_route_1 = __importDefault(require("./routes/ping.route"));
const milestones_route_1 = __importDefault(require("./routes/milestones.route"));
const boosts_route_1 = __importDefault(require("./routes/boosts.route"));
const bonus_route_1 = __importDefault(require("./routes/bonus.route"));
const app = (0, express_1.default)();
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
if (!TELEGRAM_WEBHOOK_PATH) {
    throw new Error("TELEGRAM_WEBHOOK_URL is required");
}
const webhookPath = `/telegraf/${TELEGRAM_WEBHOOK_PATH}`;
app.use((0, cors_1.default)({ origin: true }));
app.use(express_1.default.json());
app.use((0, morgan_1.default)("dev"));
app.get('/', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// API routes
app.use("/api/user", user_route_1.default);
app.use("/api/task", task_route_1.default);
app.use("/api/ping", ping_route_1.default);
app.use("/api/milestone", milestones_route_1.default);
app.use("/api/boost", boosts_route_1.default);
app.use("/api/bonus", bonus_route_1.default);
let botRunning = false;
let isSettingUpBot = false;
const setupBot = async () => {
    if (isSettingUpBot)
        return;
    isSettingUpBot = true;
    try {
        if (NODE_ENV === "production") {
            if (!RENDER_URL) {
                throw new Error("SERVER_URL is required in production mode");
            }
            // Use Telegraf's webhook middleware
            app.use(bot_1.default.webhookCallback(webhookPath));
            console.log(`Webhook callback middleware registered for path: ${webhookPath}`);
            const webhookUrl = `${RENDER_URL}${webhookPath}`;
            console.log(`Attempting to set webhook to: ${webhookUrl}`);
            await bot_1.default.telegram.setWebhook(webhookUrl);
            console.log(`✅ Webhook set successfully to: ${webhookUrl}`);
            botRunning = true;
        }
        else {
            await bot_1.default.telegram.deleteWebhook();
            console.log("Deleted webhook for development");
            await bot_1.default.launch({ dropPendingUpdates: true });
            console.log("🤖 Bot started in polling mode");
            botRunning = true;
        }
    }
    catch (error) {
        console.error("❌ Failed to set up bot:", error);
        botRunning = false;
    }
    finally {
        isSettingUpBot = false;
    }
};
const server = http_1.default.createServer(app);
(0, ws_1.default)(server);
server.listen(port, async () => {
    console.log(`🚀 Server listening on port ${port}`);
    // Set up bot after server is ready
    await setupBot();
});
const gracefulShutdown = (signal) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    // Only stop the bot if it's in polling mode
    if (botRunning && NODE_ENV !== "production") {
        try {
            bot_1.default.stop(signal);
            console.log("Bot stopped successfully");
        }
        catch (error) {
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
//# sourceMappingURL=index.js.map