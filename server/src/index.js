import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  advanceDisconnectedPlayer,
  createGame,
  MAX_PLAYERS,
  performGameAction,
  publicGame,
  RULE_PRESETS,
} from "./game.js";

const PORT = Number(process.env.PORT ?? 3001);
const OFFLINE_TURN_GRACE_MS = 90_000;
const rooms = new Map();
const app = express();
const httpServer = createServer(app);
const clientOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(httpServer, {
  cors: { origin: clientOrigins, methods: ["GET", "POST"] },
});
const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");

app.get("/health", (_request, response) => response.json({ status: "ok" }));

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_request, response) => response.sendFile(resolve(clientDist, "index.html")));
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
    hostId: room.hostId,
    ruleSet: room.ruleSet,
    rules: room.rules,
    players: [...room.players.values()].map(({ id, name, connected }) => ({ id, name, connected })),
    maxPlayers: MAX_PLAYERS,
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit("room:update", publicRoom(room));
  if (room.game) io.to(room.code).emit("game:update", publicGame(room.game));
  scheduleOfflineAction(room);
}

function pendingActionPlayerId(game) {
  if (game.phase === "debt") return game.debt?.debtorId ?? null;
  if (game.phase === "auction") return game.auction?.turnPlayerId ?? null;
  if (["rolling", "buying", "end-turn"].includes(game.phase)) {
    return game.players[game.currentPlayerIndex]?.id ?? null;
  }
  return null;
}

function clearOfflineActionTimer(room) {
  if (room.offlineActionTimer) clearTimeout(room.offlineActionTimer);
  room.offlineActionTimer = null;
  room.offlineActionKey = null;
}

function scheduleOfflineAction(room) {
  const game = room.game;
  const playerId = game ? pendingActionPlayerId(game) : null;
  const player = playerId ? game.players.find((entry) => entry.id === playerId) : null;
  if (!game || !player || player.connected || room.players.get(playerId)?.connected) {
    clearOfflineActionTimer(room);
    return;
  }

  const actionKey = `${game.turnNumber}:${game.phase}:${playerId}`;
  if (room.offlineActionKey === actionKey && room.offlineActionTimer) return;
  clearOfflineActionTimer(room);
  room.offlineActionKey = actionKey;
  room.offlineActionTimer = setTimeout(() => {
    room.offlineActionTimer = null;
    room.offlineActionKey = null;
    if (rooms.get(room.code) !== room) return;

    try {
      if (advanceDisconnectedPlayer(room.game, playerId)) {
        broadcastRoom(room);
      } else {
        scheduleOfflineAction(room);
      }
    } catch (error) {
      console.error(`Could not advance disconnected player ${playerId} in room ${room.code}:`, error);
    }
  }, OFFLINE_TURN_GRACE_MS);
}

function cleanPlayerName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 20) : "";
}

function cleanPlayerId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(value) ? value : "";
}

function leaveCurrentRoom(socket) {
  const code = socket.data.roomCode;
  const playerId = socket.data.playerId;
  if (!code || !playerId) return;

  const room = rooms.get(code);
  socket.leave(code);
  socket.data.roomCode = undefined;
  socket.data.playerId = undefined;
  if (!room) return;

  const player = room.players.get(playerId);
  if (room.game && player) {
    player.connected = false;
    const gamePlayer = room.game.players.find((entry) => entry.id === playerId);
    if (gamePlayer) gamePlayer.connected = false;
  } else {
    room.players.delete(playerId);
    if (room.hostId === playerId) {
      room.hostId = room.players.keys().next().value ?? null;
    }
  }
  if (room.players.size === 0) {
    clearOfflineActionTimer(room);
    rooms.delete(code);
  } else {
    broadcastRoom(room);
  }
}

function joinRoom(socket, room, playerId, name) {
  leaveCurrentRoom(socket);
  const existingPlayer = room.players.get(playerId);
  if (existingPlayer) {
    existingPlayer.name = name;
    existingPlayer.connected = true;
  } else {
    room.players.set(playerId, { id: playerId, name, connected: true });
  }
  const gamePlayer = room.game?.players.find((player) => player.id === playerId);
  if (gamePlayer) {
    gamePlayer.name = name;
    gamePlayer.connected = true;
  }
  socket.data.roomCode = room.code;
  socket.data.playerId = playerId;
  socket.join(room.code);
  return {
    ok: true,
    room: publicRoom(room),
    ...(room.game ? { game: publicGame(room.game) } : {}),
  };
}

function acknowledge(ack, result) {
  if (typeof ack === "function") ack(result);
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ playerName, playerId } = {}, ack) => {
    const name = cleanPlayerName(playerName);
    const id = cleanPlayerId(playerId);
    if (!name || !id) {
      acknowledge(ack, { ok: false, error: "Enter a player name and refresh before joining." });
      return;
    }

    leaveCurrentRoom(socket);
    const code = createRoomCode();
    const room = {
      code,
      hostId: id,
      ruleSet: "classic",
      rules: { ...RULE_PRESETS.classic },
      players: new Map(),
      kickedPlayerIds: new Set(),
      game: null,
      offlineActionTimer: null,
      offlineActionKey: null,
    };
    rooms.set(code, room);
    acknowledge(ack, joinRoom(socket, room, id, name));
    broadcastRoom(room);
  });

  socket.on("room:join", ({ roomCode, playerName, playerId } = {}, ack) => {
    const name = cleanPlayerName(playerName);
    const id = cleanPlayerId(playerId);
    const code = typeof roomCode === "string" ? roomCode.trim().toUpperCase() : "";
    const room = rooms.get(code);
    if (!name || !id) {
      acknowledge(ack, { ok: false, error: "Enter a player name and refresh before joining." });
      return;
    }
    if (!room) {
      acknowledge(ack, { ok: false, error: "Room not found. Check the code and try again." });
      return;
    }
    if (room.kickedPlayerIds.has(id)) {
      acknowledge(ack, { ok: false, error: "The host removed you from this room." });
      return;
    }
    const isExistingGamePlayer = room.game?.players.some((player) => player.id === id) ?? false;
    if (room.game && !isExistingGamePlayer) {
      acknowledge(ack, { ok: false, error: "This game has already started." });
      return;
    }
    if (!room.game && !room.players.has(id) && room.players.size >= MAX_PLAYERS) {
      acknowledge(ack, { ok: false, error: `This room is full (maximum ${MAX_PLAYERS} players).` });
      return;
    }
    acknowledge(ack, joinRoom(socket, room, id, name));
    broadcastRoom(room);
  });

  socket.on("room:settings", ({ ruleSet, startingCash, auctionsEnabled } = {}, ack) => {
    const room = rooms.get(socket.data.roomCode);
    const playerId = socket.data.playerId;
    if (!room || !playerId || room.hostId !== playerId) {
      acknowledge(ack, { ok: false, error: "Only the room host can change game rules." });
      return;
    }
    if (room.game) {
      acknowledge(ack, { ok: false, error: "Game rules cannot be changed after the game starts." });
      return;
    }
    if (typeof ruleSet !== "string" || !Object.hasOwn(RULE_PRESETS, ruleSet)) {
      acknowledge(ack, { ok: false, error: "Choose a valid game rule preset." });
      return;
    }
    if (!Number.isSafeInteger(startingCash) || startingCash < 500 || startingCash > 5000) {
      acknowledge(ack, { ok: false, error: "Starting cash must be between ₹500 and ₹5,000." });
      return;
    }
    if (typeof auctionsEnabled !== "boolean") {
      acknowledge(ack, { ok: false, error: "Choose whether property auctions are enabled." });
      return;
    }
    room.ruleSet = ruleSet;
    room.rules = {
      ...RULE_PRESETS[ruleSet],
      startingCash,
      auctionsEnabled,
    };
    acknowledge(ack, { ok: true });
    broadcastRoom(room);
  });

  socket.on("room:kick", ({ targetPlayerId } = {}, ack) => {
    const room = rooms.get(socket.data.roomCode);
    const playerId = socket.data.playerId;
    if (!room || !playerId || room.hostId !== playerId) {
      acknowledge(ack, { ok: false, error: "Only the room host can remove players." });
      return;
    }
    if (room.game) {
      acknowledge(ack, { ok: false, error: "Players can only be removed before the game starts." });
      return;
    }
    if (typeof targetPlayerId !== "string" || targetPlayerId === playerId || !room.players.has(targetPlayerId)) {
      acknowledge(ack, { ok: false, error: "That player cannot be removed from the room." });
      return;
    }
    room.players.delete(targetPlayerId);
    room.kickedPlayerIds.add(targetPlayerId);
    for (const memberSocket of io.sockets.sockets.values()) {
      if (memberSocket.data.roomCode === room.code && memberSocket.data.playerId === targetPlayerId) {
        memberSocket.emit("room:kicked");
        memberSocket.leave(room.code);
        memberSocket.data.roomCode = undefined;
        memberSocket.data.playerId = undefined;
      }
    }
    acknowledge(ack, { ok: true });
    broadcastRoom(room);
  });

  socket.on("game:start", (_payload, ack) => {
    const room = rooms.get(socket.data.roomCode);
    const playerId = socket.data.playerId;
    if (!room || !playerId || room.hostId !== playerId) {
      acknowledge(ack, { ok: false, error: "Only the room host can start the game." });
      return;
    }
    if (room.game) {
      acknowledge(ack, { ok: false, error: "The game has already started." });
      return;
    }
    try {
      room.game = createGame(room.code, publicRoom(room).players, room.ruleSet, room.rules);
      acknowledge(ack, { ok: true, room: publicRoom(room), game: publicGame(room.game) });
      broadcastRoom(room);
    } catch (error) {
      acknowledge(ack, { ok: false, error: error.message });
    }
  });

  socket.on("room:leave", () => leaveCurrentRoom(socket));

  socket.on("game:action", (payload, ack) => {
    const room = rooms.get(socket.data.roomCode);
    const playerId = socket.data.playerId;
    if (!room?.game || !playerId) {
      acknowledge(ack, { ok: false, error: "Join a game room before taking actions." });
      return;
    }
    try {
      performGameAction(room.game, playerId, payload);
      acknowledge(ack, { ok: true });
      broadcastRoom(room);
    } catch (error) {
      acknowledge(ack, { ok: false, error: error.message || "That action could not be completed." });
    }
  });

  socket.on("disconnect", () => leaveCurrentRoom(socket));
});

httpServer.listen(PORT, () => {
  console.log(`Monopoly India server listening on port ${PORT}`);
});
