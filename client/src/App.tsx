import { useEffect, useRef, useState, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";
import type { GameAction, GameState, PublicRoom, Property, RoomResponse } from "./gameTypes";

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
  "room:settings": (
    payload: { ruleSet: PublicRoom["ruleSet"]; startingCash: number; auctionsEnabled: boolean; seasonsEnabled: boolean },
    acknowledge: (response: { ok: boolean; error?: string }) => void,
  ) => void;
  "room:kick": (
    payload: { targetPlayerId: string },
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
      setError("The host removed you from this room.");
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
    startingCash: number,
    auctionsEnabled: boolean,
    seasonsEnabled: boolean,
  ) {
    setError("");
    socket.emit("room:settings", { ruleSet, startingCash, auctionsEnabled, seasonsEnabled }, (response) => {
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
    updateRoomRules(room.ruleSet, amount, room.rules.auctionsEnabled, room.rules.seasonsEnabled);
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
        onAction={(action) => {
          setError("");
          socket.emit("game:action", action, (response) => {
            if (!response.ok) setError(response.error ?? "That move could not be completed.");
          });
        }}
        onLeave={leaveRoom}
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
              <p className="player-count">{room.players.length} / {room.maxPlayers} players</p>
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
                        updateRoomRules(value, presetCash, room.rules.auctionsEnabled, room.rules.seasonsEnabled);
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
                      onChange={(event) => updateRoomRules(
                        room.ruleSet,
                        room.rules.startingCash,
                        event.currentTarget.checked,
                        room.rules.seasonsEnabled,
                      )}
                      type="checkbox"
                    />
                    Enable property auctions when declined
                  </label>
                  <label className="auction-setting" htmlFor="seasons-enabled">
                    <input
                      checked={room.rules.seasonsEnabled}
                      id="seasons-enabled"
                      onChange={(event) => updateRoomRules(
                        room.ruleSet,
                        room.rules.startingCash,
                        room.rules.auctionsEnabled,
                        event.currentTarget.checked,
                      )}
                      type="checkbox"
                    />
                    Enable random season events
                  </label>
                  <button className="primary-button" disabled={room.players.length < 2} onClick={startGame}>
                    {room.players.length < 2 ? "Waiting for one more player" : "Start the game"} <span>→</span>
                  </button>
                </>
              ) : (
                <p className="lobby-hint">
                  Game style: <strong>{room.ruleSet === "classic" ? "Classic" : room.ruleSet === "quick" ? "Quick" : "Chaos"}</strong>
                  {" "}· {formatMoney(room.rules.startingCash)} starting cash
                  {" "}· auctions {room.rules.auctionsEnabled ? "on" : "off"}
                  {" "}· seasons {room.rules.seasonsEnabled ? "on" : "off"}.
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
  onAction,
  onLeave,
  playerId,
  error,
}: {
  connected: boolean;
  game: GameState;
  onAction: (action: GameAction) => void;
  onLeave: () => void;
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
  const [tab, setTab] = useState<"properties" | "trade" | "chat">("properties");
  const [drawnCard, setDrawnCard] = useState("");
  const [recapStatus, setRecapStatus] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const boardSpaceRefs = useRef<Array<HTMLDivElement | null>>([]);
  const hasFocusedPlayerSpace = useRef(false);
  const previousPositions = useRef<Record<string, number>>({});
  const movementTimers = useRef<number[]>([]);
  const [visualPositions, setVisualPositions] = useState<Record<string, number>>({});
  const latestLogId = game.log[0]?.id;
  const selectedProperty = selectedPropertyId ? game.properties[selectedPropertyId] ?? null : null;
  const selectedOwner = selectedProperty?.ownerId ? game.players.find((player) => player.id === selectedProperty.ownerId) : null;
  const secondsRemaining = game.deadlineAt ? Math.max(0, Math.ceil((game.deadlineAt - now) / 1000)) : null;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (hasFocusedPlayerSpace.current) return;
    const player = game.players.find((entry) => entry.id === playerId);
    const boardSpace = player ? boardSpaceRefs.current[player.position] : null;
    if (!boardSpace) return;
    hasFocusedPlayerSpace.current = true;
    window.requestAnimationFrame(() => boardSpace.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }));
  }, [game.players, playerId]);

  useEffect(() => {
    if (tab !== "chat") return;
    const chatMessages = chatMessagesRef.current;
    chatMessages?.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
  }, [game.chat.length, tab]);

  useEffect(() => {
    const latestLog = game.log[0];
    const cardText = latestLog?.text.match(/ draws: (.+)$/)?.[1];
    if (!cardText) return;
    setDrawnCard(cardText);
    const timeout = window.setTimeout(() => setDrawnCard(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [latestLogId]);

  useEffect(() => {
    setAuctionBid(String((game.auction?.highestBid ?? 0) + 1));
  }, [game.auction?.highestBid]);

  useEffect(() => {
    const currentPositions: Record<string, number> = {};
    const movedPlayers = game.players.filter((player) =>
      previousPositions.current[player.id] !== undefined &&
      previousPositions.current[player.id] !== player.position,
    );

    for (const player of game.players) currentPositions[player.id] = player.position;
    if (movedPlayers.length === 0) {
      previousPositions.current = currentPositions;
      return;
    }

    movementTimers.current.forEach(window.clearTimeout);
    movementTimers.current = [];
    setVisualPositions({});

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
  }, [game.players]);

  useEffect(() => () => movementTimers.current.forEach(window.clearTimeout), []);

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
    const winner = game.players.find((player) => !player.bankrupt);
    const recap = [
      `Monopoly India · Room ${game.roomCode}`,
      `Winner: ${winner?.name ?? "Nobody"}`,
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
    if (!tradeTarget) return;
    onAction({
      action: "trade-offer",
      trade: {
        toPlayerId: tradeTarget,
        cashFrom: Number(cashFrom),
        cashTo: Number(cashTo),
        propertiesFrom,
        propertiesTo,
      },
    });
    setPropertiesFrom([]);
    setPropertiesTo([]);
    setCashFrom("0");
    setCashTo("0");
  }

  const rollAvailable = game.phase === "rolling" && isMyTurn && !game.debt;
  const mayEndTurn = game.phase === "end-turn" && isMyTurn;
  const owedByMe = game.phase === "debt" && debtPlayer?.id === playerId;

  return (
    <main className="table-page">
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
          </span>
          <span className={`connection ${connected ? "online" : ""}`}><i />{connected ? "Live game" : "Reconnecting…"}</span>
        </div>
        <a
          className="feedback-link table-feedback-link"
          href="mailto:yagaofficial02@gmail.com?subject=Monopoly%20India%20feedback"
        >
          Feedback
        </a>
        <button className="quiet-button" onClick={onLeave}>Leave table</button>
      </header>

      <div className="table-layout">
        <section className="board-column">
          <div className="turn-banner">
            <div>
              <span className="turn-kicker">{game.phase === "finished" ? "GAME OVER" : `ROUND ${game.roundNumber} · TURN ${game.turnNumber}`}</span>
              <strong>
                {game.phase === "finished" ? "🏆" : currentPlayer?.token}{" "}
                {game.phase === "finished"
                  ? `${game.players.find((player) => !player.bankrupt)?.name ?? "Nobody"} wins!`
                  : isMyTurn ? "Your turn" : `${currentPlayer?.name}'s turn`}
              </strong>
            </div>
            <div className="dice-result" aria-label="Last dice roll">
              {game.dice ? <><span key={`die-${game.log[0]?.id}-${game.dice[0]}`}>{game.dice[0]}</span><b>+</b><span key={`die-two-${game.log[0]?.id}-${game.dice[1]}`}>{game.dice[1]}</span></> : "⚄ ⚄"}
            </div>
            {secondsRemaining !== null && <div className={`turn-clock ${secondsRemaining <= 10 ? "turn-clock-urgent" : ""}`} role="timer"><strong>{secondsRemaining}s</strong><span>{game.phase === "rolling" ? "to roll" : "to act"}</span></div>}
          </div>

          {game.seasonEvent && <div className="season-event" role="status"><strong>{game.seasonEvent.title}</strong><span>{game.seasonEvent.description}</span></div>}
          {error && <p className="game-error" role="alert">{error}</p>}
          <div className="board-wrap">
            <div className="board-grid">
              <div className="board-center">
                <p className="board-ornament">✦ &nbsp; नमस्ते &nbsp; ✦</p>
                <p className="board-logo">MONOPOLY<br /><em>INDIA</em></p>
                <p className="board-subtitle">A little luck. A lot of chai.</p>
                <div className="center-dice">{game.dice ? `${game.dice[0]} + ${game.dice[1]}` : "⚄  ⚄"}</div>
                <p className="center-caption">{game.canRollAgain && isMyTurn ? "DOUBLES! ROLL AGAIN" : "THE CITY IS YOURS"}</p>
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
                    className={`board-space space-${space.type} space-${index < 10 ? "bottom" : index < 20 ? "left" : index < 30 ? "top" : "right"} ${index % 10 === 0 ? "board-corner" : ""} ${property ? "property-space" : ""}`}
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
                    {property && property.houses > 0 && <span className="house-mark">{property.houses === 5 ? "🏨" : "🏠".repeat(Math.min(property.houses, 4))}</span>}
                    {occupants.length > 0 && (
                      <span className="space-tokens">
                        {occupants.map((player) => <i key={`${player.id}-${visualPositions[player.id] ?? player.position}`} title={player.name}>{player.token}</i>)}
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
                {selectedOwner && <p className="property-owner-name"><i style={{ background: playerColor(game.players.indexOf(selectedOwner)) }} />Owned by {selectedOwner.name}</p>}
                <div className="property-detail-grid">
                  <p><span>Purchase price</span><strong>{formatMoney(selectedProperty.price)}</strong></p>
                  <p><span>Mortgage value</span><strong>{formatMoney(Math.floor(selectedProperty.price / 2))}</strong></p>
                  <p><span>Unmortgage cost</span><strong>{formatMoney(Math.ceil(selectedProperty.price * 0.55))}</strong></p>
                  <p><span>House / hotel cost</span><strong>{selectedProperty.houseCost ? formatMoney(selectedProperty.houseCost * (game.seasonEvent?.id === "construction-boom" ? 2 : 1)) : "Not available"}</strong></p>
                  <p><span>Current status</span><strong>{selectedProperty.mortgaged ? "Mortgaged" : "Available"}</strong></p>
                  <p><span>Buildings</span><strong>{selectedProperty.houses === 5 ? "Hotel" : selectedProperty.houses > 0 ? `${selectedProperty.houses} houses` : "None"}</strong></p>
                </div>
                <div className="property-rent-list"><strong>Rent by buildings</strong>{selectedProperty.rent.map((rent, index) => <p key={index}><span>{index === 0 ? "No buildings" : index === 5 ? "Hotel" : `${index} house${index > 1 ? "s" : ""}`}</span><b>{formatMoney(Math.ceil(rent * game.rules.rentMultiplier * (game.seasonEvent?.id === "railway-rush" && selectedProperty.group === "railroad" ? 2 : 1) * (game.seasonEvent?.id === "rent-relief" ? 0.5 : 1)))}</b></p>)}</div>
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
                  <small>{player.bankrupt ? "Bankrupt" : player.inJail ? "In Jail" : player.connected ? "In the game" : player.botControlled ? "Bot playing · reconnect anytime" : "Reconnecting…"}</small>
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
              <div className="action-message">The game is over. Thanks for playing!</div>
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
                    <span>{game.auction.highestBidderId ? `Current bid: ${formatMoney(game.auction.highestBid)}` : "No bids yet — start at ₹1."}</span>
                  </div>
                  <label className="auction-label" htmlFor="auction-bid">Your bid (₹)</label>
                  <input
                    id="auction-bid"
                    min={game.auction.highestBid + 1}
                    onChange={(event) => setAuctionBid(event.target.value)}
                    type="number"
                    value={auctionBid}
                  />
                  <button
                    className="action-button"
                    disabled={!Number.isSafeInteger(Number(auctionBid)) || Number(auctionBid) <= game.auction.highestBid || Number(auctionBid) > (me?.cash ?? 0)}
                    onClick={() => onAction({ action: "auction-bid", amount: Number(auctionBid) })}
                  >
                    Bid {formatMoney(Number(auctionBid) || 0)}
                  </button>
                  <button className="action-button secondary-action" onClick={() => onAction({ action: "auction-pass" })}>Pass on auction</button>
                </>
              ) : (
                <div className="action-message">
                  <strong>{game.players.find((player) => player.id === game.auction?.turnPlayerId)?.name} is bidding</strong>
                  <span>{game.auction.highestBidderId ? `High bid: ${formatMoney(game.auction.highestBid)}` : "No bids yet."}</span>
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

          <section className="players-panel">
            <div className="panel-heading"><h3>Players & cash</h3><span>{game.players.filter((player) => !player.bankrupt).length} in play</span></div>
            <div className="players-list">
              {game.players.map((player, index) => (
                <div className={`player-row ${player.id === currentPlayer?.id ? "active-player" : ""}`} key={player.id}>
                  <span className="token-badge small-token" style={{ background: playerColor(index) }}>{player.token}</span>
                  <div className="player-row-name"><strong>{player.name}{player.id === playerId ? " (you)" : ""}</strong><small>{player.bankrupt ? "Bankrupt" : `${player.propertyIds.length} properties`}</small></div>
                  <b>{formatMoney(player.cash)}</b>
                </div>
              ))}
            </div>
          </section>

          {game.phase === "finished" && (
            <section className="recap-panel" aria-labelledby="recap-heading">
              <div className="panel-heading"><h3 id="recap-heading">Match highlights</h3><span>FINAL STATS</span></div>
              <div className="recap-winner">
                <span aria-hidden="true">🏆</span>
                <div><small>CHAMPION</small><strong>{game.players.find((player) => !player.bankrupt)?.name ?? "No winner"}</strong></div>
              </div>
              <div className="recap-awards">
                <p><span>💰 Cash leader</span><strong>{getLeaders(game.players, (player) => player.cash)}</strong></p>
                <p><span>🏙️ Property collector</span><strong>{getLeaders(game.players, (player) => player.propertyIds.length)}</strong></p>
                <p><span>🏗️ Skyline builder</span><strong>{getLeaders(game.players, (player) => Object.values(game.properties).filter((property) => property.ownerId === player.id).reduce((total, property) => total + property.houses, 0))}</strong></p>
              </div>
              <button className="action-button recap-copy" onClick={() => void copyGameRecap()}>Copy match recap</button>
              {recapStatus && <p className="recap-status" role="status">{recapStatus}</p>}
            </section>
          )}

          <section className="detail-panel">
            <div className="detail-tabs">
              <button className={tab === "properties" ? "selected-tab" : ""} onClick={() => setTab("properties")}>Properties</button>
              <button className={tab === "trade" ? "selected-tab" : ""} onClick={() => setTab("trade")}>Trade</button>
              <button className={tab === "chat" ? "selected-tab" : ""} onClick={() => setTab("chat")}>Chat{game.chat.length > 0 ? ` (${game.chat.length})` : ""}</button>
            </div>
            {tab === "properties" && (
              <div className="property-list">
                {!me?.propertyIds.length ? (
                  <p className="empty-note">No addresses yet. Roll the dice and claim your first property!</p>
                ) : me.propertyIds.map((id) => {
                  const property = game.properties[id];
                  if (!property) return null;
                  const colorSet = Object.values(game.properties).filter((item) => item.group === property.group);
                  const hasMonopoly = property.group !== "railroad" && property.group !== "utility" && colorSet.every((item) => item.ownerId === playerId);
                  const allowManage = owedByMe || (isMyTurn && ["rolling", "buying", "end-turn"].includes(game.phase));
                  return (
                    <div className="owned-property" key={id}>
                      <span className={`owned-color color-${property.group}`} />
                      <div className="owned-info">
                        <strong>{property.name}</strong>
                        <small>{property.mortgaged ? "Mortgaged" : property.houses === 5 ? "Hotel" : property.houses ? `${property.houses} house${property.houses > 1 ? "s" : ""}` : `Rent ${formatMoney(property.rent[0])}`}</small>
                      </div>
                      <div className="property-controls">
                        {property.mortgaged ? (
                          <button disabled={!allowManage || game.phase === "debt" || (me.cash < Math.ceil(property.price * 0.55))} onClick={() => onAction({ action: "unmortgage", propertyId: id })}>Unmortgage</button>
                        ) : (
                          <button disabled={!allowManage || property.houses > 0} onClick={() => onAction({ action: "mortgage", propertyId: id })}>Mortgage</button>
                        )}
                        {hasMonopoly && property.houseCost && !property.mortgaged && (
                          <>
                            <button disabled={!allowManage || game.phase === "debt" || property.houses >= 5 || me.cash < property.houseCost} onClick={() => onAction({ action: "build", propertyId: id })}>{property.houses === 4 ? "Build hotel" : "+ House"}</button>
                            <button disabled={!allowManage || property.houses === 0} onClick={() => onAction({ action: "sell-house", propertyId: id })}>− House</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {tab === "trade" && (
              <div className="trade-panel">
                <form onSubmit={submitTrade}>
                  <label>Trade with</label>
                  <select value={tradeTarget} onChange={(event) => { setTradeTarget(event.target.value); setPropertiesTo([]); }}>
                    <option value="">Choose a player</option>
                    {game.players.filter((player) => player.id !== playerId && !player.bankrupt).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
                  </select>
                  <label>Cash you offer (₹)</label><input min="0" step="1" type="number" value={cashFrom} onChange={(event) => setCashFrom(event.target.value)} />
                  <label>Cash you request (₹)</label><input min="0" step="1" type="number" value={cashTo} onChange={(event) => setCashTo(event.target.value)} />
                  <label>Your properties to offer</label>
                  <div className="trade-property-options">
                    {me?.propertyIds.filter((id) => !game.properties[id]?.houses && !game.properties[id]?.mortgaged).map((id) => <label className="check-option" key={id}><input type="checkbox" checked={propertiesFrom.includes(id)} onChange={() => toggleSelection(propertiesFrom, setPropertiesFrom, id)} />{propertyName(game, id)}</label>)}
                    {!me?.propertyIds.some((id) => !game.properties[id]?.houses && !game.properties[id]?.mortgaged) && <small>No tradable properties to offer.</small>}
                  </div>
                  <label>Their properties to request</label>
                  <div className="trade-property-options">
                    {game.players.find((player) => player.id === tradeTarget)?.propertyIds.filter((id) => !game.properties[id]?.houses && !game.properties[id]?.mortgaged).map((id) => <label className="check-option" key={id}><input type="checkbox" checked={propertiesTo.includes(id)} onChange={() => toggleSelection(propertiesTo, setPropertiesTo, id)} />{propertyName(game, id)}</label>)}
                    {tradeTarget && !game.players.find((player) => player.id === tradeTarget)?.propertyIds.some((id) => !game.properties[id]?.houses && !game.properties[id]?.mortgaged) && <small>They have no tradable properties.</small>}
                  </div>
                  <button className="action-button compact-action" disabled={!tradeTarget || game.phase === "finished" || Number(cashFrom) > (me?.cash ?? 0)} type="submit">Propose trade</button>
                </form>
                <div className="trade-offers">
                  <strong>Trade offers</strong>
                  {game.trades.slice(0, 5).map((trade) => {
                    const from = game.players.find((player) => player.id === trade.fromPlayerId);
                    const to = game.players.find((player) => player.id === trade.toPlayerId);
                    const incoming = trade.toPlayerId === playerId && trade.status === "pending";
                    const outgoing = trade.fromPlayerId === playerId && trade.status === "pending";
                    return (
                      <div className="trade-offer" key={trade.id}>
                        <span>{from?.name} → {to?.name}<small>{formatMoney(trade.cashFrom)} + {trade.propertiesFrom.length} propert{trade.propertiesFrom.length === 1 ? "y" : "ies"} ↔ {formatMoney(trade.cashTo)} + {trade.propertiesTo.length} propert{trade.propertiesTo.length === 1 ? "y" : "ies"}</small></span>
                        {incoming ? <span className="offer-actions"><button onClick={() => onAction({ action: "trade-reply", tradeId: trade.id, accept: true })}>Accept</button><button onClick={() => onAction({ action: "trade-reply", tradeId: trade.id, accept: false })}>Reject</button></span> : <small>{outgoing ? "Pending" : trade.status}</small>}
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
            <div className="panel-heading"><h3>Table talk</h3><span>LIVE</span></div>
            <div className="log-list">
              {game.log.slice(0, 8).map((entry) => <p key={entry.id}>{entry.text}</p>)}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function playerColor(index: number) {
  return ["#c96f40", "#56886d", "#647bb2", "#d2a437", "#bc5b53", "#8064a6", "#248f8a", "#b34a75", "#8b6b35", "#5e718c"][Math.max(index, 0) % 10];
}
