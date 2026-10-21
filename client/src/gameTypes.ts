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
  ownerId?: string;
  houses: number;
  mortgaged: boolean;
}

export type BoardSpace =
  | { id: string; type: "property"; propertyId: string }
  | { id: string; type: "railroad" | "utility"; propertyId: string }
  | { id: string; type: "chance" | "communityChest" | "tax" | "corner"; label: string };

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
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  cashFrom: number;
  cashTo: number;
  propertiesFrom: string[];
  propertiesTo: string[];
  status: "pending" | "accepted" | "rejected" | "cancelled";
}

export interface GameState {
  roomCode: string;
  board: BoardSpace[];
  properties: Record<string, Property>;
  players: Player[];
  currentPlayerIndex: number;
  turnNumber: number;
  phase: "waiting" | "rolling" | "resolving" | "buying" | "trading" | "finished";
  dice: [number, number] | null;
  deck: { chance: string[]; communityChest: string[] };
  trades: TradeOffer[];
  log: Array<{ id: string; message: string; createdAt: number }>;
}

export interface PublicRoom {
  code: string;
  players: Array<{ id: string; name: string }>;
  maxPlayers: number;
}

export type RoomResponse =
  | { ok: true; room: PublicRoom }
  | { ok: false; error: string };
