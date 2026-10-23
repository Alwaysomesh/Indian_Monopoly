import { useEffect, useRef, useState, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameAction, GameRules, GameState, PublicRoom, Property, RoomResponse } from "./gameTypes";

const GAME_DURATIONS: GameRules["gameDurationMinutes"][] = [0, 30, 60, 90, 120];
const BOT_NAMES = ["Chai Champion", "Property Pro", "Market Maharaja", "Smart Investor", "City Strategist"];

function learningBotName(index: number) {
  return `${BOT_NAMES[index % BOT_NAMES.length]}${index >= BOT_NAMES.length ? ` ${index + 1}` : ""}`;
}

interface ServerToClientEvents {
  "room:update": (room: PublicRoom) => void;
  "game:update": (game: GameState) => void;
  "room:kicked": () => void;
}

interface ClientToServerEvents {
  "room:create": (
    payload: { playerName: string; playerId: string },
    acknowledge: (response: RoomResponse) => void,
  ) => void;
  "room:join": (
    payload: { playerName: string; playerId: string; roomCode: string },
    acknowledge: (response: RoomResponse) => void,
  ) => void;
  "game:start": (payload: Record<string, never>, acknowledge: (response: RoomResponse) => void) => void;
  "game:rematch": (payload: Record<string, never>, acknowledge: (response: RoomResponse) => void) => void;
  "room:settings": (
    payload: GameRules & { ruleSet: PublicRoom["ruleSet"]; sarkariNeelamiManualChange: boolean },
    acknowledge: (response: { ok: boolean; error?: string }) => void,
  ) => void;
  "room:kick": (
    payload: { targetPlayerId: string },
    acknowledge: (response: { ok: boolean; error?: string }) => void,
  ) => void;
  "game:vote-kick": (
    payload: { targetPlayerId: string },
    acknowledge: (response: { ok: boolean; error?: string }) => void,
  ) => void;
  "game:vote-kick-cast": (
    payload: { approve: boolean },
    acknowledge: (response: { ok: boolean; error?: string }) => void,
  ) => void;
  "game:action": (
    payload: GameAction,
    acknowledge: (response: { ok: boolean; error?: string }) => void,
  ) => void;
  "room:leave": () => void;
}

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_SOCKET_URL || undefined,
  { autoConnect: false },
);

function getSessionPlayerId() {
  let id = sessionStorage.getItem("monopoly.player-id") ?? localStorage.getItem("monopoly.player-id");
  if (!id) {
    id = crypto.randomUUID();
  }
  sessionStorage.setItem("monopoly.player-id", id);
  localStorage.setItem("monopoly.player-id", id);
  return id;
}

function formatMoney(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

type LogCategory = "deals" | "property" | "money" | "events";
type MobileGameView = "board" | "players" | "trade" | "chat" | "log";

function getLogCategory(text: string): LogCategory {
  if (/trade|countered|auction|bid/i.test(text)) return "deals";
  if (/season|round|turn|draws:|lands exactly on go|go bonus|wins (?:on time|the game)/i.test(text)) return "events";
  if (/buys |builds |mortgag|unmortgag|house|hotel|property/i.test(text)) return "property";
  if (/₹|pays|paid|collects|receives|salary|tax|rent|debt|bankrupt|bonus/i.test(text)) return "money";
  return "events";
}

function spacePosition(index: number): { gridColumn: number; gridRow: number } {
  if (index === 0) return { gridColumn: 11, gridRow: 11 };
  if (index < 10) return { gridColumn: 11 - index, gridRow: 11 };
  if (index === 10) return { gridColumn: 1, gridRow: 11 };
  if (index < 20) return { gridColumn: 1, gridRow: 21 - index };
  if (index === 20) return { gridColumn: 1, gridRow: 1 };
  if (index < 30) return { gridColumn: index - 19, gridRow: 1 };
  if (index === 30) return { gridColumn: 11, gridRow: 1 };
  return { gridColumn: 11, gridRow: index - 29 };
}

function propertyName(game: GameState, id: string) {
  return game.properties[id]?.name ?? id;
}

function getPropertyForSpace(game: GameState, propertyId?: string): Property | null {
  return propertyId ? game.properties[propertyId] ?? null : null;
}

function getLeaders(players: GameState["players"], score: (player: GameState["players"][number]) => number) {
  const activePlayers = players.filter((player) => !player.bankrupt);
  if (activePlayers.length === 0) return "Nobody";
  const highestScore = Math.max(...activePlayers.map(score));
  return activePlayers
    .filter((player) => score(player) === highestScore)
    .map((player) => player.name)
    .join(" & ");
}

export default function App() {
  const [playerName, setPlayerName] = useState(
    sessionStorage.getItem("monopoly.player-name") ?? localStorage.getItem("monopoly.player-name") ?? "",
  );
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [playerId] = useState(getSessionPlayerId);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      const savedCode = sessionStorage.getItem("monopoly.room-code") ?? localStorage.getItem("monopoly.room-code");
      const savedName = sessionStorage.getItem("monopoly.player-name") ?? localStorage.getItem("monopoly.player-name");
      if (savedCode && savedName) {
        socket.emit("room:join", {
          roomCode: savedCode,
          playerName: savedName,
          playerId,
        }, (response) => {
          if (response.ok && response.room) {
            setRoom(response.room);
            setGame(response.game ?? null);
            setError("");
            localStorage.setItem("monopoly.player-name", savedName);
            localStorage.setItem("monopoly.room-code", response.room.code);
          } else {
            setRoom(null);
            setGame(null);
            setRoomCodeInput(savedCode);
            setError(response.error ?? "Could not reconnect to the game room.");
          }
        });
      }
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => setError("Could not connect to the game server. Please retry.");
    const onKicked = () => {
      sessionStorage.removeItem("monopoly.room-code");
      localStorage.removeItem("monopoly.room-code");
      setRoom(null);
      setGame(null);
      setError("You were removed from this game.");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("room:update", setRoom);
    socket.on("game:update", setGame);
    socket.on("room:kicked", onKicked);
    socket.connect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("room:update", setRoom);
      socket.off("game:update", setGame);
      socket.off("room:kicked", onKicked);
      socket.disconnect();
    };
  }, [playerId]);

  function saveMembership(response: RoomResponse) {
    if (!response.ok || !response.room) {
      setError(response.error ?? "Could not join the room.");
      return;
    }
    setRoom(response.room);
    setGame(response.game ?? null);
    setError("");
    sessionStorage.setItem("monopoly.player-name", playerName.trim());
    sessionStorage.setItem("monopoly.room-code", response.room.code);
    localStorage.setItem("monopoly.player-name", playerName.trim());
    localStorage.setItem("monopoly.room-code", response.room.code);
  }

  function enterRoom(action: "create" | "join") {
    setError("");
    const name = playerName.trim();
    if (!name) {
      setError("Add your name before joining the table.");
      return;
    }
    if (!socket.connected) {
      setError("Connecting to the server. Try again in a moment.");
      return;
    }
    if (action === "create") {
      socket.emit("room:create", { playerName: name, playerId }, saveMembership);
    } else {
      socket.emit("room:join", { playerName: name, roomCode: roomCodeInput, playerId }, saveMembership);
    }
  }

  function startGame() {
    setError("");
    socket.emit("game:start", {}, (response) => {
      if (response.ok) {
        if (response.game) setGame(response.game);
      } else {
        setError(response.error ?? "Could not start the game.");
      }
    });
  }

  function updateRoomRules(
    ruleSet: PublicRoom["ruleSet"],
    rules: GameRules,
    sarkariNeelamiManualChange = false,
  ) {
    setError("");
    socket.emit("room:settings", { ruleSet, ...rules, sarkariNeelamiManualChange }, (response) => {
      if (!response.ok) setError(response.error ?? "Could not update the game rules.");
    });
  }

  function updateStartingCash(value: string) {
    if (!room) return false;
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 500 || amount > 5000) {
      setError("Starting cash must be a whole amount between ₹500 and ₹5,000.");
      return false;
    }
    updateRoomRules(room.ruleSet, { ...room.rules, startingCash: amount });
    return true;
  }

  function kickPlayer(targetPlayerId: string) {
    setError("");
    socket.emit("room:kick", { targetPlayerId }, (response) => {
      if (!response.ok) setError(response.error ?? "Could not remove that player.");
    });
  }

  function leaveRoom() {
    socket.emit("room:leave");
    sessionStorage.removeItem("monopoly.room-code");
    localStorage.removeItem("monopoly.room-code");
    setRoom(null);
    setGame(null);
    setError("");
  }

  if (game && room) {
    return (
      <GameTable
        connected={connected}
        game={game}
        room={room}
        isHost={room.hostId === playerId}
        onAction={(action, onComplete) => {
          setError("");
          socket.emit("game:action", action, (response) => {
            if (!response.ok) setError(response.error ?? "That move could not be completed.");
            onComplete?.(response);
          });
        }}
        onRematch={() => {
          setError("");
          socket.emit("game:rematch", {}, (response) => {
            if (response.game) setGame(response.game);
            if (!response.ok) setError(response.error ?? "Could not start the rematch.");
          });
        }}
        onLeave={leaveRoom}
        onVoteKick={(targetPlayerId) => {
          setError("");
          socket.emit("game:vote-kick", { targetPlayerId }, (response) => {
            if (!response.ok) setError(response.error ?? "Could not start the vote.");
          });
        }}
        onCastVote={(approve) => {
          setError("");
          socket.emit("game:vote-kick-cast", { approve }, (response) => {
            if (!response.ok) setError(response.error ?? "Could not record your vote.");
          });
        }}
        playerId={playerId}
        error={error}
      />
    );
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Monopoly India home">
          <span className="brand-mark">M</span>
          <span>MONOPOLY <strong>INDIA</strong></span>
        </a>
        <span className={`connection ${connected ? "online" : ""}`}>
          <i /> {connected ? "Server connected" : "Connecting…"}
        </span>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">YOUR CITY. YOUR EMPIRE.</p>
          <h1>Chalo, build<br />your <em>fortune.</em></h1>
          <p className="subtitle">
            Buy iconic Indian addresses, collect rent, and become the ultimate mogul.
            Your friends are just a room code away.
          </p>
          <div className="features">
            <span>₹ Rupee economy</span>
            <span>✦ 2–10 players</span>
            <span>⌁ Live multiplayer</span>
          </div>
        </div>
        <div className="join-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">THE TABLE IS WAITING</p>
              <h2>{room ? "Your private table" : "Join the game"}</h2>
            </div>
            <span className="dice-icon" aria-hidden="true">⚄</span>
          </div>
          {!room ? (
            <>
              <label htmlFor="player-name">Your player name</label>
              <input
                id="player-name"
                maxLength={20}
                onChange={(event) => setPlayerName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") enterRoom("create");
                }}
                placeholder="e.g. Riya"
                value={playerName}
              />
              <button className="primary-button" onClick={() => enterRoom("create")}>
                Create a private room <span>→</span>
              </button>
              <div className="divider"><span>OR JOIN FRIENDS</span></div>
              <div className="join-row">
                <input
                  aria-label="Room code"
                  maxLength={6}
                  onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") enterRoom("join");
                  }}
                  placeholder="ROOM CODE"
                  value={roomCodeInput}
                />
                <button className="secondary-button" onClick={() => enterRoom("join")}>Join</button>
              </div>
              {error && <p className="error-message" role="alert">{error}</p>}
            </>
          ) : (
            <div className="lobby">
              <p className="lobby-label">SHARE THIS CODE WITH YOUR FRIENDS</p>
              <div className="room-code">{room.code}</div>
              <p className="player-count">
                {room.players.length} human{room.players.length === 1 ? "" : "s"} + {room.rules.botCount} bots / {room.maxPlayers} seats
              </p>
              <ul className="player-list">
                {room.players.map((player, index) => (
                  <li key={player.id}>
                    <span className={`player-dot dot-${index % 10}`} />
                    {player.name}
                    {!player.connected && <small>OFFLINE</small>}
                    {player.id === room.hostId && <small>HOST</small>}
                    {room.hostId === playerId && player.id !== playerId && (
                      <button
                        aria-label={`Remove ${player.name}`}
                        className="kick-button"
                        onClick={() => kickPlayer(player.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
                {Array.from({ length: room.rules.botCount }, (_, index) => (
                  <li key={`learning-bot-${index}`}>
                    <span className={`player-dot dot-${(room.players.length + index) % 10}`} />
                    {learningBotName(index)}
                    <small>BOT</small>
                  </li>
                ))}
              </ul>
              {room.hostId === playerId ? (
                <>
                  <label className="rules-label" htmlFor="rule-set">Game style</label>
                  <select
                    className="rule-select"
                    id="rule-set"
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "classic" || value === "quick" || value === "chaos") {
                        const presetCash = value === "classic" ? 1500 : value === "quick" ? 1200 : 1000;
                        updateRoomRules(value, { ...room.rules, startingCash: presetCash });
                      }
                    }}
                    value={room.ruleSet}
                  >
                    <option value="classic">Classic — standard rules</option>
                    <option value="quick">Quick — ₹1,200 start, ₹300 GO, 2× rent</option>
                    <option value="chaos">Chaos — ₹1,000 start, ₹400 GO, 3× rent</option>
                  </select>
                  <p className="rule-description">
                    {room.ruleSet === "classic"
                      ? "Traditional rent and ₹200 for passing GO."
                      : room.ruleSet === "quick"
                        ? "Faster play: ₹300 for passing GO and double rent."
                        : "High-stakes chaos: ₹400 for passing GO and triple rent."}
                  </p>
                  <label className="rules-label" htmlFor="starting-cash">Starting cash (₹500–₹5,000)</label>
                  <input
                    defaultValue={room.rules.startingCash}
                    id="starting-cash"
                    key={room.rules.startingCash}
                    max={5000}
                    min={500}
                    onBlur={(event) => {
                      if (!updateStartingCash(event.currentTarget.value)) {
                        event.currentTarget.value = String(room.rules.startingCash);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                    step={100}
                    type="number"
                  />
                  <label className="auction-setting" htmlFor="auctions-enabled">
                    <input
                      checked={room.rules.auctionsEnabled}
                      id="auctions-enabled"
                      onChange={(event) => updateRoomRules(room.ruleSet, {
                        ...room.rules,
                        auctionsEnabled: event.currentTarget.checked,
                      })}
                      type="checkbox"
                    />
                    Enable property auctions when declined
                  </label>
                  <label className="auction-setting" htmlFor="seasons-enabled">
                    <input
                      checked={room.rules.seasonsEnabled}
                      id="seasons-enabled"
                      onChange={(event) => updateRoomRules(room.ruleSet, {
                        ...room.rules,
                        seasonsEnabled: event.currentTarget.checked,
                      })}
                      type="checkbox"
                    />
                    Enable random season events
                  </label>
                  <label className="rules-label" htmlFor="game-duration">Game time limit</label>
                  <select
                    className="rule-select"
                    id="game-duration"
                    onChange={(event) => {
                      const duration = GAME_DURATIONS.find((value) => value === Number(event.currentTarget.value));
                      if (duration !== undefined) {
                        updateRoomRules(room.ruleSet, { ...room.rules, gameDurationMinutes: duration });
                      }
                    }}
                    value={room.rules.gameDurationMinutes}
                  >
                    <option value={0}>No time limit</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>60 minutes</option>
                    <option value={90}>90 minutes</option>
                    <option value={120}>120 minutes</option>
                  </select>
                  <label className="auction-setting" htmlFor="bankrupt-auctions">
                    <input
                      checked={room.rules.bankruptAuctionsEnabled}
                      id="bankrupt-auctions"
                      onChange={(event) => updateRoomRules(room.ruleSet, {
                        ...room.rules,
                        bankruptAuctionsEnabled: event.currentTarget.checked,
                      })}
                      type="checkbox"
                    />
                    Auction properties returned by bankrupt players
                  </label>
                  <label className="auction-setting" htmlFor="sarkari-neelami">
                    <input
                      checked={room.rules.sarkariNeelamiEnabled}
                      id="sarkari-neelami"
                      onChange={(event) => updateRoomRules(
                        room.ruleSet,
                        { ...room.rules, sarkariNeelamiEnabled: event.currentTarget.checked },
                        true,
                      )}
                      type="checkbox"
                    />
                    Sarkari Neelami · automatic from 6+ players
                  </label>
                  <p className="rule-description">
                    Unsold cities go to half-price auctions from round 4: every 2 rounds, or every round with 8+ players.
                    {room.sarkariNeelamiCustomized ? " Host override is active." : " Default follows player count."}
                  </p>
                  <label className="rules-label" htmlFor="bot-count">Learning bots</label>
                  <select
                    className="rule-select"
                    id="bot-count"
                    onChange={(event) => updateRoomRules(room.ruleSet, {
                      ...room.rules,
                      botCount: Number(event.currentTarget.value),
                    })}
                    value={room.rules.botCount}
                  >
                    {Array.from({ length: Math.min(10, room.maxPlayers - room.players.length + 1) }, (_, count) => (
                      <option key={count} value={count}>{count === 0 ? "No bots" : `${count} bot${count > 1 ? "s" : ""}`}</option>
                    ))}
                  </select>
                  <p className="rule-description">Add bots to practice solo, or leave seats open for invited friends. Bots trade strategically.</p>
                  <button
                    className="primary-button"
                    disabled={room.players.length + room.rules.botCount < 2}
                    onClick={startGame}
                  >
                    {room.players.length + room.rules.botCount < 2 ? "Add another player or bot" : "Start the game"} <span>→</span>
                  </button>
                </>
              ) : (
                <p className="lobby-hint">
                  Game style: <strong>{room.ruleSet === "classic" ? "Classic" : room.ruleSet === "quick" ? "Quick" : "Chaos"}</strong>
                  {" "}· {formatMoney(room.rules.startingCash)} starting cash
                  {" "}· auctions {room.rules.auctionsEnabled ? "on" : "off"}
                  {" "}· seasons {room.rules.seasonsEnabled ? "on" : "off"}.
                  {" "}· bots {room.rules.botCount}
                  {" "}Waiting for the host to start the game…
                </p>
              )}
              {error && <p className="error-message" role="alert">{error}</p>}
            </div>
          )}
        </div>
      </section>
      <footer>
        <span>GOOD TIMES. GREAT REAL ESTATE.</span>
        <span>MADE FOR YOUR CREW <b>✦</b></span>
        <a className="feedback-link" href="mailto:yagaofficial02@gmail.com?subject=Monopoly%20India%20feedback">
          Bugs or ideas? <strong>Email us</strong>
        </a>
      </footer>
    </main>
  );
}

function GameTable({
  connected,
  game,
  room,
  isHost,
  onAction: sendAction,
  onRematch,
  onLeave,
  onVoteKick,
  onCastVote,
  playerId,
  error,
}: {
  connected: boolean;
  game: GameState;
  room: PublicRoom;
  isHost: boolean;
  onAction: (action: GameAction, onComplete?: (response: { ok: boolean; error?: string }) => void) => void;
  onRematch: () => void;
  onLeave: () => void;
  onVoteKick: (targetPlayerId: string) => void;
  onCastVote: (approve: boolean) => void;
  playerId: string;
  error: string;
}) {
  const currentPlayer = game.players[game.currentPlayerIndex];
  const me = game.players.find((player) => player.id === playerId);
  const isMyTurn = currentPlayer?.id === playerId;
  const pendingProperty = game.pendingPurchase
    ? game.properties[game.pendingPurchase.propertyId]
    : null;
  const debtPlayer = game.players.find((player) => player.id === game.debt?.debtorId);
  const [chatDraft, setChatDraft] = useState("");
  const [tradeTarget, setTradeTarget] = useState("");
  const [cashFrom, setCashFrom] = useState("0");
  const [cashTo, setCashTo] = useState("0");
  const [auctionBid, setAuctionBid] = useState("1");
  const [propertiesFrom, setPropertiesFrom] = useState<string[]>([]);
  const [propertiesTo, setPropertiesTo] = useState<string[]>([]);
  const [tradeSearchFrom, setTradeSearchFrom] = useState("");
  const [tradeSearchTo, setTradeSearchTo] = useState("");
  const [tradeError, setTradeError] = useState("");
  const [showTradeDialog, setShowTradeDialog] = useState(false);
  const [counteringTradeId, setCounteringTradeId] = useState<string | null>(null);
  const [followPlayerPiece, setFollowPlayerPiece] = useState(true);
  const [tab, setTab] = useState<"properties" | "trade" | "chat">("properties");
  const [mobileView, setMobileView] = useState<MobileGameView>("board");
  const [toolsOpen, setToolsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("monopoly.dark-mode") === "true");
  const [logFilter, setLogFilter] = useState<"all" | LogCategory>("all");
  const [showHelp, setShowHelp] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(() => {
    const savedPreference = localStorage.getItem("monopoly.motion-enabled");
    return savedPreference === null
      ? typeof window.matchMedia !== "function" || !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : savedPreference === "true";
  });
  const [soundEnabled, setSoundEnabled] = useState(() =>
    typeof window.AudioContext !== "undefined" && localStorage.getItem("monopoly.sound-enabled") === "true",
  );
  const [musicEnabled, setMusicEnabled] = useState(() =>
    typeof window.AudioContext !== "undefined" && localStorage.getItem("monopoly.music-enabled") === "true",
  );
  const [musicReady, setMusicReady] = useState(false);
  const [musicVolume, setMusicVolume] = useState(() => {
    const savedVolume = Number(localStorage.getItem("monopoly.music-volume"));
    return Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 100 ? savedVolume : 28;
  });
  const [drawnCard, setDrawnCard] = useState("");
  const [celebration, setCelebration] = useState("");
  const [recapStatus, setRecapStatus] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const musicTimerRef = useRef<number | null>(null);
  const musicStepRef = useRef(0);
  const boardSpaceRefs = useRef<Array<HTMLDivElement | null>>([]);
  const previousPositions = useRef<Record<string, number>>({});
  const movementTimers = useRef<number[]>([]);
  const [visualPositions, setVisualPositions] = useState<Record<string, number>>({});
  const latestLogId = game.log[0]?.id;
  const selectedProperty = selectedPropertyId ? game.properties[selectedPropertyId] ?? null : null;
  const selectedOwner = selectedProperty?.ownerId ? game.players.find((player) => player.id === selectedProperty.ownerId) : null;
  const selectedPropertyGroup = selectedProperty ? Object.values(game.properties).filter((property) => property.group === selectedProperty.group) : [];
  const selectedUtilityCount = selectedOwner ? Object.values(game.properties).filter((property) => property.group === "utility" && property.ownerId === selectedOwner.id).length : 0;
  const selectedCanManage = (game.phase === "debt" && game.debt?.debtorId === playerId) || (isMyTurn && ["rolling", "buying", "end-turn"].includes(game.phase));
  const selectedGroupHasBuildings = selectedPropertyGroup.some((property) => property.houses > 0);
  const selectedGroupHasMortgage = selectedPropertyGroup.some((property) => property.mortgaged);
  const selectedHasMonopoly = selectedProperty && selectedProperty.group !== "railroad" && selectedProperty.group !== "utility" && selectedPropertyGroup.every((property) => property.ownerId === playerId);
  const selectedMinimumBuildings = Math.min(...selectedPropertyGroup.map((property) => property.houses));
  const selectedMaximumBuildings = Math.max(...selectedPropertyGroup.map((property) => property.houses));
  const selectedHouseCost = selectedProperty?.houseCost ? selectedProperty.houseCost * (game.seasonEvent?.id === "construction-boom" ? 2 : 1) : 0;
  const selectedRentRelief = game.seasonEvent?.id === "rent-relief" ? 0.5 : 1;
  const selectedPendingPurchase = selectedProperty && game.phase === "buying" && isMyTurn && game.pendingPurchase?.propertyId === selectedProperty.id;
  const followedPosition = visualPositions[playerId] ?? me?.position;
  const followedSpace = followedPosition === undefined ? undefined : game.board[followedPosition];
  const followedProperty = getPropertyForSpace(game, followedSpace?.propertyId);
  const followedPositionLabel = followedProperty?.name ?? followedSpace?.label ?? "the board";
  const secondsRemaining = game.deadlineAt ? Math.max(0, Math.ceil((game.deadlineAt - now) / 1000)) : null;
  const gameSecondsRemaining = game.gameEndsAt ? Math.max(0, Math.ceil((game.gameEndsAt - now) / 1000)) : null;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => () => {
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch((audioError) => {
        console.error("Could not close the game audio context:", audioError);
      });
    }
  }, []);

  useEffect(() => {
    if (!musicEnabled || musicReady || typeof window.AudioContext === "undefined") return;
    const startAfterGesture = () => {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      void context.resume().then(() => setMusicReady(true)).catch((audioError) => {
        console.error("Could not resume the game soundtrack:", audioError);
      });
    };
    window.addEventListener("pointerdown", startAfterGesture, { once: true });
    return () => window.removeEventListener("pointerdown", startAfterGesture);
  }, [musicEnabled, musicReady]);

  useEffect(() => {
    if (!musicEnabled || !musicReady || !audioContextRef.current || musicVolume === 0) {
      if (musicTimerRef.current !== null) window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
      return;
    }
    const context = audioContextRef.current;
    const melody = [392, 494, 587, 659, 587, 494, 440, 494];
    musicTimerRef.current = window.setInterval(() => {
      const step = musicStepRef.current++ % 8;
      const now = context.currentTime;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime((musicVolume / 100) * 0.035, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      const note = context.createOscillator();
      note.type = "triangle";
      note.frequency.value = melody[step];
      note.connect(gain);
      gain.connect(context.destination);
      note.start(now);
      note.stop(now + 0.21);

      if (step % 2 === 0) {
        const bass = context.createOscillator();
        const bassGain = context.createGain();
        bass.type = "sine";
        bass.frequency.setValueAtTime(step === 0 ? 110 : 82, now);
        bass.frequency.exponentialRampToValueAtTime(42, now + 0.12);
        bassGain.gain.setValueAtTime((musicVolume / 100) * 0.1, now);
        bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        bass.connect(bassGain);
        bassGain.connect(context.destination);
        bass.start(now);
        bass.stop(now + 0.16);
      }
    }, 250);
    return () => {
      if (musicTimerRef.current !== null) window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    };
  }, [musicEnabled, musicVolume]);

  useEffect(() => {
    if (!followPlayerPiece || followedPosition === undefined) return;
    const boardSpace = boardSpaceRefs.current[followedPosition];
    if (!boardSpace) return;
    const frame = window.requestAnimationFrame(() =>
      boardSpace.scrollIntoView({ behavior: motionEnabled ? "smooth" : "auto", block: "center", inline: "center" }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [followPlayerPiece, followedPosition, isMyTurn, motionEnabled]);

  useEffect(() => {
    const pauseFollowing = () => setFollowPlayerPiece(false);
    const pauseForScrollKey = (event: KeyboardEvent) => {
      if (!["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, button, [contenteditable=true]")) return;
      pauseFollowing();
    };
    window.addEventListener("wheel", pauseFollowing, { passive: true });
    window.addEventListener("touchmove", pauseFollowing, { passive: true });
    window.addEventListener("keydown", pauseForScrollKey);
    return () => {
      window.removeEventListener("wheel", pauseFollowing);
      window.removeEventListener("touchmove", pauseFollowing);
      window.removeEventListener("keydown", pauseForScrollKey);
    };
  }, []);

  useEffect(() => {
    if (tab !== "chat") return;
    const chatMessages = chatMessagesRef.current;
    chatMessages?.scrollTo({ top: chatMessages.scrollHeight, behavior: motionEnabled ? "smooth" : "auto" });
  }, [game.chat.length, tab, motionEnabled]);

  useEffect(() => {
    const latestLog = game.log[0];
    const cardText = latestLog?.text.match(/ draws: (.+)$/)?.[1];
    if (!cardText) return;
    setDrawnCard(cardText);
    const timeout = window.setTimeout(() => setDrawnCard(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [latestLogId]);

  useEffect(() => {
    const latestLog = game.log[0];
    const text = latestLog?.text ?? "";
    let message = "";
    if (/wins (?:on time|the game)/i.test(text)) {
      message = `🏆 ${game.players.find((player) => player.id === game.winnerPlayerId)?.name ?? "A champion"} takes the crown!`;
    } else if (/lands exactly on GO/i.test(text)) {
      message = "🎉 Double GO bonus! What a perfect landing!";
    } else if (/wins .+ at auction/i.test(text)) {
      message = "🔨 Auction victory! A new address joins the empire.";
    } else if (/builds a hotel/i.test(text)) {
      message = "🏨 Hotel milestone! The skyline is rising.";
    } else if (/builds a house/i.test(text)) {
      message = "🏠 New construction! Your empire is growing.";
    } else if (/accepted .+'s trade/i.test(text)) {
      message = "🤝 Deal sealed! Both empires are reshaping.";
    } else {
      const buyer = game.players.find((player) => text.startsWith(`${player.name} buys `));
      const purchased = buyer && Object.values(game.properties).find((property) =>
        text.includes(` buys ${property.name} for `),
      );
      if (buyer && purchased && buyer.propertyIds.length === 1) {
        message = "🏙️ First property claimed! The empire begins.";
      } else if (buyer && purchased && purchased.group !== "railroad" && purchased.group !== "utility" &&
          Object.values(game.properties).filter((property) => property.group === purchased.group)
            .every((property) => property.ownerId === buyer.id)) {
        message = `✨ ${buyer.name} completed a color set!`;
      }
    }
    if (message) setCelebration(message);
  }, [latestLogId]);

  useEffect(() => {
    if (!celebration) return;
    const timeout = window.setTimeout(() => setCelebration(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [celebration]);

  useEffect(() => {
    setAuctionBid(String(Math.max((game.auction?.highestBid ?? 0) + 1, game.auction?.minimumBid ?? 1)));
  }, [game.auction?.highestBid, game.auction?.minimumBid]);

  useEffect(() => {
    const currentPositions: Record<string, number> = {};
    const movedPlayers = game.players.filter((player) =>
      previousPositions.current[player.id] !== undefined &&
      previousPositions.current[player.id] !== player.position,
    );

    for (const player of game.players) currentPositions[player.id] = player.position;
    if (movedPlayers.length === 0 || !motionEnabled) {
      if (!motionEnabled) setVisualPositions({});
      previousPositions.current = currentPositions;
      return;
    }

    movementTimers.current.forEach(window.clearTimeout);
    movementTimers.current = [];
    setVisualPositions(Object.fromEntries(
      movedPlayers.map((player) => [player.id, previousPositions.current[player.id]]),
    ));

    for (const player of movedPlayers) {
      const previous = previousPositions.current[player.id];
      const clockwiseDistance = (player.position - previous + 40) % 40;
      const movingToGo = player.position === 0 && previous !== 0;
      const direction = player.inJail || movingToGo || clockwiseDistance <= 20 ? 1 : -1;
      const steps = player.inJail ? [player.position] : Array.from(
        { length: movingToGo ? 40 - previous : direction === 1 ? clockwiseDistance : 40 - clockwiseDistance },
        (_, index) => (previous + direction * (index + 1) + 40) % 40,
      );
      steps.forEach((position, index) => {
        movementTimers.current.push(window.setTimeout(() => {
          setVisualPositions((current) => ({ ...current, [player.id]: position }));
          if (index === steps.length - 1) {
            movementTimers.current.push(window.setTimeout(() => {
              setVisualPositions((current) => {
                const next = { ...current };
                delete next[player.id];
                return next;
              });
            }, 140));
          }
        }, index * 85));
      });
    }

    previousPositions.current = currentPositions;
  }, [game.players, motionEnabled]);

  useEffect(() => () => movementTimers.current.forEach(window.clearTimeout), []);

  function playTone(frequency: number) {
    if (!soundEnabled) return;
    const context = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = context;
    void context.resume().then(() => {
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      volume.gain.setValueAtTime(0.0001, context.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(volume);
      volume.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
    }).catch((audioError) => {
      console.error("Could not play the game sound:", audioError);
    });
  }

  function onAction(action: GameAction, onComplete?: (response: { ok: boolean; error?: string }) => void) {
    if (action.action === "roll" || action.action === "jail-roll") playTone(440);
    else if (action.action === "buy" || action.action === "auction-bid") playTone(660);
    else if (action.action === "trade-reply" && action.accept) playTone(880);
    sendAction(action, onComplete);
  }

  function setMotionPreference(enabled: boolean) {
    localStorage.setItem("monopoly.motion-enabled", String(enabled));
    setMotionEnabled(enabled);
  }

  function setSoundPreference(enabled: boolean) {
    localStorage.setItem("monopoly.sound-enabled", String(enabled));
    setSoundEnabled(enabled);
    if (enabled) {
      const context = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = context;
      void context.resume().catch((audioError) => {
        console.error("Could not enable game sounds:", audioError);
      });
    }
  }

  function openTradeComposer(offer?: GameState["trades"][number]) {
    setTradeError("");
    if (offer) {
      setCounteringTradeId(offer.id);
      setTradeTarget(offer.fromPlayerId);
      setCashFrom(String(offer.cashTo));
      setCashTo(String(offer.cashFrom));
      setPropertiesFrom([...offer.propertiesTo]);
      setPropertiesTo([...offer.propertiesFrom]);
    } else {
      setCounteringTradeId(null);
      setTradeTarget("");
      setCashFrom("0");
      setCashTo("0");
      setPropertiesFrom([]);
      setPropertiesTo([]);
    }
    setTradeSearchFrom("");
    setTradeSearchTo("");
    setShowTradeDialog(true);
  }

  function showPropertyOnBoard(propertyId: string) {
    const boardIndex = game.board.findIndex((space) => space.propertyId === propertyId);
    setFollowPlayerPiece(false);
    setSelectedPropertyId(propertyId);
    setMobileView("board");
    if (boardIndex < 0) return;
    window.requestAnimationFrame(() => {
      boardSpaceRefs.current[boardIndex]?.scrollIntoView({ behavior: motionEnabled ? "smooth" : "auto", block: "center", inline: "center" });
    });
  }

  function toggleSelection(list: string[], setList: (next: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((value) => value !== id) : [...list, id]);
  }

  function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatDraft.trim()) return;
    onAction({ action: "chat", text: chatDraft.trim() });
    setChatDraft("");
  }

  async function copyGameRecap() {
    const winner = game.players.find((player) => player.id === game.winnerPlayerId);
    const recap = [
      `Monopoly India · Room ${game.roomCode}`,
      `Winner: ${winner?.name ?? "Nobody"}`,
      game.endReason === "time-limit" ? "Game ended when the time limit expired." : "Game ended by bankruptcy.",
      `Cash leader: ${getLeaders(game.players, (player) => player.cash)}`,
      `Property collector: ${getLeaders(game.players, (player) => player.propertyIds.length)} (${Math.max(...game.players.filter((player) => !player.bankrupt).map((player) => player.propertyIds.length), 0)} properties)`,
      `Skyline builder: ${getLeaders(game.players, (player) => Object.values(game.properties).filter((property) => property.ownerId === player.id).reduce((total, property) => total + property.houses, 0))}`,
      `Turns played: ${game.turnNumber}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(recap);
      setRecapStatus("Match recap copied!");
    } catch {
      setRecapStatus("Could not copy the recap. Check your browser clipboard permissions.");
    }
  }

  function submitTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = game.players.find((player) => player.id === tradeTarget);
    if (!target || !Number.isSafeInteger(Number(cashFrom)) || !Number.isSafeInteger(Number(cashTo)) ||
        Number(cashFrom) < 0 || Number(cashTo) < 0 ||
        Number(cashFrom) > (me?.cash ?? 0) || Number(cashTo) > target.cash) return;
    setTradeError("");
    const trade = {
        cashFrom: Number(cashFrom),
        cashTo: Number(cashTo),
        propertiesFrom,
        propertiesTo,
    };
    const onTradeSubmitted = (response: { ok: boolean; error?: string }) => {
      if (!response.ok) {
        setTradeError(response.error ?? "The trade could not be sent.");
        return;
      }
      setShowTradeDialog(false);
      setCounteringTradeId(null);
      setPropertiesFrom([]);
      setPropertiesTo([]);
      setCashFrom("0");
      setCashTo("0");
      setTradeSearchFrom("");
      setTradeSearchTo("");
    };
    if (counteringTradeId) {
      onAction({ action: "trade-counter", tradeId: counteringTradeId, trade }, onTradeSubmitted);
    } else {
      onAction({ action: "trade-offer", trade: { ...trade, toPlayerId: tradeTarget } }, onTradeSubmitted);
    }
  }

  const rollAvailable = game.phase === "rolling" && isMyTurn && !game.debt;
  const mayEndTurn = game.phase === "end-turn" && isMyTurn;
  const owedByMe = game.phase === "debt" && debtPlayer?.id === playerId;

  return (
    <main className={`table-page ${motionEnabled ? "motion-enabled" : "motion-disabled"} ${darkMode ? "theme-dark" : ""} ${toolsOpen ? "tools-open" : "tools-collapsed"}`}>
      <header className="table-topbar">
        <a className="brand" href="/" aria-label="Monopoly India home">
          <img className="brand-mark" src="/brand-mark.svg" alt="" />
          <span>MONOPOLY <strong>INDIA</strong></span>
        </a>
        <div className="table-title">
          <span className="room-chip">ROOM {game.roomCode}</span>
          <span className="room-chip rules-chip">
            {game.ruleSet === "classic" ? "CLASSIC" : game.ruleSet === "quick" ? "QUICK" : "CHAOS"}
            {" · "}{formatMoney(game.rules.startingCash)} START
            {" · "}{game.rules.auctionsEnabled ? "AUCTIONS ON" : "NO AUCTIONS"}
            {" · "}{game.rules.seasonsEnabled ? "SEASONS ON" : "SEASONS OFF"}
            {" · "}{game.rules.gameDurationMinutes ? `${game.rules.gameDurationMinutes} MIN` : "NO TIME LIMIT"}
          </span>
          <span className={`connection ${connected ? "online" : ""}`}><i />{connected ? "Live game" : "Reconnecting…"}</span>
          <div className="table-quick-tools">
            <button className="quiet-button" onClick={() => setShowHelp(true)}>How to play</button>
            <button className="quiet-button" onClick={() => setShowPreferences(true)}>Sound & motion</button>
            <button
              aria-pressed={followPlayerPiece}
              className="quiet-button follow-toggle"
              onClick={() => setFollowPlayerPiece((following) => !following)}
            >
              {followPlayerPiece ? "Follow on" : "Follow off"}
            </button>
            <button
              aria-pressed={darkMode}
              className="quiet-button theme-toggle"
              onClick={() => {
                const next = !darkMode;
                localStorage.setItem("monopoly.dark-mode", String(next));
                setDarkMode(next);
              }}
            >
              {darkMode ? "☀ Light" : "☾ Dark"}
            </button>
            <button
              aria-expanded={toolsOpen}
              className="quiet-button tools-toggle"
              onClick={() => setToolsOpen((open) => !open)}
            >
              {toolsOpen ? "Hide tools" : "Game tools"}
            </button>
          </div>
        </div>
        <a
          className="feedback-link table-feedback-link"
          href="mailto:yagaofficial02@gmail.com?subject=Monopoly%20India%20feedback"
        >
          Feedback
        </a>
        <button className="quiet-button" onClick={onLeave}>Leave table</button>
      </header>

      {celebration && <div className="milestone-celebration" role="status" aria-live="polite"><span>{celebration}</span></div>}
      {showHelp && (
        <div className="card-backdrop" onClick={() => setShowHelp(false)}>
          <section aria-labelledby="help-heading" aria-modal="true" className="help-card" onClick={(event) => event.stopPropagation()} role="dialog">
            <button aria-label="Close how to play" className="card-dismiss" onClick={() => setShowHelp(false)}>×</button>
            <small>QUICK START</small>
            <h2 id="help-heading">How to play</h2>
            <ol>
              <li><strong>Roll and move.</strong> Take turns rolling the dice and follow your token around the board.</li>
              <li><strong>Build your city portfolio.</strong> Buy open properties, collect rent, and complete a color group to build houses and hotels.</li>
              <li><strong>Manage your money.</strong> Mortgage properties or sell buildings if you need cash. Use the board or Properties list to inspect an address.</li>
              <li><strong>Make a deal.</strong> Propose trades, counter an incoming offer, or withdraw an offer while it is pending. Offers expire after 90 seconds.</li>
            </ol>
            <p>Learning solo? Your host can add learning bots in the room settings before the game starts.</p>
            <button className="action-button" onClick={() => setShowHelp(false)}>Got it</button>
          </section>
        </div>
      )}
      {showPreferences && (
        <div className="card-backdrop" onClick={() => setShowPreferences(false)}>
          <section aria-labelledby="preferences-heading" aria-modal="true" className="preferences-card" onClick={(event) => event.stopPropagation()} role="dialog">
            <button aria-label="Close sound and motion settings" className="card-dismiss" onClick={() => setShowPreferences(false)}>×</button>
            <small>YOUR TABLE, YOUR WAY</small>
            <h2 id="preferences-heading">Sound & motion</h2>
            <label className="preference-option">
              <span><strong>Animations</strong><small>Dice, tokens, cards, and celebrations</small></span>
              <input checked={motionEnabled} onChange={(event) => setMotionPreference(event.currentTarget.checked)} type="checkbox" />
            </label>
            <label className="preference-option">
              <span><strong>Sound effects</strong><small>Upbeat cues for dice, purchases, and accepted trades</small></span>
              <input checked={soundEnabled} disabled={typeof window.AudioContext === "undefined"} onChange={(event) => setSoundPreference(event.currentTarget.checked)} type="checkbox" />
            </label>
            <label className="preference-option">
              <span><strong>Game soundtrack</strong><small>Original, generated arcade beat · off by default</small></span>
              <input checked={musicEnabled} disabled={typeof window.AudioContext === "undefined"} onChange={(event) => {
                const enabled = event.currentTarget.checked;
                localStorage.setItem("monopoly.music-enabled", String(enabled));
                setMusicEnabled(enabled);
                if (enabled) {
                  const context = audioContextRef.current ?? new AudioContext();
                  audioContextRef.current = context;
                  void context.resume().then(() => setMusicReady(true)).catch((audioError) => {
                    console.error("Could not enable the game soundtrack:", audioError);
                  });
                }
              }} type="checkbox" />
            </label>
            <label className="music-volume-option">
              Music volume
              <input
                aria-label="Music volume"
                max={100}
                min={0}
                onChange={(event) => {
                  const volume = Number(event.currentTarget.value);
                  localStorage.setItem("monopoly.music-volume", String(volume));
                  setMusicVolume(volume);
                }}
                type="range"
                value={musicVolume}
              />
              <span>{musicVolume}%</span>
            </label>
            {typeof window.AudioContext === "undefined" && <p className="preference-note">Sound effects are not supported by this browser.</p>}
          </section>
        </div>
      )}
      <nav aria-label="Game views" className="mobile-game-nav">
        {([
          ["board", "Board"],
          ["players", "Players"],
          ["trade", "Trade"],
          ["chat", "Chat"],
          ["log", "Log"],
        ] as const).map(([view, label]) => (
          <button
            aria-pressed={mobileView === view}
            className={mobileView === view ? "selected-mobile-view" : ""}
            key={view}
            onClick={() => {
              setMobileView(view);
              if (view === "players") setTab("properties");
              if (view === "trade") setTab("trade");
              if (view === "chat") setTab("chat");
            }}
          >
            {label}
            {view === "trade" && game.trades.some((trade) => trade.toPlayerId === playerId && trade.status === "pending") && <i aria-label="New offer" />}
          </button>
        ))}
      </nav>
      <div className="table-layout" data-mobile-view={mobileView}>
        <section className="board-column">
          <div className="turn-banner">
            <div>
              <span className="turn-kicker">{game.phase === "finished" ? "GAME OVER" : `ROUND ${game.roundNumber} · TURN ${game.turnNumber}`}</span>
              <strong>
                {game.phase === "finished" ? "🏆" : currentPlayer?.token}{" "}
                {game.phase === "finished"
                  ? `${game.players.find((player) => player.id === game.winnerPlayerId)?.name ?? "Nobody"} wins!`
                  : isMyTurn ? "Your turn" : `${currentPlayer?.name}'s turn`}
              </strong>
            </div>
            <div className="dice-result" aria-label="Last dice roll">
              {game.dice ? <><span key={`die-${game.log[0]?.id}-${game.dice[0]}`}>{game.dice[0]}</span><b>+</b><span key={`die-two-${game.log[0]?.id}-${game.dice[1]}`}>{game.dice[1]}</span></> : "⚄ ⚄"}
            </div>
            {secondsRemaining !== null && <div className={`turn-clock ${secondsRemaining <= 10 ? "turn-clock-urgent" : ""}`} role="timer"><strong>{secondsRemaining}s</strong><span>{game.phase === "rolling" ? "to roll" : "to act"}</span></div>}
            {gameSecondsRemaining !== null && game.phase !== "finished" && <div className={`turn-clock game-clock ${gameSecondsRemaining <= 300 ? "turn-clock-urgent" : ""}`} role="timer"><strong>{Math.floor(gameSecondsRemaining / 60)}:{String(gameSecondsRemaining % 60).padStart(2, "0")}</strong><span>game time</span></div>}
          </div>

          {game.seasonEvent && <div className="season-event" role="status"><small>ROUND {game.roundNumber} · SPECIAL SEASON</small><strong>{game.seasonEvent.title}</strong><span>{game.seasonEvent.description}</span></div>}
          {error && <p className="game-error" role="alert">{error}</p>}
          <div className="board-tools">
            <span aria-live="polite">Your piece: <strong>{followedPositionLabel}</strong></span>
            <button aria-pressed={followPlayerPiece} onClick={() => setFollowPlayerPiece((following) => !following)}>
              {followPlayerPiece ? "Pause following" : "Follow my piece"}
            </button>
          </div>
          <div className="board-wrap">
            <div className="board-grid">
              <div className="board-center">
                <p className="board-ornament">✦ &nbsp; नमस्ते &nbsp; ✦</p>
                <p className="board-logo">MONOPOLY<br /><em>INDIA</em></p>
                <p className="board-subtitle">ROUND {game.roundNumber} · TURN {game.turnNumber}</p>
                <strong className={`center-turn ${isMyTurn ? "center-my-turn" : ""}`}>
                  {game.phase === "finished"
                    ? `${game.players.find((player) => player.id === game.winnerPlayerId)?.name ?? "Nobody"} wins`
                    : isMyTurn ? "YOUR MOVE" : `${currentPlayer?.name ?? "Player"}'s turn`}
                </strong>
                <div className="center-dice">{game.dice ? `${game.dice[0]} + ${game.dice[1]}` : "⚄  ⚄"}</div>
                <p className="center-caption">
                  {secondsRemaining !== null
                    ? `${secondsRemaining}s to ${game.phase === "rolling" ? "roll" : "act"}`
                    : game.canRollAgain && isMyTurn ? "DOUBLES! ROLL AGAIN" : "THE CITY IS YOURS"}
                </p>
              </div>
              {game.board.map((space, index) => {
                const property = getPropertyForSpace(game, space.propertyId);
                const owner = property?.ownerId ? game.players.find((player) => player.id === property.ownerId) : undefined;
                const occupants = game.players.filter((player) =>
                  !player.bankrupt && (visualPositions[player.id] ?? player.position) === index,
                );
                const position = spacePosition(index);
                return (
                  <div
                    className={`board-space space-${space.type} space-${index < 10 ? "bottom" : index < 20 ? "left" : index < 30 ? "top" : "right"} ${index % 10 === 0 ? "board-corner" : ""} ${property ? "property-space" : ""} ${property?.mortgaged ? "is-mortgaged" : ""} ${occupants.some((player) => player.id === playerId) ? "has-my-piece" : ""}`}
                    key={space.id}
                    ref={(element) => { boardSpaceRefs.current[index] = element; }}
                    onClick={property ? () => setSelectedPropertyId(property.id) : undefined}
                    onKeyDown={property ? (event) => { if (event.key === "Enter" || event.key === " ") setSelectedPropertyId(property.id); } : undefined}
                    role={property ? "button" : undefined}
                    tabIndex={property ? 0 : undefined}
                    style={{ gridColumn: position.gridColumn, gridRow: position.gridRow }}
                    title={property ? `${property.name} · ${formatMoney(property.price)} · Rent ${formatMoney(property.rent[0])}` : space.label}
                  >
                    {property && <span className={`space-color color-${property.group}`} />}
                    <span className="space-label">{property?.name ?? space.label}</span>
                    {property && <span className="space-price">{formatMoney(property.price)}</span>}
                    {owner && <span aria-label={`Owned by ${owner.name} (${owner.token})`} className="owner-mark" title={`${owner.name} · ${owner.token}`} style={{ background: playerColor(game.players.indexOf(owner)) }}>{owner.token}</span>}
                    {property?.mortgaged && <span className="mortgage-mark" aria-label="Mortgaged to the bank">BANK</span>}
                    {property && property.houses > 0 && <span className="house-mark">{property.houses === 5 ? "🏨" : "🏠".repeat(Math.min(property.houses, 4))}</span>}
                    {occupants.length > 0 && (
                      <span className="space-tokens">
                        {occupants.map((player) => (
                          <i
                            aria-label={`${player.name}${player.id === playerId ? ", your piece" : ""}${player.id === currentPlayer?.id ? ", current turn" : ""}`}
                            className={`${player.id === playerId ? "is-your-piece" : ""} ${player.id === currentPlayer?.id ? "is-active-piece" : ""}`}
                            key={`${player.id}-${visualPositions[player.id] ?? player.position}`}
                            title={`${player.name}${player.id === playerId ? " · your piece" : ""}`}
                          >
                            {player.token}
                          </i>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {drawnCard && (
              <div className="card-backdrop" onClick={() => setDrawnCard("")}>
                <section className="drawn-card" role="dialog" aria-modal="true" aria-label="Card drawn">
                  <button className="card-dismiss" aria-label="Dismiss card" onClick={() => setDrawnCard("")}>×</button>
                  <span className="card-sparkle">✦</span>
                  <small>MONOPOLY INDIA · CARD DRAWN</small>
                  <p>{drawnCard}</p>
                </section>
              </div>
            )}
          </div>
          {selectedProperty && (
            <div className="card-backdrop property-detail-backdrop" onClick={() => setSelectedPropertyId(null)}>
              <section className="property-detail-card" role="dialog" aria-modal="true" aria-label={`${selectedProperty.name} property details`} onClick={(event) => event.stopPropagation()}>
                <button className="card-dismiss" aria-label="Close property details" onClick={() => setSelectedPropertyId(null)}>×</button>
                <span className={`property-detail-band color-${selectedProperty.group}`} />
                <small>PROPERTY DETAILS · {selectedProperty.group.replace(/([A-Z])/g, " $1").toUpperCase()}</small>
                <h2>{selectedProperty.name}</h2>
                {selectedProperty.mortgaged && <p className="mortgage-status-card"><span aria-hidden="true">🏦</span> MORTGAGED TO THE BANK · No rent collected</p>}
                {selectedOwner ? <p className="property-owner-name"><i style={{ background: playerColor(game.players.indexOf(selectedOwner)) }} />Owned by {selectedOwner.name}</p> : <p className="property-owner-name">Unowned · available for purchase when a player lands here</p>}
                <div className="property-detail-grid">
                  <p><span>Purchase price</span><strong>{formatMoney(selectedProperty.price)}</strong></p>
                  <p><span>Mortgage value</span><strong>{formatMoney(Math.floor(selectedProperty.price / 2))}</strong></p>
                  <p><span>Unmortgage cost</span><strong>{formatMoney(Math.ceil(selectedProperty.price * 0.55))}</strong></p>
                  <p><span>House / hotel cost</span><strong>{selectedProperty.houseCost ? formatMoney(selectedProperty.houseCost * (game.seasonEvent?.id === "construction-boom" ? 2 : 1)) : "Not available"}</strong></p>
                  <p><span>Current status</span><strong>{selectedProperty.mortgaged ? "Mortgaged" : selectedOwner ? "Owned" : "Available"}</strong></p>
                  <p><span>Buildings</span><strong>{selectedProperty.houses === 5 ? "Hotel" : selectedProperty.houses > 0 ? `${selectedProperty.houses} houses` : "None"}</strong></p>
                </div>
                <div className="property-rent-list"><strong>{selectedProperty.group === "utility" ? "Utility rent" : "Rent by buildings"}</strong>{selectedProperty.group === "utility" ? <>
                  {[4, 10].map((multiplier) => <p className={selectedUtilityCount === (multiplier === 4 ? 1 : 2) ? "current-rent" : ""} key={multiplier}><span>{multiplier === 4 ? "One utility" : "Both utilities"}</span><b>Dice ×{multiplier}</b></p>)}
                  {selectedOwner && game.dice && <p className="utility-rent-total"><span>Last-roll rent{selectedProperty.mortgaged ? " (mortgaged)" : ""}</span><b>{selectedProperty.mortgaged ? "No rent" : formatMoney(Math.ceil((game.dice[0] + game.dice[1]) * (selectedUtilityCount === 2 ? 10 : 4) * game.rules.rentMultiplier * selectedRentRelief))}</b></p>}
                </> : selectedProperty.rent.map((rent, index) => <p key={index}><span>{index === 0 ? "No buildings" : index === 5 ? "Hotel" : index + " houses"}</span><b>{formatMoney(Math.ceil(rent * game.rules.rentMultiplier * (game.seasonEvent?.id === "railway-rush" && selectedProperty.group === "railroad" ? 2 : 1) * selectedRentRelief))}</b></p>)}</div>
                {selectedOwner?.id === playerId && <div className="property-controls property-detail-controls">
                  {selectedProperty.mortgaged ? <button disabled={!selectedCanManage || game.phase === "debt" || (me?.cash ?? 0) < Math.ceil(selectedProperty.price * 0.55)} onClick={() => onAction({ action: "unmortgage", propertyId: selectedProperty.id })}>Unmortgage · {formatMoney(Math.ceil(selectedProperty.price * 0.55))}</button> : <button disabled={!selectedCanManage || selectedGroupHasBuildings} onClick={() => onAction({ action: "mortgage", propertyId: selectedProperty.id })}>Mortgage · {formatMoney(Math.floor(selectedProperty.price / 2))}</button>}
                  {selectedHasMonopoly && selectedProperty.houseCost && !selectedProperty.mortgaged && !selectedGroupHasMortgage && <>
                    <button disabled={!selectedCanManage || game.phase === "debt" || selectedProperty.houses !== selectedMinimumBuildings || selectedProperty.houses >= 5 || (me?.cash ?? 0) < selectedHouseCost} onClick={() => onAction({ action: "build", propertyId: selectedProperty.id })}>{selectedProperty.houses === 4 ? "Build hotel" : "+ House"} · {formatMoney(selectedHouseCost)}</button>
                    <button disabled={!selectedCanManage || selectedProperty.houses !== selectedMaximumBuildings || selectedProperty.houses === 0} onClick={() => onAction({ action: "sell-house", propertyId: selectedProperty.id })}>− Sell building · {formatMoney(Math.floor(selectedProperty.houseCost / 2))}</button>
                  </>}
                </div>}
                {selectedPendingPurchase && <div className="property-detail-actions">
                  <button className="action-button" disabled={(me?.cash ?? 0) < selectedProperty.price} onClick={() => onAction({ action: "buy" })}>Buy for {formatMoney(selectedProperty.price)}</button>
                  {game.rules.auctionsEnabled && <button className="action-button secondary-action" onClick={() => onAction({ action: "auction" })}>Start auction</button>}
                  <button className="action-button secondary-action" onClick={() => onAction({ action: "pass" })}>Pass</button>
                </div>}
                {game.seasonEvent && <p className="property-season-note">{game.seasonEvent.description}</p>}
              </section>
            </div>
          )}
          <div className="player-strip">
            {game.players.map((player, index) => (
              <div className={`player-card ${player.id === currentPlayer?.id ? "is-current" : ""} ${player.bankrupt ? "is-bankrupt" : ""}`} key={player.id}>
                <span className="token-badge" style={{ background: playerColor(index) }}>{player.token}</span>
                <span className="player-card-info">
                  <strong>{player.name}{player.id === playerId ? " (you)" : ""}</strong>
                  <small>{player.bankrupt ? "Bankrupt" : player.isAiBot ? "Learning bot · strategic trader" : player.inJail ? "In Jail" : player.connected ? "In the game" : player.botControlled ? "Bot playing · reconnect anytime" : "Reconnecting…"}</small>
                </span>
                <b key={`cash-${player.id}-${player.cash}`} className="cash-counter">{formatMoney(player.cash)}</b>
              </div>
            ))}
          </div>
        </section>

        <aside className="game-sidebar">
          <section className="action-panel">
            <p className="panel-kicker">YOUR MOVE</p>
            {game.phase === "finished" ? (
              <div className="action-message">{game.endReason === "time-limit" ? "Time is up! The champion is ranked by cash, then properties." : "The game is over. Thanks for playing!"}</div>
            ) : owedByMe ? (
              <>
                <div className="action-message debt-message">
                  <strong>{formatMoney(game.debt?.amount ?? 0)} due</strong>
                  <span>{game.debt?.reason}. Mortgage properties or sell buildings to raise cash.</span>
                </div>
                <button className="action-button danger-button" onClick={() => onAction({ action: "declare-bankrupt" })}>
                  Declare bankruptcy
                </button>
              </>
            ) : game.phase === "debt" ? (
              <div className="action-message">{debtPlayer?.name} needs to raise cash to pay a debt.</div>
            ) : game.phase === "auction" && game.auction ? (
              game.auction.turnPlayerId === playerId ? (
                <>
                  <div className="action-message">
                    <strong>{propertyName(game, game.auction.propertyId)} auction</strong>
                    <span>{game.auction.highestBidderId ? `Current bid: ${formatMoney(game.auction.highestBid)}` : `No bids yet — opening bid ${formatMoney(game.auction.minimumBid)}.`}</span>
                  </div>
                  <label className="auction-label" htmlFor="auction-bid">Your bid (₹)</label>
                  <input
                    id="auction-bid"
                    min={Math.max(game.auction.highestBid + 1, game.auction.minimumBid)}
                    onChange={(event) => setAuctionBid(event.target.value)}
                    type="number"
                    value={auctionBid}
                  />
                  <button
                    className="action-button"
                    disabled={!Number.isSafeInteger(Number(auctionBid)) || Number(auctionBid) < Math.max(game.auction.highestBid + 1, game.auction.minimumBid) || Number(auctionBid) > (me?.cash ?? 0)}
                    onClick={() => onAction({ action: "auction-bid", amount: Number(auctionBid) })}
                  >
                    Bid {formatMoney(Number(auctionBid) || 0)}
                  </button>
                  <button className="action-button secondary-action" onClick={() => onAction({ action: "auction-pass" })}>Pass on auction</button>
                </>
              ) : (
                <div className="action-message">
                  <strong>{game.players.find((player) => player.id === game.auction?.turnPlayerId)?.name} is bidding</strong>
                  <span>{game.auction.highestBidderId ? `High bid: ${formatMoney(game.auction.highestBid)}` : `Opening at ${formatMoney(game.auction.minimumBid)}.`}</span>
                </div>
              )
            ) : !isMyTurn ? (
              <div className="action-message">Sit back, sip chai, and watch the move unfold.</div>
            ) : game.phase === "buying" && pendingProperty ? (
              <>
                <div className="action-message">
                  <strong>{pendingProperty.name}</strong>
                  <span>Available for {formatMoney(pendingProperty.price)} · Rent starts at {formatMoney(pendingProperty.rent[0])}</span>
                </div>
                <button className="action-button" disabled={(me?.cash ?? 0) < pendingProperty.price} onClick={() => onAction({ action: "buy" })}>
                  Buy for {formatMoney(pendingProperty.price)}
                </button>
                {game.rules.auctionsEnabled && <button className="action-button secondary-action" onClick={() => onAction({ action: "auction" })}>Start auction</button>}
                <button className="action-button secondary-action" onClick={() => onAction({ action: "pass" })}>Decline</button>
              </>
            ) : rollAvailable && me?.inJail ? (
              <>
                <div className="action-message"><strong>You're in Jail</strong><span>Roll doubles to get out, or pay ₹50.</span></div>
                <button className="action-button" onClick={() => onAction({ action: "jail-roll" })}>🎲 Roll for doubles</button>
                <button className="action-button secondary-action" disabled={me.cash < 50} onClick={() => onAction({ action: "jail-pay" })}>Pay ₹50 & roll</button>
              </>
            ) : rollAvailable ? (
              <>
                <div className="action-message">
                  <strong>{game.canRollAgain ? "Doubles! Roll again." : "Ready to roll?"}</strong>
                  <span>{game.canRollAgain ? "Lucky you — take another turn." : "Roll the dice and see where Mumbai takes you."}</span>
                </div>
                <button className="action-button roll-button" onClick={() => onAction({ action: "roll" })}>🎲 Roll the dice</button>
              </>
            ) : mayEndTurn ? (
              <>
                <div className="action-message"><strong>Move complete</strong><span>{game.canRollAgain ? "Roll doubles to keep your turn." : "Pass the dice to the next player."}</span></div>
                <button className="action-button" onClick={() => onAction({ action: "end-turn" })}>End turn →</button>
              </>
            ) : (
              <div className="action-message">Finish resolving your move.</div>
            )}
            {me?.inJail && !isMyTurn && <p className="jail-note">You're in Jail until your next turn.</p>}
          </section>

          <div className="game-tools-drawer">
          <section className="players-panel">
            <div className="panel-heading"><h3>Players & cash</h3><span>{game.players.filter((player) => !player.bankrupt).length} in play</span></div>
            {room.voteKick && (
              <div className="vote-kick-card" role="status" aria-live="polite">
                <strong>Vote to remove {room.voteKick.targetName}</strong>
                <p>{room.voteKick.yesVotes}/{room.voteKick.requiredVotes} approvals · {room.voteKick.yesVotes + room.voteKick.noVotes}/{room.voteKick.voterIds.length} votes cast</p>
                <small>Two-thirds approval required. The targeted player cannot vote.</small>
                {room.voteKick.voterIds.includes(playerId) && !(playerId in room.voteKick.votes) ? (
                  <div className="vote-actions">
                    <button onClick={() => onCastVote(true)}>Vote to remove</button>
                    <button onClick={() => onCastVote(false)}>Keep player</button>
                  </div>
                ) : (
                  <small>
                    {playerId === room.voteKick.targetPlayerId
                      ? "You are the target of this vote."
                      : playerId in room.voteKick.votes
                        ? `Your vote: ${room.voteKick.votes[playerId] ? "remove" : "keep"}.`
                        : "You are not eligible to vote in this poll."}
                  </small>
                )}
              </div>
            )}
            {room.voteKickMessage && <p className="vote-kick-result" role="status">{room.voteKickMessage}</p>}
            {error && <p className="vote-kick-result" role="alert">{error}</p>}
            <div className="players-list">
              {game.players.map((player, index) => (
                <div className={`player-row ${player.id === currentPlayer?.id ? "active-player" : ""}`} key={player.id}>
                  <span className="token-badge small-token" style={{ background: playerColor(index) }}>{player.token}</span>
                  <div className="player-row-name"><strong>{player.name}{player.id === playerId ? " (you)" : ""}</strong><small>{player.bankrupt ? "Bankrupt" : `${player.propertyIds.length} properties`}</small></div>
                  <b>{formatMoney(player.cash)}</b>
                  {!room.voteKick && game.phase !== "finished" && !player.bankrupt && !player.isAiBot && player.id !== playerId && (
                    <button
                      aria-label={`Start a vote to remove ${player.name}`}
                      className="vote-start-button"
                      disabled={!player.connected || game.players.filter((candidate) =>
                        candidate.id !== player.id && !candidate.bankrupt && candidate.connected && !candidate.isAiBot,
                      ).length < 3}
                      onClick={() => onVoteKick(player.id)}
                      title="At least three other connected players must be able to vote"
                    >
                      Vote
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {game.phase === "finished" && (
            <section className="recap-panel" aria-labelledby="recap-heading">
              <div className="panel-heading"><h3 id="recap-heading">Match highlights</h3><span>FINAL STATS</span></div>
              <div className="recap-winner">
                <span aria-hidden="true">🏆</span>
                <div><small>{game.endReason === "time-limit" ? "TIME-LIMIT CHAMPION" : "CHAMPION"}</small><strong>{game.players.find((player) => player.id === game.winnerPlayerId)?.name ?? "No winner"}</strong></div>
              </div>
              <div className="recap-awards">
                <p><span>💰 Cash leader</span><strong>{getLeaders(game.players, (player) => player.cash)}</strong></p>
                <p><span>🏙️ Property collector</span><strong>{getLeaders(game.players, (player) => player.propertyIds.length)}</strong></p>
                <p><span>🏗️ Skyline builder</span><strong>{getLeaders(game.players, (player) => Object.values(game.properties).filter((property) => property.ownerId === player.id).reduce((total, property) => total + property.houses, 0))}</strong></p>
              </div>
              <button className="action-button recap-copy" onClick={() => void copyGameRecap()}>Copy match recap</button>
              {isHost && <button className="action-button rematch-button" onClick={onRematch}>Play another game with this table</button>}
              {recapStatus && <p className="recap-status" role="status">{recapStatus}</p>}
            </section>
          )}

          <section className="detail-panel">
            {showTradeDialog && (
              <div className="card-backdrop trade-backdrop" onClick={() => setShowTradeDialog(false)}>
                <section
                  aria-labelledby="trade-dialog-heading"
                  aria-modal="true"
                  className="trade-dialog"
                  onClick={(event) => event.stopPropagation()}
                  role="dialog"
                >
                  <button aria-label="Close trade proposal" className="card-dismiss" onClick={() => setShowTradeDialog(false)}>×</button>
                  <small>NEGOTIATE YOUR NEXT MOVE</small>
                  <h2 id="trade-dialog-heading">{counteringTradeId ? "Make a counteroffer" : "Propose a trade"}</h2>
                  <form onSubmit={submitTrade}>
                    <label htmlFor="trade-target">Trade with</label>
                    <select disabled={Boolean(counteringTradeId)} id="trade-target" value={tradeTarget} onChange={(event) => { setTradeTarget(event.target.value); setPropertiesTo([]); }}>
                      <option value="">Choose a player</option>
                      {game.players.filter((player) => player.id !== playerId && !player.bankrupt).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                    </select>
                    <div className="trade-cash-fields">
                      <label>Cash you offer (₹)<input min="0" max={me?.cash ?? 0} step="1" type="number" value={cashFrom} onChange={(event) => setCashFrom(event.target.value)} /></label>
                      <label>Cash you request (₹)<input min="0" max={game.players.find((player) => player.id === tradeTarget)?.cash ?? 0} step="1" type="number" value={cashTo} onChange={(event) => setCashTo(event.target.value)} /></label>
                    </div>
                    <div className="trade-property-columns">
                      <div>
                        <label htmlFor="trade-search-from">Your properties to offer</label>
                        <input id="trade-search-from" className="trade-search" placeholder="Find a property" value={tradeSearchFrom} onChange={(event) => setTradeSearchFrom(event.target.value)} />
                        <div className="trade-property-options">
                          {me?.propertyIds.filter((id) => !game.properties[id]?.houses && !game.properties[id]?.mortgaged)
                            .filter((id) => propertyName(game, id).toLowerCase().includes(tradeSearchFrom.trim().toLowerCase()))
                            .map((id) => <label className="check-option" key={id}><input type="checkbox" checked={propertiesFrom.includes(id)} onChange={() => toggleSelection(propertiesFrom, setPropertiesFrom, id)} />{propertyName(game, id)}</label>)}
                          {!me?.propertyIds.some((id) => !game.properties[id]?.houses && !game.properties[id]?.mortgaged) && <small>No tradable properties to offer.</small>}
                        </div>
                      </div>
                      <div>
                        <label htmlFor="trade-search-to">Their properties to request</label>
                        <input id="trade-search-to" className="trade-search" placeholder="Find a property" value={tradeSearchTo} onChange={(event) => setTradeSearchTo(event.target.value)} />
                        <div className="trade-property-options">
                          {game.players.find((player) => player.id === tradeTarget)?.propertyIds.filter((id) => !game.properties[id]?.houses && !game.properties[id]?.mortgaged)
                            .filter((id) => propertyName(game, id).toLowerCase().includes(tradeSearchTo.trim().toLowerCase()))
                            .map((id) => <label className="check-option" key={id}><input type="checkbox" checked={propertiesTo.includes(id)} onChange={() => toggleSelection(propertiesTo, setPropertiesTo, id)} />{propertyName(game, id)}</label>)}
                          {tradeTarget && !game.players.find((player) => player.id === tradeTarget)?.propertyIds.some((id) => !game.properties[id]?.houses && !game.properties[id]?.mortgaged) && <small>They have no tradable properties.</small>}
                        </div>
                      </div>
                    </div>
                    {tradeError && <p className="error-message" role="alert">{tradeError}</p>}
                    <button
                      className="action-button compact-action"
                      disabled={!tradeTarget || game.phase === "finished" || !Number.isSafeInteger(Number(cashFrom)) || !Number.isSafeInteger(Number(cashTo)) || Number(cashFrom) > (me?.cash ?? 0) || Number(cashTo) > (game.players.find((player) => player.id === tradeTarget)?.cash ?? 0)}
                      type="submit"
                    >
                      {counteringTradeId ? "Send counteroffer" : "Send trade proposal"}
                    </button>
                  </form>
                </section>
              </div>
            )}
            <div className="detail-tabs">
              <button className={tab === "properties" ? "selected-tab" : ""} onClick={() => { setTab("properties"); setMobileView("players"); }}>Properties</button>
              <button className={tab === "trade" ? "selected-tab" : ""} onClick={() => { setTab("trade"); setMobileView("trade"); }}>Trade</button>
              <button className={tab === "chat" ? "selected-tab" : ""} onClick={() => { setTab("chat"); setMobileView("chat"); }}>Chat{game.chat.length > 0 ? ` (${game.chat.length})` : ""}</button>
            </div>
            {tab === "properties" && (
              <div className="property-list">
                {!me?.propertyIds.length ? (
                  <p className="empty-note">No addresses yet. Roll the dice and claim your first property!</p>
                ) : me.propertyIds.map((id) => {
                  const property = game.properties[id];
                  if (!property) return null;
                  return (
                    <button
                      aria-label={`Show ${property.name} on the board${property.mortgaged ? ", mortgaged" : ""}`}
                      className={`owned-property ${property.mortgaged ? "mortgaged-property" : ""}`}
                      key={id}
                      onClick={() => showPropertyOnBoard(id)}
                      type="button"
                    >
                      <span className={`owned-color color-${property.group}`} />
                      <div className="owned-info">
                        <strong>{property.name}</strong>
                        <small>{property.mortgaged ? "Mortgaged" : property.houses === 5 ? "Hotel" : property.houses ? `${property.houses} house${property.houses > 1 ? "s" : ""}` : `Rent ${formatMoney(property.rent[0])}`}</small>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {tab === "trade" && (
              <div className="trade-panel">
                <button className="action-button compact-action" disabled={game.phase === "finished" || game.players.filter((player) => player.id !== playerId && !player.bankrupt).length === 0} onClick={() => { setTradeError(""); setShowTradeDialog(true); }}>Propose a trade</button>
                <div className="trade-offers">
                  <strong>Trade offers</strong>
                  {game.trades.slice(0, 10).map((trade) => {
                    const from = game.players.find((player) => player.id === trade.fromPlayerId);
                    const to = game.players.find((player) => player.id === trade.toPlayerId);
                    const incoming = trade.toPlayerId === playerId && trade.status === "pending";
                    const outgoing = trade.fromPlayerId === playerId && trade.status === "pending";
                    const statusLabel = trade.status === "pending"
                      ? `Pending · ${Math.max(0, Math.ceil((trade.expiresAt - now) / 1000))}s`
                      : trade.status === "countered" ? "Countered" : trade.status[0].toUpperCase() + trade.status.slice(1);
                    return (
                      <div className="trade-offer" key={trade.id}>
                        <span>{from?.name} → {to?.name}<small>{formatMoney(trade.cashFrom)} + {trade.propertiesFrom.length} propert{trade.propertiesFrom.length === 1 ? "y" : "ies"} ↔ {formatMoney(trade.cashTo)} + {trade.propertiesTo.length} propert{trade.propertiesTo.length === 1 ? "y" : "ies"}</small></span>
                        {incoming ? (
                          <span className="offer-actions">
                            <button onClick={() => onAction({ action: "trade-reply", tradeId: trade.id, accept: true })}>Accept</button>
                            <button onClick={() => onAction({ action: "trade-reply", tradeId: trade.id, accept: false })}>Reject</button>
                            <button onClick={() => openTradeComposer(trade)}>Counter</button>
                          </span>
                        ) : outgoing ? (
                          <span className="offer-actions"><small>{statusLabel}</small><button onClick={() => onAction({ action: "trade-cancel", tradeId: trade.id })}>Withdraw</button></span>
                        ) : <small>{statusLabel}</small>}
                      </div>
                    );
                  })}
                  {!game.trades.length && <p className="empty-note">No trade offers yet.</p>}
                </div>
              </div>
            )}
            {tab === "chat" && (
              <div className="chat-panel">
                <div className="chat-messages" ref={chatMessagesRef}>
                  {game.chat.map((message) => (
                    <div className={`chat-message ${message.playerId === playerId ? "my-message" : ""} ${["🎉", "😂", "👀", "🏏", "☕"].includes(message.text) ? "chat-reaction" : ""}`} key={message.id}>
                      <strong>{message.playerName}</strong><p>{message.text}</p>
                    </div>
                  ))}
                  {!game.chat.length && <p className="empty-note">The chai is hot. Start the banter!</p>}
                  
                </div>
                <div className="quick-reactions" aria-label="Quick reactions">
                  {[
                    ["🎉", "Celebrate"],
                    ["😂", "Laugh"],
                    ["👀", "Surprised"],
                    ["🏏", "Cricket"],
                    ["☕", "Chai break"],
                  ].map(([emoji, label]) => (
                    <button key={emoji} aria-label={label} title={label} onClick={() => onAction({ action: "chat", text: emoji })}>{emoji}</button>
                  ))}
                </div>
                <form className="chat-form" onSubmit={submitChat}>
                  <input maxLength={240} placeholder="Say something…" value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} />
                  <button aria-label="Send chat message" disabled={!chatDraft.trim()} type="submit">➤</button>
                </form>
              </div>
            )}
          </section>

          <section className="log-panel">
            <div className="panel-heading"><h3>Table talk</h3><span>LAST {game.log.length} EVENTS</span></div>
            <div aria-label="Filter table events" className="log-filters">
              {([
                ["all", "All"],
                ["deals", "Deals"],
                ["property", "Properties"],
                ["money", "Money"],
                ["events", "Events"],
              ] as const).map(([filter, label]) => (
                <button
                  aria-pressed={logFilter === filter}
                  className={logFilter === filter ? "selected-log-filter" : ""}
                  key={filter}
                  onClick={() => setLogFilter(filter)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="log-list">
              {game.log
                .filter((entry) => logFilter === "all" || getLogCategory(entry.text) === logFilter)
                .map((entry) => (
                  <p className={`log-entry log-${getLogCategory(entry.text)}`} key={entry.id}>
                    <small>{getLogCategory(entry.text)}</small>
                    <span>{entry.text}</span>
                  </p>
                ))}
              {!game.log.some((entry) => logFilter === "all" || getLogCategory(entry.text) === logFilter) && <p className="empty-note">No {logFilter} events yet.</p>}
            </div>
          </section>
          </div>
        </aside>
      </div>
    </main>
  );
}

function playerColor(index: number) {
  return ["#c96f40", "#56886d", "#647bb2", "#d2a437", "#bc5b53", "#8064a6", "#248f8a", "#b34a75", "#8b6b35", "#5e718c"][Math.max(index, 0) % 10];
}
