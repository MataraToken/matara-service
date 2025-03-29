"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
require("dotenv").config();
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const morgan_1 = __importDefault(require("morgan"));
require("./db");
const bot_1 = __importDefault(require("./bot"));
const ws_1 = __importDefault(require("./ws"));
const app = (0, express_1.default)();
const port = process.env.PORT || 4000;
const user_route_1 = __importDefault(require("./routes/user.route"));
const task_route_1 = __importDefault(require("./routes/task.route"));
const ping_route_1 = __importDefault(require("./routes/ping.route"));
const milestones_route_1 = __importDefault(require("./routes/milestones.route"));
const boosts_route_1 = __importDefault(require("./routes/boosts.route"));
const bonus_route_1 = __importDefault(require("./routes/bonus.route"));
// import cabalRouter from "./routes/cabal.route";
//express app
app.use((0, cors_1.default)({ origin: true }));
app.use(express_1.default.json());
app.use((0, morgan_1.default)("dev"));
app.use((req, res, next) => {
    const allowedOrigins = [
        "https://sunflower-flame.vercel.app/",
        "https://23d8-102-90-65-72.ngrok-free.app",
        "localhost:5173",
    ];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});
app.use("/api/user", user_route_1.default);
app.use("/api/task", task_route_1.default);
app.use("/api/ping", ping_route_1.default);
app.use("/api/milestone", milestones_route_1.default);
app.use("/api/boost", boosts_route_1.default);
app.use("/api/bonus", bonus_route_1.default);
// app.use("/api/cabal", cabalRouter);
const server = http_1.default.createServer(app);
(0, ws_1.default)(server);
server.listen(port, () => {
    console.log(`Server listening on port localhost:${port}`);
    bot_1.default.launch();
});
//# sourceMappingURL=index.js.map