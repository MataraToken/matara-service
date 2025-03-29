import { addPoints, saveTimeStamps } from "./controllers/point.controller";
import { PointsTypes } from "./types";

const io = require("socket.io");

const WebSocketService = (server: any) => {
  const wsServer = io(server, {
    // options
  });

  wsServer.on("connection", (socket: any) => {
    console.log("Socket connected");

    socket.on("last-tap-stamp", async (message: any) => {
      await saveTimeStamps(message);
      console.log("Message received: ", message);
    });

    socket.on("receive-points", async (message: PointsTypes) => {
      await addPoints(message);
      console.log("Message received: ", message);
    });

    socket.on("close", () => {
      console.log("Socket disconnected");
    });
    
  });

  return io;
};

export default WebSocketService;
