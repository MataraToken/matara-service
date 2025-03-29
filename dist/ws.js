"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const point_controller_1 = require("./controllers/point.controller");
const io = require("socket.io");
const WebSocketService = (server) => {
    const wsServer = io(server, {
    // options
    });
    wsServer.on("connection", (socket) => {
        console.log("Socket connected");
        socket.on("last-tap-stamp", async (message) => {
            await (0, point_controller_1.saveTimeStamps)(message);
            console.log("Message received: ", message);
        });
        socket.on("receive-points", async (message) => {
            await (0, point_controller_1.addPoints)(message);
            console.log("Message received: ", message);
        });
        socket.on("close", () => {
            console.log("Socket disconnected");
        });
    });
    return io;
};
exports.default = WebSocketService;
//# sourceMappingURL=ws.js.map