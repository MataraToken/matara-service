"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const morgan_1 = __importDefault(require("morgan"));
const crypto_1 = __importDefault(require("crypto"));
require("dotenv").config();
require("./db");
const bot_1 = __importDefault(require("./bot"));
const ws_1 = __importDefault(require("./ws"));
const user_route_1 = __importDefault(require("./routes/user.route"));
const task_route_1 = __importDefault(require("./routes/task.route"));
const ping_route_1 = __importDefault(require("./routes/ping.route"));
const milestones_route_1 = __importDefault(require("./routes/milestones.route"));
const boosts_route_1 = __importDefault(require("./routes/boosts.route"));
const bonus_route_1 = __importDefault(require("./routes/bonus.route"));
// import cabalRouter from "./routes/cabal.route";
const app = (0, express_1.default)();
const port = process.env.PORT || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";
const RENDER_URL = process.env.SERVER_URL; // e.g., https://your-app.onrender.com
// Generate a secure random path for webhook
const secretPath = `/telegraf/${crypto_1.default.randomBytes(20).toString("hex")}`;
// Middleware setup
app.use((0, cors_1.default)({ origin: true }));
app.use(express_1.default.json());
app.use((0, morgan_1.default)("dev"));
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
app.use("/api/user", user_route_1.default);
app.use("/api/task", task_route_1.default);
app.use("/api/ping", ping_route_1.default);
app.use("/api/milestone", milestones_route_1.default);
app.use("/api/boost", boosts_route_1.default);
app.use("/api/bonus", bonus_route_1.default);
// app.use("/api/cabal", cabalRouter);
if (NODE_ENV === "production") {
    // Webhook mode for production
    app.use(secretPath, bot_1.default.webhookCallback(secretPath));
    const webhookUrl = `${RENDER_URL}${secretPath}`;
    bot_1.default.telegram
        .setWebhook(webhookUrl)
        .then(() => {
        console.log(`✅ Webhook successfully set to: ${webhookUrl}`);
    })
        .catch((err) => {
        console.error("❌ Failed to set webhook:", err);
    });
}
else {
    // Polling mode for development
    bot_1.default.launch({ dropPendingUpdates: true }).then(() => {
        console.log("🤖 Bot running in polling mode (development)");
    });
}
// WebSocket + HTTP server
const server = http_1.default.createServer(app);
(0, ws_1.default)(server);
server.listen(port, () => {
    console.log(`🚀 Server listening on port localhost:${port}`);
});
//# sourceMappingURL=index.js.map