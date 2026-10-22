import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  advanceDisconnectedPlayer,
  advanceAiPlayer,
  advanceTimedOutPlayer,
  createGame,
  finishTimedGame,
  MAX_PLAYERS,
  performGameAction,
  publicGame,
  RULE_PRESETS,
} from "./game.js";

const PORT = Number(process.env.PORT ?? 3001);
const OFFLINE_BOT_GRACE_MS = 30_000;
const ROLL_DEADLINE_MS = 30_000;
const ACTION_DEADLINE_MS = 45_000;
const DEADLINE_ACTIONS = new Set([
  "roll", "jail-roll", "jail-pay", "buy", "pass", "auction", "auction-bid",
  "auction-pass", "end-turn", "mortgage", "unmortgage", "build", "trade-reply",
  "sell-house", "declare-bankrupt",
]);
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
    sarkariNeelamiCustomized: room.sarkariNeelamiCustomized,
    players: [...room.players.values()].map(({ id, name, connected }) => ({ id, name, connected })),
    maxPlayers: MAX_PLAYERS,
  };
}

function broadcastRoom(room) {
  scheduleOfflineAction(room);
  scheduleBotTradeReplies(room);
  io.to(room.code).emit("room:update", publicRoom(room));
  if (room.game) io.to(room.code).emit("game:update", publicGame(room.game));
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
  if (!game || !player || game.phase === "finished") {
    if (game) game.deadlineAt = null;
    clearOfflineActionTimer(room);
    return;
  }

  const connected = player.isAiBot || (player.connected && room.players.get(playerId)?.connected !== false);
  if (connected) {
    room.offlineSince.delete(playerId);
  } else if (!room.offlineSince.has(playerId)) {
    room.offlineSince.set(playerId, Date.now());
  }
  if (game.deadlineAt === null) {
    game.deadlineAt = Date.now() + (game.phase === "rolling" ? ROLL_DEADLINE_MS : ACTION_DEADLINE_MS);
  }
  const deadlineAt = game.deadlineAt;
  const takeoverAt = (room.offlineSince.get(playerId) ?? Date.now()) + OFFLINE_BOT_GRACE_MS;
  const playerActionAt = player.isAiBot
    ? Date.now() + 700
    : connected
      ? deadlineAt
      : player.botControlled
        ? Date.now() + 700
        : Math.min(deadlineAt, takeoverAt);
  const actionAt = Math.min(game.gameEndsAt ?? Number.MAX_SAFE_INTEGER, playerActionAt);
  const actionKey = `${game.turnNumber}:${game.phase}:${playerId}:${deadlineAt}:${connected ? "connected" : player.botControlled ? "bot" : takeoverAt}`;
  if (room.offlineActionKey === actionKey && room.offlineActionTimer) return;
  clearOfflineActionTimer(room);
  room.offlineActionKey = actionKey;
  room.offlineActionTimer = setTimeout(() => {
    room.offlineActionTimer = null;
    room.offlineActionKey = null;
    if (rooms.get(room.code) !== room) return;

    const currentGame = room.game;
    if (currentGame && finishTimedGame(currentGame)) {
      broadcastRoom(room);
      return;
    }
    const currentPlayer = currentGame?.players.find((entry) => entry.id === playerId);
    if (!currentGame || !currentPlayer || currentGame.deadlineAt !== deadlineAt) {
      scheduleOfflineAction(room);
      return;
    }
    const isConnected = currentPlayer.connected && room.players.get(playerId)?.connected !== false;
    const currentTakeoverAt = (room.offlineSince.get(playerId) ?? Date.now()) + OFFLINE_BOT_GRACE_MS;
    if (!isConnected && !currentPlayer.botControlled && Date.now() < currentTakeoverAt && Date.now() < deadlineAt) {
      scheduleOfflineAction(room);
      return;
    }

    try {
      const advanced = currentPlayer.isAiBot
        ? advanceAiPlayer(currentGame, playerId)
        : isConnected
        ? advanceTimedOutPlayer(currentGame, playerId)
        : advanceDisconnectedPlayer(currentGame, playerId);
      if (advanced) {
        currentGame.deadlineAt = null;
        broadcastRoom(room);
      } else {
        scheduleOfflineAction(room);
      }
    } catch (error) {
      console.error(`Could not advance player ${playerId} in room ${room.code}:`, error);
    }
  }, Math.max(0, actionAt - Date.now()));
}

function scheduleBotTradeReplies(room) {
  const game = room.game;
  if (!game || game.phase === "finished") return;
  for (const trade of game.trades) {
    const bot = game.players.find((player) => player.id === trade.toPlayerId && player.isAiBot);
    if (trade.status !== "pending" || !bot || room.aiTradeTimers.has(trade.id)) continue;
    const timer = setTimeout(() => {
      room.aiTradeTimers.delete(trade.id);
      if (rooms.get(room.code) !== room || room.game !== game) return;
      try {
        if (finishTimedGame(game)) {
          broadcastRoom(room);
          return;
        }
        if (advanceAiPlayer(game, bot.id)) broadcastRoom(room);
      } catch (error) {
        console.error(`Could not resolve bot trade ${trade.id} in room ${room.code}:`, error);
      }
    }, 650);
    room.aiTradeTimers.set(trade.id, timer);
  }
}

function updateAutomaticSarkariSetting(room) {
  if (!room.sarkariNeelamiCustomized) {
    room.rules.sarkariNeelamiEnabled = room.players.size + room.rules.botCount >= 6;
  }
}

function cleanPlayerName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 20) : "";
}

function cleanPlayerId(value) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(value) && !value.startsWith("bot-") ? value : "";
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
    room.offlineSince.set(playerId, Date.now());
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
  updateAutomaticSarkariSetting(room);
  const gamePlayer = room.game?.players.find((player) => player.id === playerId);
  if (gamePlayer) {
    gamePlayer.name = name;
    gamePlayer.connected = true;
    gamePlayer.botControlled = false;
    room.offlineSince.delete(playerId);
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
      rules: {
        ...RULE_PRESETS.classic,
        gameDurationMinutes: 0,
        bankruptAuctionsEnabled: true,
        sarkariNeelamiEnabled: false,
        botCount: 0,
      },
      sarkariNeelamiCustomized: false,
      players: new Map(),
      kickedPlayerIds: new Set(),
      game: null,
      offlineActionTimer: null,
      offlineActionKey: null,
      offlineSince: new Map(),
      aiTradeTimers: new Map(),
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
    const isExistingGamePlayer = room.game?.players.some((player) => player.id === id && !player.isAiBot) ?? false;
    if (room.game && !isExistingGamePlayer) {
      acknowledge(ack, { ok: false, error: "This game has already started." });
      return;
    }
    if (!room.game && !room.players.has(id) && room.players.size + room.rules.botCount >= MAX_PLAYERS) {
      acknowledge(ack, { ok: false, error: `This room is full (maximum ${MAX_PLAYERS} players).` });
      return;
    }
    acknowledge(ack, joinRoom(socket, room, id, name));
    broadcastRoom(room);
  });

  socket.on("room:settings", ({
    ruleSet,
    startingCash,
    auctionsEnabled,
    seasonsEnabled,
    gameDurationMinutes,
    bankruptAuctionsEnabled,
    sarkariNeelamiEnabled,
    sarkariNeelamiManualChange,
    botCount,
  } = {}, ack) => {
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
    if (typeof seasonsEnabled !== "boolean") {
      acknowledge(ack, { ok: false, error: "Choose whether random season events are enabled." });
      return;
    }
    if (![0, 30, 60, 90, 120].includes(gameDurationMinutes)) {
      acknowledge(ack, { ok: false, error: "Choose no time limit or a 30, 60, 90, or 120 minute game." });
      return;
    }
    if (typeof bankruptAuctionsEnabled !== "boolean" || typeof sarkariNeelamiEnabled !== "boolean") {
      acknowledge(ack, { ok: false, error: "Choose valid auction settings." });
      return;
    }
    if (typeof botCount !== "number" || !Number.isSafeInteger(botCount) || botCount < 0 || botCount > 9) {
      acknowledge(ack, { ok: false, error: "Choose between zero and nine learning bots." });
      return;
    }
    if (room.players.size + botCount > MAX_PLAYERS) {
      acknowledge(ack, { ok: false, error: `Players and bots cannot exceed ${MAX_PLAYERS} seats.` });
      return;
    }
    room.ruleSet = ruleSet;
    if (sarkariNeelamiManualChange === true) room.sarkariNeelamiCustomized = true;
    room.rules = {
      ...RULE_PRESETS[ruleSet],
      startingCash,
      auctionsEnabled,
      seasonsEnabled,
      gameDurationMinutes,
      bankruptAuctionsEnabled,
      sarkariNeelamiEnabled,
      botCount,
    };
    updateAutomaticSarkariSetting(room);
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
    updateAutomaticSarkariSetting(room);
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
    const totalPlayers = room.players.size + room.rules.botCount;
    if (totalPlayers < 2 || totalPlayers > MAX_PLAYERS) {
      acknowledge(ack, { ok: false, error: `A game needs 2 to ${MAX_PLAYERS} players or bots.` });
      return;
    }
    const bots = Array.from({ length: room.rules.botCount }, (_, index) => ({
      id: `bot-${room.code}-${index + 1}`,
      name: ["Chai Champion", "Property Pro", "Market Maharaja", "Smart Investor", "City Strategist"][index % 5] +
        (index >= 5 ? ` ${index + 1}` : ""),
      connected: true,
      isAiBot: true,
    }));
    try {
      room.game = createGame(room.code, [...publicRoom(room).players, ...bots], room.ruleSet, room.rules);
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
      if (finishTimedGame(room.game)) {
        broadcastRoom(room);
        acknowledge(ack, { ok: false, error: "The game's time limit has expired." });
        return;
      }
      performGameAction(room.game, playerId, payload);
      if (DEADLINE_ACTIONS.has(payload?.action)) room.game.deadlineAt = null;
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
