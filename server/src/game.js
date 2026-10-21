import { randomBytes } from "node:crypto";

export const BOARD = [
  { id: "go", type: "corner", label: "GO" },
  { id: "dharavi", type: "property", propertyId: "dharavi" },
  { id: "chest-1", type: "communityChest", label: "Community Chest" },
  { id: "mumbai-market", type: "property", propertyId: "mumbai-market" },
  { id: "income-tax", type: "tax", label: "Income Tax" },
  { id: "central-railway", type: "railroad", propertyId: "central-railway" },
  { id: "marine-drive", type: "property", propertyId: "marine-drive" },
  { id: "chance-1", type: "chance", label: "Chance" },
  { id: "pune", type: "property", propertyId: "pune" },
  { id: "lonavala", type: "property", propertyId: "lonavala" },
  { id: "jail", type: "corner", label: "Jail / Just Visiting" },
  { id: "hyderabad", type: "property", propertyId: "hyderabad" },
  { id: "power-grid", type: "utility", propertyId: "power-grid" },
  { id: "bengaluru-mg", type: "property", propertyId: "bengaluru-mg" },
  { id: "chennai-tnagar", type: "property", propertyId: "chennai-tnagar" },
  { id: "howrah-railway", type: "railroad", propertyId: "howrah-railway" },
  { id: "jaipur", type: "property", propertyId: "jaipur" },
  { id: "chest-2", type: "communityChest", label: "Community Chest" },
  { id: "udaipur", type: "property", propertyId: "udaipur" },
  { id: "goa", type: "property", propertyId: "goa" },
  { id: "free-parking", type: "corner", label: "Free Parking" },
  { id: "lucknow", type: "property", propertyId: "lucknow" },
  { id: "chance-2", type: "chance", label: "Chance" },
  { id: "ahmedabad", type: "property", propertyId: "ahmedabad" },
  { id: "connaught-place", type: "property", propertyId: "connaught-place" },
  { id: "delhi-metro", type: "railroad", propertyId: "delhi-metro" },
  { id: "bengaluru-tech-park", type: "property", propertyId: "bengaluru-tech-park" },
  { id: "taj-mahal", type: "property", propertyId: "taj-mahal" },
  { id: "water-works", type: "utility", propertyId: "water-works" },
  { id: "varanasi", type: "property", propertyId: "varanasi" },
  { id: "go-to-jail", type: "corner", label: "Go To Jail" },
  { id: "india-gate", type: "property", propertyId: "india-gate" },
  { id: "kolkata-park-street", type: "property", propertyId: "kolkata-park-street" },
  { id: "chest-3", type: "communityChest", label: "Community Chest" },
  { id: "electronics-city", type: "property", propertyId: "electronics-city" },
  { id: "kempegowda-airport", type: "railroad", propertyId: "kempegowda-airport" },
  { id: "chance-3", type: "chance", label: "Chance" },
  { id: "gateway-india", type: "property", propertyId: "gateway-india" },
  { id: "luxury-tax", type: "tax", label: "Luxury Tax" },
  { id: "kashmir", type: "property", propertyId: "kashmir" },
];

const propertyData = [
  ["dharavi", "Dharavi", "brown", 60, [2, 10, 30, 90, 160, 250], 50],
  ["mumbai-market", "Mumbai Textile Market", "brown", 60, [4, 20, 60, 180, 320, 450], 50],
  ["pune", "Pune", "lightBlue", 100, [6, 30, 90, 270, 400, 550], 50],
  ["lonavala", "Lonavala", "lightBlue", 100, [6, 30, 90, 270, 400, 550], 50],
  ["marine-drive", "Marine Drive", "lightBlue", 120, [8, 40, 100, 300, 450, 600], 50],
  ["hyderabad", "Hyderabad", "pink", 140, [10, 50, 150, 450, 625, 750], 100],
  ["bengaluru-mg", "Bengaluru MG Road", "pink", 140, [10, 50, 150, 450, 625, 750], 100],
  ["chennai-tnagar", "Chennai T. Nagar", "pink", 160, [12, 60, 180, 500, 700, 900], 100],
  ["jaipur", "Jaipur Hawa Mahal", "orange", 180, [14, 70, 200, 550, 750, 950], 100],
  ["udaipur", "Udaipur", "orange", 180, [14, 70, 200, 550, 750, 950], 100],
  ["goa", "Goa Beaches", "orange", 200, [16, 80, 220, 600, 800, 1000], 100],
  ["lucknow", "Lucknow", "red", 220, [18, 90, 250, 700, 875, 1050], 150],
  ["ahmedabad", "Ahmedabad", "red", 220, [18, 90, 250, 700, 875, 1050], 150],
  ["connaught-place", "Connaught Place", "red", 240, [20, 100, 300, 750, 925, 1100], 150],
  ["bengaluru-tech-park", "Bengaluru IT Park", "yellow", 260, [22, 110, 330, 800, 975, 1150], 150],
  ["taj-mahal", "Taj Mahal", "yellow", 260, [22, 110, 330, 800, 975, 1150], 150],
  ["varanasi", "Varanasi Ghats", "yellow", 280, [24, 120, 360, 850, 1025, 1200], 150],
  ["india-gate", "India Gate", "green", 300, [26, 130, 390, 900, 1100, 1275], 200],
  ["kolkata-park-street", "Kolkata Park Street", "green", 300, [26, 130, 390, 900, 1100, 1275], 200],
  ["electronics-city", "Bengaluru Electronics City", "green", 320, [28, 150, 450, 1000, 1200, 1400], 200],
  ["gateway-india", "Gateway of India", "darkBlue", 350, [35, 175, 500, 1100, 1300, 1500], 200],
  ["kashmir", "Kashmir Valley", "darkBlue", 400, [50, 200, 600, 1400, 1700, 2000], 200],
];

const railData = [
  ["central-railway", "Chhatrapati Shivaji Terminus", 200],
  ["howrah-railway", "Howrah Junction", 200],
  ["delhi-metro", "Delhi Metro", 200],
  ["kempegowda-airport", "Kempegowda Airport", 200],
];

const utilityData = [
  ["power-grid", "Power Grid", 150],
  ["water-works", "Water Works", 150],
];

const CHANCE_CARDS = [
  { text: "Advance to GO. Collect ₹200.", action: "move", target: 0, collectGo: true },
  { text: "Caught without a helmet by traffic police. Pay ₹500.", action: "pay", amount: 500 },
  { text: "Your startup funding came through. Collect ₹1,500.", action: "collect", amount: 1500 },
  { text: "Go directly to Jail. Do not pass GO.", action: "jail" },
  { text: "Take a trip to the Taj Mahal.", action: "move", target: 27 },
  { text: "Ride the railway to the nearest station.", action: "railroad" },
  { text: "Your electricity bill arrived. Pay ₹150.", action: "pay", amount: 150 },
  { text: "Wedding season! Collect ₹500 from every player.", action: "collectEach", amount: 500 },
  { text: "Pay ₹250 to every player for your big birthday party.", action: "payEach", amount: 250 },
  { text: "Move forward three spaces.", action: "moveSteps", amount: 3 },
  { text: "Take a shortcut back three spaces.", action: "moveSteps", amount: -3 },
  { text: "Your mutual funds paid dividends. Collect ₹500.", action: "collect", amount: 500 },
  { text: "Your Diwali bonus arrived. Collect ₹100.", action: "collect", amount: 100 },
  { text: "Pay ₹150 in wedding-season road tolls.", action: "pay", amount: 150 },
  { text: "Your company reimbursed a business trip. Collect ₹250.", action: "collect", amount: 250 },
  { text: "Pay ₹25 per house and ₹100 per hotel for repairs.", action: "repairs", house: 25, hotel: 100 },
];

const CHEST_CARDS = [
  { text: "Won the local Diwali Tambola. Collect ₹2,000.", action: "collect", amount: 2000 },
  { text: "Your fixed deposit matured. Collect ₹1,000.", action: "collect", amount: 1000 },
  { text: "Pay your annual school fees of ₹500.", action: "pay", amount: 500 },
  { text: "Your health insurance paid out. Collect ₹1,000.", action: "collect", amount: 1000 },
  { text: "Go directly to Jail. Do not pass GO.", action: "jail" },
  { text: "Advance to GO. Collect ₹200.", action: "move", target: 0, collectGo: true },
  { text: "It's your birthday! Collect ₹100 from every player.", action: "collectEach", amount: 100 },
  { text: "Pay ₹400 for neighbourhood repairs.", action: "repairs", house: 40, hotel: 115 },
  { text: "You returned a lost wallet. Collect a ₹200 reward.", action: "collect", amount: 200 },
  { text: "Pay a traffic fine of ₹150.", action: "pay", amount: 150 },
  { text: "You won a community award. Collect ₹500.", action: "collect", amount: 500 },
  { text: "Pay ₹250 to each player for your treat.", action: "payEach", amount: 250 },
  { text: "A bank transfer was made in your favour. Collect ₹200.", action: "collect", amount: 200 },
  { text: "Pay ₹50 for a doctor's visit.", action: "pay", amount: 50 },
  { text: "Your auntie sent you a festival gift. Collect ₹50.", action: "collect", amount: 50 },
  { text: "Donate ₹100 to the neighbourhood festival.", action: "pay", amount: 100 },
];

const TOKENS = ["🛺", "🐘", "🪁", "🚂", "🦚", "🥭"];

function makeProperties() {
  const properties = {};
  for (const [id, name, group, price, rent, houseCost] of propertyData) {
    properties[id] = { id, name, group, price, rent, houseCost, ownerId: null, houses: 0, mortgaged: false };
  }
  for (const [id, name, price] of railData) {
    properties[id] = { id, name, group: "railroad", price, rent: [25, 50, 100, 200], ownerId: null, houses: 0, mortgaged: false };
  }
  for (const [id, name, price] of utilityData) {
    properties[id] = { id, name, group: "utility", price, rent: [4, 10], ownerId: null, houses: 0, mortgaged: false };
  }
  return properties;
}

function shuffled(cards) {
  const deck = [...cards];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[target]] = [deck[target], deck[index]];
  }
  return deck;
}

export function createGame(roomCode, lobbyPlayers) {
  if (lobbyPlayers.length < 2 || lobbyPlayers.length > 6) {
    throw new Error("A game needs 2 to 6 players.");
  }
  return {
    roomCode,
    board: BOARD,
    properties: makeProperties(),
    players: lobbyPlayers.map((player, index) => ({
      id: player.id,
      name: player.name,
      token: TOKENS[index],
      cash: 1500,
      position: 0,
      propertyIds: [],
      inJail: false,
      jailTurns: 0,
      bankrupt: false,
      connected: player.connected !== false,
    })),
    currentPlayerIndex: 0,
    turnNumber: 1,
    phase: "rolling",
    dice: null,
    doublesCount: 0,
    canRollAgain: false,
    pendingPurchase: null,
    debt: null,
    pendingDebts: [],
    pendingTurnAdvance: false,
    auction: null,
    chanceDeck: shuffled(CHANCE_CARDS),
    chestDeck: shuffled(CHEST_CARDS),
    trades: [],
    chat: [],
    log: [{ id: randomBytes(6).toString("hex"), text: "The game is on! Good luck, everyone.", createdAt: Date.now() }],
  };
}

export function publicGame(game) {
  const {
    chanceDeck: _chanceDeck,
    chestDeck: _chestDeck,
    pendingDebts: _pendingDebts,
    pendingTurnAdvance: _pendingTurnAdvance,
    ...view
  } = game;
  return view;
}

function addLog(game, text) {
  game.log.unshift({ id: randomBytes(6).toString("hex"), text, createdAt: Date.now() });
  game.log = game.log.slice(0, 40);
}

function activePlayers(game) {
  return game.players.filter((player) => !player.bankrupt);
}

function playerById(game, id) {
  return game.players.find((player) => player.id === id);
}

function currentPlayer(game) {
  return game.players[game.currentPlayerIndex];
}

function nextPlayer(game) {
  const winner = activePlayers(game);
  if (winner.length <= 1) {
    game.phase = "finished";
    addLog(game, `${winner[0]?.name ?? "Nobody"} wins the game!`);
    return;
  }
  let index = game.currentPlayerIndex;
  do {
    index = (index + 1) % game.players.length;
  } while (game.players[index].bankrupt);
  game.currentPlayerIndex = index;
  game.turnNumber += 1;
  game.phase = "rolling";
  game.canRollAgain = false;
  game.doublesCount = 0;
  game.dice = null;
}

function sendToJail(game, player, reason) {
  player.position = 10;
  player.inJail = true;
  player.jailTurns = 0;
  game.phase = "end-turn";
  game.pendingPurchase = null;
  game.canRollAgain = false;
  game.doublesCount = 0;
  addLog(game, `${player.name} goes to Jail${reason ? `: ${reason}` : ""}.`);
}

function charge(game, fromPlayer, toPlayer, amount, reason) {
  if (amount <= 0) return;
  const debt = {
    debtorId: fromPlayer.id,
    creditorId: toPlayer?.id ?? null,
    amount,
    reason,
    resumePhase: game.pendingPurchase ? "buying" : game.canRollAgain ? "rolling" : "end-turn",
  };
  if (game.debt) {
    game.pendingDebts.push(debt);
    addLog(game, `${fromPlayer.name} will owe ₹${amount} for ${reason} after the current debt is resolved.`);
    return;
  }
  if (fromPlayer.cash < amount) {
    game.debt = debt;
    game.phase = "debt";
    addLog(game, `${fromPlayer.name} owes ₹${amount} for ${reason}. Raise cash or declare bankruptcy.`);
    return;
  }
  fromPlayer.cash -= amount;
  if (toPlayer) toPlayer.cash += amount;
  addLog(game, `${fromPlayer.name} pays ₹${amount}${toPlayer ? ` to ${toPlayer.name}` : ""} for ${reason}.`);
}

function moveTo(game, player, target, collectGo = false, rentMultiplier = 1) {
  const previous = player.position;
  player.position = ((target % 40) + 40) % 40;
  if (collectGo || (target >= 40 && Math.floor(target / 40) > Math.floor(previous / 40))) {
    player.cash += 200;
    addLog(game, `${player.name} passes GO and collects ₹200.`);
  }
  if (game.phase === "debt") return;
  resolveSpace(game, player, rentMultiplier);
}

function rentFor(game, property, diceTotal) {
  if (property.group === "railroad") {
    const count = Object.values(game.properties).filter((item) => item.group === "railroad" && item.ownerId === property.ownerId).length;
    return property.rent[Math.max(count - 1, 0)];
  }
  if (property.group === "utility") {
    const count = Object.values(game.properties).filter((item) => item.group === "utility" && item.ownerId === property.ownerId).length;
    return diceTotal * (count === 2 ? 10 : 4);
  }
  if (property.houses === 0) {
    const colorSet = Object.values(game.properties).filter((item) => item.group === property.group);
    const ownsSet = colorSet.every((item) => item.ownerId === property.ownerId && !item.mortgaged);
    return property.rent[0] * (ownsSet ? 2 : 1);
  }
  return property.rent[property.houses];
}

function resolveSpace(game, player, rentMultiplier = 1) {
  if (game.phase === "debt") return;
  const space = game.board[player.position];
  if (space.id === "go-to-jail") {
    sendToJail(game, player, "caught taking a shortcut");
    return;
  }
  if (space.type === "tax") {
    charge(game, player, null, space.id === "income-tax" ? 200 : 100, space.label);
    return;
  }
  if (space.type === "property" || space.type === "railroad" || space.type === "utility") {
    const property = game.properties[space.propertyId];
    if (!property.ownerId) {
      game.pendingPurchase = { propertyId: property.id };
      game.phase = "buying";
      return;
    }
    if (property.ownerId !== player.id && !property.mortgaged) {
      charge(game, player, playerById(game, property.ownerId), rentFor(game, property, game.dice[0] + game.dice[1]) * rentMultiplier, property.name + " rent");
    }
    return;
  }
  if (space.type === "chance" || space.type === "communityChest") {
    drawCard(game, player, space.type === "chance" ? "chanceDeck" : "chestDeck");
  }
}

function drawCard(game, player, deckName) {
  const deck = game[deckName];
  const card = deck.shift();
  deck.push(card);
  addLog(game, `${player.name} draws: ${card.text}`);
  switch (card.action) {
    case "collect":
      player.cash += card.amount;
      break;
    case "pay":
      charge(game, player, null, card.amount, "a card");
      break;
    case "collectEach":
      for (const other of activePlayers(game)) {
        if (other.id !== player.id) {
          charge(game, other, player, card.amount, "a community card");
        }
      }
      break;
    case "payEach":
      for (const other of activePlayers(game)) {
        if (other.id !== player.id) {
          charge(game, player, other, card.amount, "a community card");
        }
      }
      break;
    case "jail":
      sendToJail(game, player, "a card sent them");
      break;
    case "move":
      moveTo(game, player, card.target, card.collectGo);
      break;
    case "moveSteps":
      moveTo(game, player, player.position + card.amount);
      break;
    case "railroad": {
      const nextRailroad = [5, 15, 25, 35].find((position) => position > player.position) ?? 45;
      moveTo(game, player, nextRailroad, false, 2);
      break;
    }
    case "repairs": {
      const houses = player.propertyIds.reduce((sum, id) => sum + Math.min(game.properties[id].houses, 4), 0);
      const hotels = player.propertyIds.filter((id) => game.properties[id].houses === 5).length;
      charge(game, player, null, houses * card.house + hotels * card.hotel, "property repairs");
      break;
    }
  }
}

function rollDice() {
  return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
}

function rollForPlayer(game, player) {
  const dice = rollDice();
  game.dice = dice;
  const isDouble = dice[0] === dice[1];
  if (!player.inJail && isDouble) {
    game.doublesCount += 1;
    if (game.doublesCount === 3) {
      sendToJail(game, player, "three doubles in a row");
      return;
    }
  }
  game.canRollAgain = isDouble;
  addLog(game, `${player.name} rolls ${dice[0]} + ${dice[1]} = ${dice[0] + dice[1]}.`);
  moveTo(game, player, player.position + dice[0] + dice[1]);
  if (game.phase === "debt" || game.phase === "buying" || player.inJail || game.phase === "end-turn") return;
  game.phase = game.canRollAgain ? "rolling" : "end-turn";
}

function advanceDebtQueue(game, resumePhase) {
  game.debt = null;
  while (game.pendingDebts.length > 0) {
    const debt = game.pendingDebts.shift();
    const debtor = playerById(game, debt.debtorId);
    if (!debtor || debtor.bankrupt) continue;
    if (debtor.cash >= debt.amount) {
      const creditor = debt.creditorId ? playerById(game, debt.creditorId) : null;
      debtor.cash -= debt.amount;
      if (creditor) creditor.cash += debt.amount;
      addLog(game, `${debtor.name} pays ₹${debt.amount} for ${debt.reason}.`);
      continue;
    }
    game.debt = debt;
    game.phase = "debt";
    addLog(game, `${debtor.name} owes ₹${debt.amount} for ${debt.reason}. Raise cash or declare bankruptcy.`);
    return;
  }
  if (game.pendingTurnAdvance) {
    game.pendingTurnAdvance = false;
    nextPlayer(game);
    return;
  }
  game.phase = game.pendingPurchase ? "buying" : resumePhase;
}

function completeDebt(game, player) {
  const debt = game.debt;
  if (!debt || player.cash < debt.amount) return;
  const creditor = debt.creditorId ? playerById(game, debt.creditorId) : null;
  player.cash -= debt.amount;
  if (creditor) creditor.cash += debt.amount;
  addLog(game, `${player.name} pays ₹${debt.amount} for ${debt.reason}.`);
  advanceDebtQueue(game, debt.resumePhase);
}

function finishAuction(game) {
  const auction = game.auction;
  if (auction.highestBidderId) {
    const bidder = playerById(game, auction.highestBidderId);
    const property = game.properties[auction.propertyId];
    bidder.cash -= auction.highestBid;
    bidder.propertyIds.push(property.id);
    property.ownerId = bidder.id;
    addLog(game, `${bidder.name} wins ${property.name} at auction for ₹${auction.highestBid}.`);
  } else {
    addLog(game, `${game.properties[auction.propertyId].name} remains unsold after the auction.`);
  }
  game.auction = null;
  game.phase = game.canRollAgain ? "rolling" : "end-turn";
}

function advanceAuction(game, previousPlayerId) {
  const auction = game.auction;
  const eligible = activePlayers(game).filter((player) => !auction.passedPlayerIds.includes(player.id));
  if (eligible.length === 0 ||
      (eligible.length === 1 && eligible[0].id === auction.highestBidderId)) {
    finishAuction(game);
    return;
  }
  const previousIndex = game.players.findIndex((player) => player.id === previousPlayerId);
  for (let step = 1; step <= game.players.length; step += 1) {
    const candidate = game.players[(previousIndex + step) % game.players.length];
    if (!candidate.bankrupt && !auction.passedPlayerIds.includes(candidate.id)) {
      auction.turnPlayerId = candidate.id;
      return;
    }
  }
  finishAuction(game);
}

function startAuction(game, propertyId) {
  game.pendingPurchase = null;
  game.auction = {
    propertyId,
    highestBid: 0,
    highestBidderId: null,
    turnPlayerId: currentPlayer(game).id,
    passedPlayerIds: [],
  };
  game.phase = "auction";
  addLog(game, `Bidding is open for ${game.properties[propertyId].name}.`);
}

function hasMonopoly(game, player, group) {
  const set = Object.values(game.properties).filter((property) => property.group === group);
  return set.length > 0 && set.every((property) => property.ownerId === player.id);
}

function performRoll(game, player, action) {
  if (game.phase !== "rolling") throw new Error("You cannot roll right now.");
  if (player.inJail) {
    if (action === "jail-pay") {
      if (player.cash < 50) throw new Error("You need ₹50 to pay the jail fine.");
      player.cash -= 50;
      player.inJail = false;
      player.jailTurns = 0;
      addLog(game, `${player.name} pays ₹50 to leave Jail.`);
      rollForPlayer(game, player);
      return;
    }
    if (action !== "jail-roll") throw new Error("Roll for doubles or pay ₹50 to leave Jail.");
    const dice = rollDice();
    game.dice = dice;
    addLog(game, `${player.name} rolls ${dice[0]} + ${dice[1]} in Jail.`);
    if (dice[0] === dice[1]) {
      player.inJail = false;
      player.jailTurns = 0;
      addLog(game, `${player.name} rolled doubles and is free!`);
      moveTo(game, player, player.position + dice[0] + dice[1]);
      game.canRollAgain = false;
    } else if (player.jailTurns >= 2) {
      if (player.cash < 50) {
        game.debt = { debtorId: player.id, creditorId: null, amount: 50, reason: "Jail fine after three failed rolls", resumePhase: "end-turn" };
        game.phase = "debt";
      } else {
        player.cash -= 50;
        player.inJail = false;
        player.jailTurns = 0;
        addLog(game, `${player.name} pays ₹50 after three failed rolls and leaves Jail.`);
        moveTo(game, player, player.position + dice[0] + dice[1]);
      }
    } else {
      player.jailTurns += 1;
      addLog(game, `${player.name} stays in Jail (${player.jailTurns}/3).`);
    }
    if (game.phase !== "debt" && game.phase !== "buying") game.phase = "end-turn";
    return;
  }
  if (action !== "roll") throw new Error("Roll the dice to play your turn.");
  rollForPlayer(game, player);
}

function normalizeCash(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function performGameAction(game, playerId, payload) {
  const player = playerById(game, playerId);
  if (!player || player.bankrupt) throw new Error("You are not an active player in this game.");
  const action = payload?.action;

  if (action === "auction-bid" || action === "auction-pass") {
    const auction = game.auction;
    if (game.phase !== "auction" || !auction || auction.turnPlayerId !== player.id) {
      throw new Error("Wait for your bidding turn.");
    }
    if (action === "auction-pass") {
      auction.passedPlayerIds.push(player.id);
    } else {
      const bid = normalizeCash(payload.amount);
      if (bid === null || bid <= auction.highestBid || bid > player.cash) {
        throw new Error(`Bid more than ₹${auction.highestBid} and no more than your available cash.`);
      }
      auction.highestBid = bid;
      auction.highestBidderId = player.id;
      addLog(game, `${player.name} bids ₹${bid} for ${game.properties[auction.propertyId].name}.`);
    }
    advanceAuction(game, player.id);
    return;
  }

  if (action === "trade-offer") {
    const trade = payload.trade;
    const other = playerById(game, trade?.toPlayerId);
    const cashOffer = normalizeCash(trade?.cashFrom);
    const cashRequest = normalizeCash(trade?.cashTo);
    if (!other || other.id === player.id || other.bankrupt) throw new Error("Choose another active player.");
    if (cashOffer === null || cashRequest === null || cashOffer > player.cash) throw new Error("The offered cash amount is invalid.");
    if (!Array.isArray(trade.propertiesFrom) || !Array.isArray(trade.propertiesTo)) throw new Error("Choose valid properties for the trade.");
    for (const id of trade.propertiesFrom) {
      if (!player.propertyIds.includes(id) || game.properties[id]?.houses || game.properties[id]?.mortgaged) {
        throw new Error("Only unmortgaged properties you own without buildings can be traded.");
      }
    }
    for (const id of trade.propertiesTo) {
      if (!other.propertyIds.includes(id) || game.properties[id]?.houses || game.properties[id]?.mortgaged) {
        throw new Error("Only unmortgaged properties without buildings can be traded.");
      }
    }
    const offer = {
      id: randomBytes(6).toString("hex"),
      fromPlayerId: player.id,
      toPlayerId: other.id,
      cashFrom: cashOffer,
      cashTo: cashRequest,
      propertiesFrom: [...new Set(trade.propertiesFrom)],
      propertiesTo: [...new Set(trade.propertiesTo)],
      status: "pending",
    };
    game.trades.unshift(offer);
    addLog(game, `${player.name} proposed a trade to ${other.name}.`);
    return;
  }

  if (action === "trade-reply") {
    const offer = game.trades.find((trade) => trade.id === payload.tradeId && trade.status === "pending");
    if (!offer || offer.toPlayerId !== player.id) throw new Error("This trade offer is not for you.");
    const proposer = playerById(game, offer.fromPlayerId);
    if (payload.accept !== true) {
      offer.status = "rejected";
      addLog(game, `${player.name} rejected the trade.`);
      return;
    }
    if (!proposer || proposer.bankrupt || proposer.cash < offer.cashFrom || player.cash < offer.cashTo ||
        offer.propertiesFrom.some((id) => game.properties[id]?.ownerId !== proposer.id) ||
        offer.propertiesTo.some((id) => game.properties[id]?.ownerId !== player.id) ||
        offer.propertiesFrom.some((id) => game.properties[id]?.houses) ||
        offer.propertiesTo.some((id) => game.properties[id]?.houses) ||
        offer.propertiesFrom.some((id) => game.properties[id]?.mortgaged) ||
        offer.propertiesTo.some((id) => game.properties[id]?.mortgaged)) {
      offer.status = "rejected";
      addLog(game, "A trade was rejected because its assets changed before acceptance.");
      return;
    }
    proposer.cash = proposer.cash - offer.cashFrom + offer.cashTo;
    player.cash = player.cash - offer.cashTo + offer.cashFrom;
    for (const id of offer.propertiesFrom) {
      proposer.propertyIds = proposer.propertyIds.filter((propertyId) => propertyId !== id);
      player.propertyIds.push(id);
      game.properties[id].ownerId = player.id;
    }
    for (const id of offer.propertiesTo) {
      player.propertyIds = player.propertyIds.filter((propertyId) => propertyId !== id);
      proposer.propertyIds.push(id);
      game.properties[id].ownerId = proposer.id;
    }
    completeDebt(game, proposer);
    completeDebt(game, player);
    offer.status = "accepted";
    addLog(game, `${player.name} accepted ${proposer.name}'s trade.`);
    return;
  }

  if (action === "chat") {
    const text = typeof payload.text === "string" ? payload.text.trim().slice(0, 240) : "";
    if (!text) throw new Error("Chat message cannot be empty.");
    game.chat.push({ id: randomBytes(6).toString("hex"), playerId, playerName: player.name, text, createdAt: Date.now() });
    game.chat = game.chat.slice(-60);
    return;
  }

  if (action === "mortgage" || action === "unmortgage" || action === "build" || action === "sell-house") {
    if (player.id !== currentPlayer(game).id && game.debt?.debtorId !== player.id) {
      throw new Error("Manage properties during your own turn.");
    }
    if (game.phase === "debt" && game.debt?.debtorId !== player.id) {
      throw new Error("Only the indebted player can manage property during debt resolution.");
    }
    if (game.phase === "debt" && !["mortgage", "sell-house"].includes(action)) {
      throw new Error("Resolve your debt before buying or building.");
    }
    const property = game.properties[payload.propertyId];
    if (!property || property.ownerId !== player.id) throw new Error("You do not own that property.");
    if (action === "mortgage") {
      const group = Object.values(game.properties).filter((item) => item.group === property.group);
      if (property.mortgaged || group.some((item) => item.houses > 0)) {
        throw new Error("Sell all buildings in this colour set before mortgaging a property.");
      }
      property.mortgaged = true;
      player.cash += Math.floor(property.price / 2);
      addLog(game, `${player.name} mortgages ${property.name} for ₹${Math.floor(property.price / 2)}.`);
      completeDebt(game, player);
      return;
    }
    if (action === "unmortgage") {
      const cost = Math.ceil(property.price * 0.55);
      if (!property.mortgaged || player.cash < cost) throw new Error(`Unmortgaging costs ₹${cost}.`);
      player.cash -= cost;
      property.mortgaged = false;
      addLog(game, `${player.name} unmortgages ${property.name} for ₹${cost}.`);
      completeDebt(game, player);
      return;
    }
    const group = Object.values(game.properties).filter((item) => item.group === property.group);
    if (property.group === "railroad" || property.group === "utility" ||
        !hasMonopoly(game, player, property.group) || group.some((item) => item.mortgaged)) {
      throw new Error("Own the complete, unmortgaged colour set before building.");
    }
    const minimum = Math.min(...group.map((item) => item.houses));
    if (action === "build") {
      if (property.houses !== minimum || property.houses >= 5) throw new Error("Build evenly across your colour set, up to four houses and a hotel.");
      if (player.cash < property.houseCost) throw new Error("Not enough cash to build here.");
      player.cash -= property.houseCost;
      property.houses += 1;
      addLog(game, `${player.name} builds ${property.houses === 5 ? "a hotel" : "a house"} on ${property.name}.`);
    } else {
      const maximum = Math.max(...group.map((item) => item.houses));
      if (property.houses !== maximum || property.houses === 0) throw new Error("Sell buildings evenly across your colour set.");
      property.houses -= 1;
      player.cash += Math.floor(property.houseCost / 2);
      addLog(game, `${player.name} sells a building on ${property.name} for ₹${Math.floor(property.houseCost / 2)}.`);
      completeDebt(game, player);
    }
    return;
  }

  if (action === "declare-bankrupt") {
    if (game.phase !== "debt" || game.debt?.debtorId !== player.id) throw new Error("You do not need to declare bankruptcy.");
    const creditor = game.debt.creditorId ? playerById(game, game.debt.creditorId) : null;
    const debtorWasCurrent = player.id === currentPlayer(game).id;
    const resumePhase = game.debt.resumePhase;
    player.bankrupt = true;
    player.cash = 0;
    for (const id of player.propertyIds) {
      const property = game.properties[id];
      property.ownerId = creditor?.id ?? null;
      if (creditor) creditor.propertyIds.push(id);
      property.houses = 0;
      if (!creditor) property.mortgaged = false;
    }
    player.propertyIds = [];
    addLog(game, `${player.name} is bankrupt${creditor ? `; their properties go to ${creditor.name}` : ""}.`);
    if (debtorWasCurrent) {
      game.pendingTurnAdvance = true;
      advanceDebtQueue(game, resumePhase ?? "end-turn");
    }
    else if (activePlayers(game).length <= 1) {
      game.debt = null;
      game.phase = "finished";
      addLog(game, `${activePlayers(game)[0]?.name ?? "Nobody"} wins the game!`);
    } else advanceDebtQueue(game, resumePhase ?? "end-turn");
    return;
  }

  const resolvingDebt = game.phase === "debt" && game.debt?.debtorId === player.id;
  if (player.id !== currentPlayer(game).id && !resolvingDebt) throw new Error("Wait for your turn.");

  if (action === "roll" || action === "jail-roll" || action === "jail-pay") {
    performRoll(game, player, action);
    return;
  }
  if (game.phase === "debt" && game.debt?.debtorId !== player.id) throw new Error("The indebted player must resolve their debt.");
  if (game.phase === "debt" && !["mortgage", "sell-house"].includes(action)) {
    throw new Error("Raise cash by mortgaging property, selling buildings, or declaring bankruptcy.");
  }
  if (action === "buy" || action === "pass") {
    if (game.phase !== "buying" || !game.pendingPurchase) throw new Error("There is no property to buy.");
    const property = game.properties[game.pendingPurchase.propertyId];
    game.pendingPurchase = null;
    if (action === "buy") {
      if (property.ownerId || player.cash < property.price) {
        game.pendingPurchase = { propertyId: property.id };
        throw new Error(player.cash < property.price ? "You cannot afford this property." : "This property is already owned.");
      }
      property.ownerId = player.id;
      player.propertyIds.push(property.id);
      player.cash -= property.price;
      addLog(game, `${player.name} buys ${property.name} for ₹${property.price}.`);
    } else {
      startAuction(game, property.id);
      return;
    }
    completeDebt(game, player);
    if (game.phase !== "debt") game.phase = "rolling";
    if (!game.canRollAgain && game.phase !== "debt") game.phase = "end-turn";
    return;
  }
  if (action === "end-turn") {
    if (game.phase !== "end-turn") throw new Error("Finish resolving your roll before ending the turn.");
    nextPlayer(game);
    return;
  }
  throw new Error("Unknown game action.");
}
