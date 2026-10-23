export type PropertyGroup =
  | "brown"
  | "lightBlue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "darkBlue"
  | "railroad"
  | "utility";

export interface Property {
  id: string;
  name: string;
  group: PropertyGroup;
  price: number;
  rent: number[];
  houseCost?: number;
  ownerId: string | null;
  houses: number;
  mortgaged: boolean;
}

export interface BoardSpace {
  id: string;
  type: "property" | "railroad" | "utility" | "chance" | "communityChest" | "tax" | "corner";
  propertyId?: string;
  label?: string;
}

export interface Player {
  id: string;
  name: string;
  token: string;
  cash: number;
  position: number;
  propertyIds: string[];
  inJail: boolean;
  jailTurns: number;
  bankrupt: boolean;
  connected: boolean;
  botControlled: boolean;
  isAiBot: boolean;
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  cashFrom: number;
  cashTo: number;
  propertiesFrom: string[];
  propertiesTo: string[];
  status: "pending" | "accepted" | "rejected" | "cancelled" | "countered" | "expired";
  expiresAt: number;
}

export interface GameChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  createdAt: number;
}

export interface GameLogEntry {
  id: string;
  text: string;
  createdAt: number;
}

export interface SeasonEvent {
  id: "railway-rush" | "construction-boom" | "rent-relief" | "festival-bonus";
  title: string;
  description: string;
}

export interface GameState {
  roomCode: string;
  ruleSet: PublicRoom["ruleSet"];
  rules: GameRules;
  seasonEvent: SeasonEvent | null;
  deadlineAt: number | null;
  board: BoardSpace[];
  properties: Record<string, Property>;
  players: Player[];
  currentPlayerIndex: number;
  turnNumber: number;
  roundNumber: number;
  gameEndsAt: number | null;
  winnerPlayerId: string | null;
  endReason: "time-limit" | "bankruptcy" | null;
  phase: "waiting" | "rolling" | "buying" | "auction" | "debt" | "end-turn" | "finished";
  dice: [number, number] | null;
  canRollAgain: boolean;
  pendingPurchase: { propertyId: string } | null;
  debt: { debtorId: string; creditorId: string | null; amount: number; reason: string; resumePhase?: GameState["phase"] } | null;
  auction: {
    propertyId: string;
    highestBid: number;
    minimumBid: number;
    highestBidderId: string | null;
    turnPlayerId: string;
    passedPlayerIds: string[];
    source: "player" | "bankruptcy" | "sarkari";
  } | null;
  trades: TradeOffer[];
  chat: GameChatMessage[];
  log: GameLogEntry[];
}

export interface PublicRoom {
  code: string;
  hostId: string;
  ruleSet: "classic" | "quick" | "chaos";
  rules: GameRules;
  sarkariNeelamiCustomized: boolean;
  players: Array<{ id: string; name: string; connected: boolean }>;
  voteKick: {
    targetPlayerId: string;
    targetName: string;
    voterIds: string[];
    votes: Record<string, boolean>;
    requiredVotes: number;
    yesVotes: number;
    noVotes: number;
  } | null;
  voteKickMessage: string | null;
  maxPlayers: number;
}

export interface GameRules {
  startingCash: number;
  goSalary: number;
  rentMultiplier: number;
  auctionsEnabled: boolean;
  seasonsEnabled: boolean;
  gameDurationMinutes: 0 | 30 | 60 | 90 | 120;
  bankruptAuctionsEnabled: boolean;
  sarkariNeelamiEnabled: boolean;
  botCount: number;
}

export interface RoomResponse {
  ok: boolean;
  error?: string;
  room?: PublicRoom;
  game?: GameState;
}

export type GameAction =
  | { action: "roll" | "jail-roll" | "jail-pay" | "buy" | "pass" | "auction" | "end-turn" | "declare-bankrupt" }
  | { action: "mortgage" | "unmortgage" | "build" | "sell-house"; propertyId: string }
  | { action: "auction-bid"; amount: number }
  | { action: "auction-pass" }
  | {
      action: "trade-offer";
      trade: {
        toPlayerId: string;
        cashFrom: number;
        cashTo: number;
        propertiesFrom: string[];
        propertiesTo: string[];
      };
    }
  | {
      action: "trade-counter";
      tradeId: string;
      trade: {
        cashFrom: number;
        cashTo: number;
        propertiesFrom: string[];
        propertiesTo: string[];
      };
    }
  | { action: "trade-cancel"; tradeId: string }
  | { action: "trade-reply"; tradeId: string; accept: boolean }
  | { action: "chat"; text: string };
