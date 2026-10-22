import assert from "node:assert/strict";
import test from "node:test";
import { BOARD, createGame, MAX_PLAYERS, performGameAction } from "./game.js";

const lobby = [
  { id: "player-one", name: "Asha", connected: true },
  { id: "player-two", name: "Kabir", connected: true },
];

function withRandom(value, callback) {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    callback();
  } finally {
    Math.random = originalRandom;
  }
}

test("board has 40 spaces and every purchasable space has a property", () => {
  const game = createGame("TEST01", lobby);
  assert.equal(BOARD.length, 40);
  assert.equal(game.chanceDeck.length, 16);
  assert.equal(game.chestDeck.length, 16);
  for (const space of BOARD) {
    if (["property", "railroad", "utility"].includes(space.type)) {
      assert.ok(game.properties[space.propertyId], `${space.id} should have a property`);
    }
  }
});

test("game supports ten players with a distinct Indian-themed token for each", () => {
  const players = Array.from({ length: MAX_PLAYERS }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
    connected: true,
  }));
  const game = createGame("TEST10", players);

  assert.equal(game.players.length, 10);
  assert.equal(new Set(game.players.map((player) => player.token)).size, 10);
  assert.throws(
    () => createGame("TEST11", [...players, { id: "player-11", name: "Player 11" }]),
    /2 to 10 players/,
  );
});

test("quick and chaos presets apply their starting cash and rent multipliers", () => {
  for (const [ruleSet, startingCash, rentMultiplier] of [
    ["quick", 1200, 2],
    ["chaos", 1000, 3],
  ]) {
    const game = createGame("TEST01", lobby, ruleSet);
    assert.equal(game.ruleSet, ruleSet);
    assert.equal(game.rules.rentMultiplier, rentMultiplier);
    assert.equal(game.players[0].cash, startingCash);

    const renter = game.players[1];
    game.currentPlayerIndex = 1;
    renter.position = 2;
    game.properties["marine-drive"].ownerId = "player-one";
    withRandom(0.2, () => performGameAction(game, renter.id, { action: "roll" }));

    assert.equal(renter.cash, startingCash - 8 * rentMultiplier);
    assert.equal(game.players[0].cash, startingCash + 8 * rentMultiplier);
  }
});

test("quick preset pays its configured salary when passing GO", () => {
  const game = createGame("TEST01", lobby, "quick");
  for (const property of Object.values(game.properties)) property.ownerId = "player-one";
  game.players[0].position = 38;

  withRandom(0.5, () => performGameAction(game, "player-one", { action: "roll" }));

  assert.equal(game.players[0].position, 6);
  assert.equal(game.players[0].cash, 1500);
});

test("host rule settings override preset starting cash and can disable auctions", () => {
  const game = createGame("TEST01", lobby, "classic", { startingCash: 2500, auctionsEnabled: false });
  assert.equal(game.players[0].cash, 2500);
  assert.equal(game.rules.auctionsEnabled, false);
  game.phase = "buying";
  game.pendingPurchase = { propertyId: "dharavi" };

  performGameAction(game, "player-one", { action: "pass" });

  assert.equal(game.phase, "end-turn");
  assert.equal(game.auction, null);
  assert.equal(game.properties.dharavi.ownerId, null);
  assert.match(game.log[0].text, /auctions are disabled/);
});

test("invalid custom starting cash settings are rejected", () => {
  assert.throws(
    () => createGame("TEST01", lobby, "classic", { startingCash: 499, auctionsEnabled: true }),
    /between â‚¹500 and â‚¹5,000/,
  );
});

test("advance-to-GO cards retain their printed â‚¹200 reward in quick mode", () => {
  const game = createGame("TEST01", lobby, "quick");
  for (const property of Object.values(game.properties)) property.ownerId = "player-one";
  game.players[0].position = 38;
  game.chestDeck[0] = {
    text: "Advance to GO. Collect â‚¹200.",
    action: "move",
    target: 0,
    collectGo: true,
  };

  withRandom(0.2, () => performGameAction(game, "player-one", { action: "roll" }));

  assert.equal(game.players[0].position, 0);
  assert.equal(game.players[0].cash, 1700);
});

test("unknown game rule presets are rejected", () => {
  assert.throws(() => createGame("TEST01", lobby, "unknown"), /valid game rule preset/);
});

test("a non-current player cannot roll", () => {
  const game = createGame("TEST01", lobby);
  assert.throws(() => performGameAction(game, "player-two", { action: "roll" }), /Wait for your turn/);
});

test("third consecutive doubles sends the player to Jail", () => {
  const game = createGame("TEST01", lobby);
  for (const property of Object.values(game.properties)) property.ownerId = "player-one";
  withRandom(0.5, () => {
    for (let roll = 0; roll < 2; roll += 1) {
      performGameAction(game, "player-one", { action: "roll" });
    }
    performGameAction(game, "player-one", { action: "roll" });
  });
  assert.equal(game.players[0].position, 10);
  assert.equal(game.players[0].inJail, true);
  assert.equal(game.phase, "end-turn");
});

test("landing on another player's city charges the listed rent", () => {
  const game = createGame("TEST01", lobby);
  const renter = game.players[1];
  game.currentPlayerIndex = 1;
  renter.position = 2;
  game.properties["marine-drive"].ownerId = "player-one";

  withRandom(0.2, () => performGameAction(game, renter.id, { action: "roll" }));

  assert.equal(renter.position, 6);
  assert.equal(renter.cash, 1492);
  assert.equal(game.players[0].cash, 1508);
  assert.equal(game.phase, "rolling");
});

test("a third-party debtor can mortgage assets and resume the current player's turn", () => {
  const game = createGame("TEST01", lobby);
  const debtor = game.players[1];
  debtor.cash = 0;
  debtor.propertyIds = ["dharavi", "mumbai-market"];
  game.players[0].position = 1;
  game.properties.dharavi.ownerId = debtor.id;
  game.properties["mumbai-market"].ownerId = debtor.id;
  game.chanceDeck[0] = { text: "Collect from every player", action: "collectEach", amount: 50 };

  withRandom(0.4, () => performGameAction(game, "player-one", { action: "roll" }));
  assert.equal(game.phase, "debt");
  assert.equal(game.debt.debtorId, debtor.id);
  assert.equal(game.currentPlayerIndex, 0);

  performGameAction(game, debtor.id, { action: "mortgage", propertyId: "dharavi" });
  performGameAction(game, debtor.id, { action: "mortgage", propertyId: "mumbai-market" });

  assert.equal(game.debt, null);
  assert.equal(debtor.cash, 10);
  assert.equal(game.phase, "rolling");
  assert.equal(game.currentPlayerIndex, 0);
});

test("multiple card debts are resolved in order without overwriting one another", () => {
  const players = [
    ...lobby,
    { id: "player-three", name: "Meera", connected: true },
    { id: "player-four", name: "Dev", connected: true },
  ];
  const game = createGame("TEST01", players);
  const debtor = game.players[0];
  debtor.position = 1;
  debtor.propertyIds = ["taj-mahal"];
  game.properties["taj-mahal"].ownerId = debtor.id;
  game.chanceDeck[0] = { text: "Pay each player", action: "payEach", amount: 800 };

  withRandom(0.4, () => performGameAction(game, debtor.id, { action: "roll" }));
  assert.equal(game.debt.amount, 800);
  assert.equal(game.pendingDebts.length, 1);

  performGameAction(game, debtor.id, { action: "mortgage", propertyId: "taj-mahal" });

  assert.equal(game.debt.amount, 800);
  assert.equal(game.pendingDebts.length, 0);
  assert.equal(debtor.cash, 30);
  assert.equal(game.phase, "debt");
});

test("houses are built evenly and cannot be built during debt resolution", () => {
  const game = createGame("TEST01", lobby);
  const owner = game.players[0];
  owner.propertyIds = ["dharavi", "mumbai-market"];
  game.properties.dharavi.ownerId = owner.id;
  game.properties["mumbai-market"].ownerId = owner.id;
  game.properties.dharavi.houses = 1;

  assert.throws(
    () => performGameAction(game, owner.id, { action: "mortgage", propertyId: "mumbai-market" }),
    /Sell all buildings/,
  );
  assert.throws(
    () => performGameAction(game, owner.id, { action: "build", propertyId: "dharavi" }),
    /Build evenly/,
  );

  game.phase = "debt";
  game.debt = { debtorId: owner.id, creditorId: null, amount: 100, reason: "test", resumePhase: "rolling" };
  assert.throws(
    () => performGameAction(game, owner.id, { action: "build", propertyId: "mumbai-market" }),
    /Resolve your debt/,
  );
});

test("trade offers cannot include developed properties", () => {
  const game = createGame("TEST01", lobby);
  const property = game.properties.dharavi;
  property.ownerId = "player-one";
  property.houses = 1;
  game.players[0].propertyIds.push(property.id);

  assert.throws(() => performGameAction(game, "player-one", {
    action: "trade-offer",
    trade: {
      toPlayerId: "player-two",
      cashFrom: 0,
      cashTo: 0,
      propertiesFrom: ["dharavi"],
      propertiesTo: [],
    },
  }), /without buildings/);
});

test("declining a property starts a fair auction that awards it to the highest bidder", () => {
  const game = createGame("TEST01", lobby);
  game.phase = "buying";
  game.pendingPurchase = { propertyId: "dharavi" };

  performGameAction(game, "player-one", { action: "pass" });
  assert.equal(game.phase, "auction");
  performGameAction(game, "player-one", { action: "auction-bid", amount: 100 });
  performGameAction(game, "player-two", { action: "auction-pass" });

  assert.equal(game.auction, null);
  assert.equal(game.properties.dharavi.ownerId, "player-one");
  assert.equal(game.players[0].cash, 1400);
  assert.equal(game.phase, "end-turn");
});

test("an auction with no bids leaves the property unowned", () => {
  const game = createGame("TEST01", lobby);
  game.phase = "buying";
  game.pendingPurchase = { propertyId: "dharavi" };

  performGameAction(game, "player-one", { action: "pass" });
  performGameAction(game, "player-one", { action: "auction-pass" });
  performGameAction(game, "player-two", { action: "auction-pass" });

  assert.equal(game.properties.dharavi.ownerId, null);
  assert.equal(game.phase, "end-turn");
});
