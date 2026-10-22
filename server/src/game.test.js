import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceAiPlayer,
  advanceDisconnectedPlayer,
  advanceTimedOutPlayer,
  BOARD,
  createGame,
  expireTradeOffer,
  finishTimedGame,
  MAX_PLAYERS,
  performGameAction,
} from "./game.js";

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

test("season events start every fourth completed table round and never repeat", () => {
  let game;
  withRandom(0, () => { game = createGame("TEST01", lobby, "classic", { seasonsEnabled: true }); });
  assert.equal(game.roundNumber, 1);
  assert.equal(game.seasonEvent, null);

  const finishCurrentTurn = () => {
    const player = game.players[game.currentPlayerIndex];
    game.phase = "end-turn";
    withRandom(0, () => performGameAction(game, player.id, { action: "end-turn" }));
  };

  finishCurrentTurn();
  assert.equal(game.roundNumber, 1);
  assert.equal(game.seasonEvent, null);
  finishCurrentTurn();
  assert.equal(game.roundNumber, 2);
  assert.equal(game.seasonEvent, null);
  finishCurrentTurn();
  finishCurrentTurn();
  assert.equal(game.roundNumber, 3);
  assert.equal(game.seasonEvent, null);
  finishCurrentTurn();
  finishCurrentTurn();
  assert.equal(game.roundNumber, 4);
  assert.equal(game.seasonEvent.id, "railway-rush");
  const firstSpecialSeasonId = game.seasonEvent.id;

  while (game.roundNumber < 8) finishCurrentTurn();
  assert.equal(game.seasonEvent.id === firstSpecialSeasonId, false);
});

test("special seasons apply their rent, construction, and festival effects", () => {
  const railwayRush = createGame("TEST01", lobby, "classic", { seasonsEnabled: true });
  railwayRush.seasonEvent = { id: "railway-rush", title: "Railway Rush", description: "Railway rent is doubled." };
  railwayRush.currentPlayerIndex = 1;
  railwayRush.players[1].position = 37;
  railwayRush.properties["central-railway"].ownerId = "player-one";
  withRandom(0.5, () => performGameAction(railwayRush, "player-two", { action: "roll" }));
  assert.equal(railwayRush.players[1].cash, 1650);
  assert.equal(railwayRush.players[0].cash, 1550);

  const constructionBoom = createGame("TEST01", lobby, "classic", { seasonsEnabled: true });
  constructionBoom.seasonEvent = { id: "construction-boom", title: "Construction Boom", description: "Construction costs are doubled." };
  constructionBoom.properties.dharavi.ownerId = "player-one";
  constructionBoom.properties["mumbai-market"].ownerId = "player-one";
  performGameAction(constructionBoom, "player-one", { action: "build", propertyId: "dharavi" });
  assert.equal(constructionBoom.players[0].cash, 1400);
  assert.equal(constructionBoom.properties.dharavi.houses, 1);

  const rentRelief = createGame("TEST01", lobby, "classic", { seasonsEnabled: true });
  rentRelief.seasonEvent = { id: "rent-relief", title: "Rent Relief", description: "Rent is halved." };
  rentRelief.currentPlayerIndex = 1;
  rentRelief.players[1].position = 2;
  rentRelief.properties["marine-drive"].ownerId = "player-one";
  withRandom(0.333, () => performGameAction(rentRelief, "player-two", { action: "roll" }));
  assert.equal(rentRelief.players[1].cash, 1496);
  assert.equal(rentRelief.players[0].cash, 1504);

  const festival = createGame("TEST01", lobby, "classic", { seasonsEnabled: true });
  festival.roundNumber = 3;
  festival.currentPlayerIndex = 1;
  festival.phase = "end-turn";
  withRandom(0.999, () => performGameAction(festival, "player-two", { action: "end-turn" }));
  assert.equal(festival.seasonEvent.id, "festival-bonus");
  assert.deepEqual(festival.players.map((player) => player.cash), [1700, 1700]);
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
    /between ₹500 and ₹5,000/,
  );
});

test("advance-to-GO cards retain their printed ₹200 reward in quick mode", () => {
  const game = createGame("TEST01", lobby, "quick");
  for (const property of Object.values(game.properties)) property.ownerId = "player-one";
  game.players[0].position = 38;
  game.chestDeck[0] = {
    text: "Advance to GO. Collect ₹200.",
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

test("landing exactly on GO pays a double salary while passing only pays the normal salary", () => {
  const exactGame = createGame("TEST01", lobby);
  exactGame.players[0].position = 38;
  withRandom(0, () => performGameAction(exactGame, "player-one", { action: "roll" }));
  assert.equal(exactGame.players[0].position, 0);
  assert.equal(exactGame.players[0].cash, 1900);
  assert.match(exactGame.log[0].text, /lands exactly on GO/);

  const passingGame = createGame("TEST02", lobby);
  passingGame.players[0].position = 37;
  withRandom(0.2, () => performGameAction(passingGame, "player-one", { action: "roll" }));
  assert.equal(passingGame.players[0].position, 1);
  assert.equal(passingGame.players[0].cash, 1700);
  assert.match(passingGame.log[0].text, /passes GO/);
});

test("time limit winner is ranked by cash and then property count", () => {
  const game = createGame("TEST01", lobby, "classic", { gameDurationMinutes: 30 });
  game.gameEndsAt = Date.now() - 1;
  game.players[0].cash = 500;
  game.players[1].cash = 500;
  game.players[1].propertyIds.push("goa");
  game.properties.goa.ownerId = "player-two";

  assert.equal(finishTimedGame(game), true);
  assert.equal(game.phase, "finished");
  assert.equal(game.endReason, "time-limit");
  assert.equal(game.winnerPlayerId, "player-two");
  assert.match(game.log[0].text, /wins on time/);
});

test("Sarkari Neelami starts on round four with a half-price opening bid", () => {
  const game = createGame("TEST01", lobby, "classic", { sarkariNeelamiEnabled: true });
  const endTurn = () => {
    const player = game.players[game.currentPlayerIndex];
    game.phase = "end-turn";
    withRandom(0, () => performGameAction(game, player.id, { action: "end-turn" }));
  };
  endTurn();
  endTurn();
  endTurn();
  endTurn();
  endTurn();
  endTurn();

  assert.equal(game.roundNumber, 4);
  assert.equal(game.phase, "auction");
  assert.equal(game.auction.source, "sarkari");
  assert.equal(game.auction.minimumBid, Math.ceil(game.properties[game.auction.propertyId].price / 2));
  assert.throws(
    () => performGameAction(game, game.auction.turnPlayerId, {
      action: "auction-bid",
      amount: game.auction.minimumBid - 1,
    }),
    /Bid at least/,
  );
});

test("Sarkari Neelami runs every other round below eight players and every round at eight", () => {
  const game = createGame("TEST01", lobby, "classic", { sarkariNeelamiEnabled: true });
  game.roundNumber = 3;
  const endCurrentRound = () => {
    for (let index = 0; index < game.players.length; index += 1) {
      game.phase = "end-turn";
      performGameAction(game, game.players[game.currentPlayerIndex].id, { action: "end-turn" });
    }
  };
  endCurrentRound();
  assert.equal(game.roundNumber, 4);
  assert.equal(game.phase, "auction");
  while (game.phase === "auction") {
    performGameAction(game, game.auction.turnPlayerId, { action: "auction-pass" });
  }
  endCurrentRound();
  assert.equal(game.roundNumber, 5);
  assert.equal(game.phase, "rolling");
  endCurrentRound();
  assert.equal(game.roundNumber, 6);
  assert.equal(game.phase, "auction");

  const eightPlayers = Array.from({ length: 8 }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
    connected: true,
  }));
  const largeGame = createGame("TEST08", eightPlayers, "classic", { sarkariNeelamiEnabled: true });
  largeGame.roundNumber = 3;
  for (let index = 0; index < eightPlayers.length; index += 1) {
    largeGame.phase = "end-turn";
    withRandom(0, () => performGameAction(largeGame, largeGame.players[largeGame.currentPlayerIndex].id, { action: "end-turn" }));
  }
  assert.equal(largeGame.roundNumber, 4);
  assert.equal(largeGame.phase, "auction");
  while (largeGame.phase === "auction") {
    performGameAction(largeGame, largeGame.auction.turnPlayerId, { action: "auction-pass" });
  }
  for (let index = 0; index < eightPlayers.length; index += 1) {
    largeGame.phase = "end-turn";
    performGameAction(largeGame, largeGame.players[largeGame.currentPlayerIndex].id, { action: "end-turn" });
  }
  assert.equal(largeGame.roundNumber, 5);
  assert.equal(largeGame.phase, "auction");
});

test("bankruptcy auctions returned properties when enabled", () => {
  const game = createGame("TEST01", lobby, "classic", { bankruptAuctionsEnabled: true });
  const debtor = game.players[0];
  debtor.propertyIds.push("dharavi");
  debtor.propertyIds.push("goa");
  game.properties.dharavi.ownerId = debtor.id;
  game.properties.goa.ownerId = debtor.id;
  game.phase = "debt";
  game.debt = {
    debtorId: debtor.id,
    creditorId: null,
    amount: 500,
    reason: "test debt",
    resumePhase: "end-turn",
  };

  performGameAction(game, debtor.id, { action: "declare-bankrupt" });
  assert.equal(game.phase, "auction");
  assert.equal(game.auction.source, "bankruptcy");
  assert.equal(game.properties.dharavi.ownerId, null);

  performGameAction(game, "player-two", { action: "auction-pass" });
  assert.equal(game.phase, "auction");
  assert.equal(game.properties.goa.ownerId, null);
  performGameAction(game, "player-two", { action: "auction-pass" });
  assert.equal(game.phase, "finished");
  assert.equal(game.winnerPlayerId, "player-two");
});

test("learning bots make fair trade offers and evaluate incoming offers", () => {
  const players = [
    { id: "player-one", name: "Asha", connected: true },
    { id: "bot-one", name: "Chai Champion", connected: true, isAiBot: true },
  ];
  const game = createGame("TEST01", players);
  game.players[0].propertyIds.push("jaipur");
  game.properties.jaipur.ownerId = "player-one";
  game.players[1].propertyIds.push("udaipur");
  game.properties.udaipur.ownerId = "bot-one";
  game.currentPlayerIndex = 1;

  assert.equal(advanceAiPlayer(game, "bot-one"), true);
  assert.equal(game.trades[0].status, "pending");
  assert.equal(game.trades[0].toPlayerId, "player-one");

  game.trades[0].status = "rejected";
  performGameAction(game, "player-one", {
    action: "trade-offer",
    trade: {
      toPlayerId: "bot-one",
      cashFrom: 0,
      cashTo: 0,
      propertiesFrom: ["jaipur"],
      propertiesTo: ["udaipur"],
    },
  });
  assert.equal(advanceAiPlayer(game, "bot-one"), true);
  assert.equal(game.trades[0].status, "accepted");
  assert.equal(game.properties.jaipur.ownerId, "bot-one");
  assert.equal(game.properties.udaipur.ownerId, "player-one");
});

test("a non-current player cannot roll", () => {
  const game = createGame("TEST01", lobby);
  assert.throws(() => performGameAction(game, "player-two", { action: "roll" }), /Wait for your turn/);
});

test("a disconnected current player is taken over by a bot that rolls", () => {
  const game = createGame("TEST01", lobby);
  game.players[0].connected = false;

  withRandom(0.2, () => assert.equal(advanceDisconnectedPlayer(game, "player-one"), true));
  assert.equal(game.players[0].botControlled, true);
  assert.equal(game.currentPlayerIndex, 0);
  assert.equal(game.turnNumber, 1);
  assert.deepEqual(game.dice, [2, 2]);
  assert.equal(game.players[0].cash, 1300);
});

test("a disconnected player at end of turn advances to the next player", () => {
  const game = createGame("TEST01", lobby);
  game.players[0].connected = false;
  game.phase = "end-turn";

  assert.equal(advanceDisconnectedPlayer(game, "player-one"), true);
  assert.equal(game.currentPlayerIndex, 1);
  assert.equal(game.turnNumber, 2);
  assert.equal(game.phase, "rolling");
});

test("a disconnected player bot offers an affordable property for auction and passes", () => {
  const game = createGame("TEST01", lobby);
  game.players[0].connected = false;
  game.players[0].cash = 250;
  game.phase = "buying";
  game.pendingPurchase = { propertyId: "dharavi" };

  assert.equal(advanceDisconnectedPlayer(game, "player-one"), true);
  assert.equal(game.players[0].botControlled, true);
  assert.equal(game.phase, "auction");
  assert.equal(game.auction.turnPlayerId, "player-one");

  assert.equal(advanceDisconnectedPlayer(game, "player-one"), true);
  assert.equal(game.auction.turnPlayerId, "player-two");
});

test("a disconnected debtor is declared bankrupt so the game can resume", () => {
  const players = [
    ...lobby,
    { id: "player-three", name: "Meera", connected: false },
  ];
  const game = createGame("TEST01", players);
  game.phase = "debt";
  game.debt = {
    debtorId: "player-three",
    creditorId: null,
    amount: 500,
    reason: "offline debt",
    resumePhase: "rolling",
  };

  assert.equal(advanceDisconnectedPlayer(game, "player-three"), true);
  assert.equal(game.players[2].bankrupt, true);
  assert.equal(game.debt, null);
  assert.equal(game.phase, "rolling");
  assert.equal(game.currentPlayerIndex, 0);
});

test("timed-out turns receive an automatic action", () => {
  const game = createGame("TEST01", lobby);

  withRandom(0, () => assert.equal(advanceTimedOutPlayer(game, "player-one"), true));
  assert.deepEqual(game.dice, [1, 1]);
});

test("connected players are never advanced by offline turn handling", () => {
  const game = createGame("TEST01", lobby);

  assert.equal(advanceDisconnectedPlayer(game, "player-one"), false);
  assert.equal(game.currentPlayerIndex, 0);
  assert.equal(game.turnNumber, 1);
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

test("utility rent is four times the dice roll when the owner has one company", () => {
  const game = createGame("TEST01", lobby);
  const renter = game.players[1];
  game.currentPlayerIndex = 1;
  renter.position = 8;
  game.properties["power-grid"].ownerId = "player-one";

  withRandom(0.2, () => performGameAction(game, renter.id, { action: "roll" }));

  assert.deepEqual(game.dice, [2, 2]);
  assert.equal(renter.position, 12);
  assert.equal(renter.cash, 1500 - 4 * 4);
  assert.equal(game.players[0].cash, 1500 + 4 * 4);
});

test("utility rent is ten times the dice roll when one player owns both companies", () => {
  const game = createGame("TEST01", lobby);
  const renter = game.players[1];
  game.currentPlayerIndex = 1;
  renter.position = 8;
  game.properties["power-grid"].ownerId = "player-one";
  game.properties["water-works"].ownerId = "player-one";

  withRandom(0.2, () => performGameAction(game, renter.id, { action: "roll" }));

  assert.deepEqual(game.dice, [2, 2]);
  assert.equal(renter.position, 12);
  assert.equal(renter.cash, 1500 - 4 * 10);
  assert.equal(game.players[0].cash, 1500 + 4 * 10);
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

test("trade announcements include the exchanged assets and their outcomes", () => {
  const game = createGame("TEST01", lobby);
  game.properties.dharavi.ownerId = "player-one";
  game.players[0].propertyIds.push("dharavi");
  game.properties.pune.ownerId = "player-two";
  game.players[1].propertyIds.push("pune");

  performGameAction(game, "player-one", {
    action: "trade-offer",
    trade: {
      toPlayerId: "player-two",
      cashFrom: 75,
      cashTo: 25,
      propertiesFrom: ["dharavi"],
      propertiesTo: ["pune"],
    },
  });
  assert.equal(game.log[0].text, "Asha proposed a trade to Kabir: ₹75 + Dharavi for ₹25 + Pune.");

  const acceptedTrade = game.trades[0];
  performGameAction(game, "player-two", { action: "trade-reply", tradeId: acceptedTrade.id, accept: true });
  assert.equal(game.log[0].text, "Kabir accepted Asha's trade: ₹75 + Dharavi for ₹25 + Pune.");

  performGameAction(game, "player-one", {
    action: "trade-offer",
    trade: {
      toPlayerId: "player-two",
      cashFrom: 5,
      cashTo: 0,
      propertiesFrom: [],
      propertiesTo: [],
    },
  });
  const rejectedTrade = game.trades[0];
  performGameAction(game, "player-two", { action: "trade-reply", tradeId: rejectedTrade.id, accept: false });
  assert.equal(game.log[0].text, "Kabir rejected the trade offer from Asha.");
});

test("a recipient can counter a trade with validated assets and cash", () => {
  const game = createGame("TEST01", lobby);
  game.properties.dharavi.ownerId = "player-one";
  game.players[0].propertyIds.push("dharavi");
  game.properties.pune.ownerId = "player-two";
  game.players[1].propertyIds.push("pune");

  performGameAction(game, "player-one", {
    action: "trade-offer",
    trade: {
      toPlayerId: "player-two",
      cashFrom: 100,
      cashTo: 0,
      propertiesFrom: ["dharavi"],
      propertiesTo: [],
    },
  });
  const original = game.trades[0];

  performGameAction(game, "player-two", {
    action: "trade-counter",
    tradeId: original.id,
    trade: {
      cashFrom: 50,
      cashTo: 0,
      propertiesFrom: ["pune"],
      propertiesTo: ["dharavi"],
    },
  });

  assert.equal(original.status, "countered");
  assert.equal(game.trades[0].fromPlayerId, "player-two");
  assert.equal(game.trades[0].toPlayerId, "player-one");
  assert.equal(game.trades[0].status, "pending");
  assert.equal(game.log[0].text, "Kabir countered Asha's trade offer: ₹50 + Pune for Dharavi.");
});

test("trade counters reject unaffordable cash without changing the original offer", () => {
  const game = createGame("TEST01", lobby);
  performGameAction(game, "player-one", {
    action: "trade-offer",
    trade: {
      toPlayerId: "player-two",
      cashFrom: 0,
      cashTo: 0,
      propertiesFrom: [],
      propertiesTo: [],
    },
  });
  const original = game.trades[0];

  assert.throws(() => performGameAction(game, "player-two", {
    action: "trade-counter",
    tradeId: original.id,
    trade: {
      cashFrom: 0,
      cashTo: 1501,
      propertiesFrom: [],
      propertiesTo: [],
    },
  }), /cash amount is invalid/);
  assert.equal(original.status, "pending");
  assert.equal(game.trades.length, 1);
});

test("only the proposer can withdraw a pending trade offer", () => {
  const game = createGame("TEST01", lobby);
  performGameAction(game, "player-one", {
    action: "trade-offer",
    trade: {
      toPlayerId: "player-two",
      cashFrom: 0,
      cashTo: 0,
      propertiesFrom: [],
      propertiesTo: [],
    },
  });
  const offer = game.trades[0];

  assert.throws(
    () => performGameAction(game, "player-two", { action: "trade-cancel", tradeId: offer.id }),
    /only withdraw your own pending offer/,
  );
  assert.equal(offer.status, "pending");
  performGameAction(game, "player-one", { action: "trade-cancel", tradeId: offer.id });
  assert.equal(offer.status, "cancelled");
  assert.equal(game.log[0].text, "Asha withdrew the trade offer to Kabir.");
});

test("pending trade offers expire and cannot be accepted afterward", () => {
  const game = createGame("TEST01", lobby);
  performGameAction(game, "player-one", {
    action: "trade-offer",
    trade: {
      toPlayerId: "player-two",
      cashFrom: 0,
      cashTo: 0,
      propertiesFrom: [],
      propertiesTo: [],
    },
  });
  const offer = game.trades[0];

  assert.equal(expireTradeOffer(game, offer.id, offer.expiresAt - 1), false);
  offer.expiresAt = Date.now() - 1;
  assert.throws(
    () => performGameAction(game, "player-two", { action: "trade-reply", tradeId: offer.id, accept: true }),
    /not for you/,
  );
  assert.equal(offer.status, "expired");
});

test("a player can explicitly start a fair auction that awards it to the highest bidder", () => {
  const game = createGame("TEST01", lobby);
  game.phase = "buying";
  game.pendingPurchase = { propertyId: "dharavi" };

  performGameAction(game, "player-one", { action: "auction" });
  assert.equal(game.phase, "auction");
  performGameAction(game, "player-one", { action: "auction-bid", amount: 100 });
  performGameAction(game, "player-two", { action: "auction-pass" });

  assert.equal(game.auction, null);
  assert.equal(game.properties.dharavi.ownerId, "player-one");
  assert.equal(game.players[0].cash, 1400);
  assert.equal(game.phase, "end-turn");
});

test("declining a property leaves it unowned without opening an auction", () => {
  const game = createGame("TEST01", lobby);
  game.phase = "buying";
  game.pendingPurchase = { propertyId: "dharavi" };

  performGameAction(game, "player-one", { action: "pass" });

  assert.equal(game.auction, null);
  assert.equal(game.properties.dharavi.ownerId, null);
  assert.equal(game.phase, "end-turn");
  assert.match(game.log[0].text, /declined it/);
});

test("an auction with no bids leaves the property unowned", () => {
  const game = createGame("TEST01", lobby);
  game.phase = "buying";
  game.pendingPurchase = { propertyId: "dharavi" };

  performGameAction(game, "player-one", { action: "auction" });
  performGameAction(game, "player-one", { action: "auction-pass" });
  performGameAction(game, "player-two", { action: "auction-pass" });

  assert.equal(game.properties.dharavi.ownerId, null);
  assert.equal(game.phase, "end-turn");
});
