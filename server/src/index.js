import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT ?? 3001);
const MAX_PLAYERS = 6;
const rooms = new Map();
const app = express();
const httpServer = createServer(app);
const clientOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(httpServer, {
  cors: {
    origin: clientOrigins,
    methods: ["GET", "POST"],
  },
});
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_request, response) => {
    response.sendFile(resolve(clientDist, "index.html"));
  });
}

function createRoomCode() {
  let code;
  do {
    code = randomBytes(3).toString("hex").toUpperCase();
  } while (rooms.has(code));
  return code;
}

function publicRoom(room) {
  return {
    code: room.code,
    players: [...room.players.values()],
    maxPlayers: MAX_PLAYERS,
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
}

function cleanPlayerName(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 20);
}

function leaveCurrentRoom(socket) {
  const code = socket.data.roomCode;
  if (!code) return;

  const room = rooms.get(code);
  socket.leave(code);
  socket.data.roomCode = undefined;
  if (!room) return;

  room.players.delete(socket.id);
  if (room.players.size === 0) {
    rooms.delete(code);
  } else {
    broadcastRoom(room);
  }
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ playerName } = {}, acknowledge) => {
    const name = cleanPlayerName(playerName);
    if (!name) {
      acknowledge?.({ ok: false, error: "Enter a player name (up to 20 characters)." });
      return;
    }

    leaveCurrentRoom(socket);
    const code = createRoomCode();
    const room = {
      code,
      players: new Map([[socket.id, { id: socket.id, name }]]),
    };
    rooms.set(code, room);
    socket.data.roomCode = code;
    socket.join(code);
    acknowledge?.({ ok: true, room: publicRoom(room) });
    broadcastRoom(room);
  });

  socket.on("room:join", ({ roomCode, playerName } = {}, acknowledge) => {
    const name = cleanPlayerName(playerName);
    const code = typeof roomCode === "string" ? roomCode.trim().toUpperCase() : "";
    const room = rooms.get(code);

    if (!name) {
      acknowledge?.({ ok: false, error: "Enter a player name (up to 20 characters)." });
      return;
    }
    if (!room) {
      acknowledge?.({ ok: false, error: "Room not found. Check the code and try again." });
      return;
    }
    if (socket.data.roomCode === code) {
      const player = room.players.get(socket.id);
      if (player) player.name = name;
      acknowledge?.({ ok: true, room: publicRoom(room) });
      broadcastRoom(room);
      return;
    }
    if (room.players.size >= MAX_PLAYERS) {
      acknowledge?.({ ok: false, error: "This room is full (maximum 6 players)." });
      return;
    }

    leaveCurrentRoom(socket);
    room.players.set(socket.id, { id: socket.id, name });
    socket.data.roomCode = code;
    socket.join(code);
    acknowledge?.({ ok: true, room: publicRoom(room) });
    broadcastRoom(room);
  });

  socket.on("disconnect", () => leaveCurrentRoom(socket));
});

httpServer.listen(PORT, () => {
  console.log("Monopoly India server listening on http://localhost:" + PORT);
});
