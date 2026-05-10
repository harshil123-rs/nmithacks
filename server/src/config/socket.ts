import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "http";

let io: SocketServer;

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "https://nmithacks.vercel.app",
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log(
      `[Socket] Client connected: ${socket.id} (transport: ${socket.conn.transport.name})`,
    );

    // Allow clients to join a user-specific room (with dedup)
    socket.on("join", (userId: string) => {
      if (userId) {
        const room = `user:${userId}`;
        if (!socket.rooms.has(room)) {
          socket.join(room);
          console.log(`[Socket] ${socket.id} joined room ${room}`);
        } else {
          console.log(`[Socket] ${socket.id} already in room ${room}`);
        }
      } else {
        console.warn(`[Socket] ${socket.id} sent join with empty userId`);
      }
    });

    socket.on("disconnect", (reason) => {
      console.log(
        `[Socket] Client disconnected: ${socket.id} (reason: ${reason})`,
      );
    });
  });

  console.log("[Socket] Socket.io initialized");
  return io;
}

export function getIO(): SocketServer {
  if (!io) throw new Error("Socket.io not initialized — call initSocket first");
  return io;
}
