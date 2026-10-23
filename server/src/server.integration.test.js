import assert from "node:assert/strict";
import test from "node:test";
import { io as createClient } from "socket.io-client";

process.env.NODE_ENV = "test";

const { httpServer, io, rooms } = await import("./index.js");
const hostId = "player-host-001";
const guestId = "player-guest-001";

function waitForEvent(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}.`));
    }, 5000);
    const listener = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(event, listener);
      resolve(payload);
    };
    socket.on(event, listener);
  });
}

function acknowledge(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} acknowledgement timed out.`)), 5000);
    socket.emit(event, payload, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}

function waitForGame(socket, predicate) {
  return waitForEvent(socket, "game:update", predicate);
}

async function assertBroadcastAction(players, actor, payload, predicate) {
  const updates = players.map((socket) => waitForGame(socket, predicate));
  const result = await acknowledge(actor, "game:action", payload);
  assert.equal(result.ok, true, result.error);
  const [hostGame, guestGame] = await Promise.all(updates);
  assert.deepEqual(hostGame, guestGame);
  return hostGame;
}

test("two Socket.IO players synchronize a game, auctions, chat, and trade outcomes", {
  timeout: 20_000,
}, async (t) => {
  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, resolve);
  });
  const address = httpServer.address();
  assert.ok(address && typeof address === "object");
  const serverUrl = `http://127.0.0.1:${address.port}`;
  const host = createClient(serverUrl, { forceNew: true, reconnection: false, timeout: 5000 });
  const guest = createClient(serverUrl, { forceNew: true, reconnection: false, timeout: 5000 });
  const players = [host, guest];

  t.after(async () => {
    host.disconnect();
    guest.disconnect();
    await new Promise((resolve) => io.close(resolve));
    for (const room of rooms.values()) {
      if (room.offlineActionTimer) clearTimeout(room.offlineActionTimer);
      for (const timer of room.tradeTimers.values()) clearTimeout(timer);
      for (const timer of room.aiTradeTimers.values()) clearTimeout(timer);
    }
    rooms.clear();
  });

  await Promise.all(players.map((socket) => new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
    socket.connect();
  })));

  const created = await acknowledge(host, "room:create", {
    playerName: "Asha",
    playerId: hostId,
  });
  assert.equal(created.ok, true, created.error);
  const roomCode = created.room.code;

  const joined = await acknowledge(guest, "room:join", {
    roomCode,
    playerName: "Kabir",
    playerId: guestId,
  });
  assert.equal(joined.ok, true, joined.error);
  assert.equal(joined.room.players.length, 2);

  const startUpdates = players.map((socket) => waitForGame(socket, (game) => game.players.length === 2));
  const started = await acknowledge(host, "game:start");
  assert.equal(started.ok, true, started.error);
  const [hostStart, guestStart] = await Promise.all(startUpdates);
  assert.deepEqual(hostStart, guestStart);
  assert.equal(hostStart.phase, "rolling");

  const room = rooms.get(roomCode);
  assert.ok(room?.game);
  room.game.phase = "buying";
  room.game.pendingPurchase = { propertyId: "marine-drive" };

  await assertBroadcastAction(players, host, { action: "auction" }, (game) => game.phase === "auction");
  const auctionBid = await assertBroadcastAction(
    players,
    host,
    { action: "auction-bid", amount: 1 },
    (game) => game.auction?.highestBid === 1 && game.auction.turnPlayerId === guestId,
  );
  assert.equal(auctionBid.auction.highestBidderId, hostId);
  const wonAuction = await assertBroadcastAction(
    players,
    guest,
    { action: "auction-pass" },
    (game) => game.phase === "end-turn",
  );
  assert.equal(wonAuction.properties["marine-drive"].ownerId, hostId);

  room.game.phase = "buying";
  room.game.pendingPurchase = { propertyId: "jaipur" };
  await assertBroadcastAction(players, host, { action: "auction" }, (game) => game.phase === "auction");
  await assertBroadcastAction(
    players,
    host,
    { action: "auction-pass" },
    (game) => game.auction?.turnPlayerId === guestId && game.auction.passedPlayerIds.includes(hostId),
  );
  const passedAuction = await assertBroadcastAction(
    players,
    guest,
    { action: "auction-pass" },
    (game) => game.phase === "end-turn",
  );
  assert.equal(passedAuction.properties.jaipur.ownerId, null);

  const chatUpdate = await assertBroadcastAction(
    players,
    guest,
    { action: "chat", text: "Good game!" },
    (game) => game.chat.some((message) => message.text === "Good game!"),
  );
  assert.equal(chatUpdate.chat.at(-1).playerId, guestId);

  const rejectedOffer = await assertBroadcastAction(
    players,
    host,
    {
      action: "trade-offer",
      trade: {
        toPlayerId: guestId,
        cashFrom: 0,
        cashTo: 75,
        propertiesFrom: ["marine-drive"],
        propertiesTo: [],
      },
    },
    (game) => game.trades[0]?.status === "pending",
  );
  await assertBroadcastAction(
    players,
    guest,
    { action: "trade-reply", tradeId: rejectedOffer.trades[0].id, accept: false },
    (game) => game.trades[0]?.status === "rejected",
  );
  assert.equal(room.game.properties["marine-drive"].ownerId, hostId);

  const counteredOffer = await assertBroadcastAction(
    players,
    host,
    {
      action: "trade-offer",
      trade: {
        toPlayerId: guestId,
        cashFrom: 0,
        cashTo: 75,
        propertiesFrom: ["marine-drive"],
        propertiesTo: [],
      },
    },
    (game) => game.trades[0]?.status === "pending",
  );
  const countered = await assertBroadcastAction(
    players,
    guest,
    {
      action: "trade-counter",
      tradeId: counteredOffer.trades[0].id,
      trade: {
        cashFrom: 50,
        cashTo: 0,
        propertiesFrom: [],
        propertiesTo: ["marine-drive"],
      },
    },
    (game) => game.trades[0]?.status === "pending" && game.trades[0]?.fromPlayerId === guestId,
  );
  assert.equal(countered.trades[1].status, "countered");
  const acceptedCounter = await assertBroadcastAction(
    players,
    host,
    { action: "trade-reply", tradeId: countered.trades[0].id, accept: true },
    (game) => game.trades[0]?.status === "accepted",
  );
  assert.equal(acceptedCounter.properties["marine-drive"].ownerId, guestId);
  assert.equal(acceptedCounter.players.find((player) => player.id === hostId).cash, 1549);
  assert.equal(acceptedCounter.players.find((player) => player.id === guestId).cash, 1450);

  const acceptedOffer = await assertBroadcastAction(
    players,
    host,
    {
      action: "trade-offer",
      trade: {
        toPlayerId: guestId,
        cashFrom: 25,
        cashTo: 0,
        propertiesFrom: [],
        propertiesTo: [],
      },
    },
    (game) => game.trades[0]?.status === "pending",
  );
  const acceptedTrade = await assertBroadcastAction(
    players,
    guest,
    { action: "trade-reply", tradeId: acceptedOffer.trades[0].id, accept: true },
    (game) => game.trades[0]?.status === "accepted",
  );
  assert.equal(acceptedTrade.players.find((player) => player.id === hostId).cash, 1524);
  assert.equal(acceptedTrade.players.find((player) => player.id === guestId).cash, 1475);
});
