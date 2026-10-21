import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { PublicRoom, RoomResponse } from "./gameTypes";

interface ServerToClientEvents {
  "room:update": (room: PublicRoom) => void;
}

interface ClientToServerEvents {
  "room:create": (
    payload: { playerName: string },
    acknowledge: (response: RoomResponse) => void,
  ) => void;
  "room:join": (
    payload: { playerName: string; roomCode: string },
    acknowledge: (response: RoomResponse) => void,
  ) => void;
}

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_SOCKET_URL || undefined,
  {
    autoConnect: false,
  },
);

export default function App() {
  const [playerName, setPlayerName] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setError("");
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = () => setError("Could not connect to the game server. Please retry.");
    const onRoomUpdate = (nextRoom: PublicRoom) => setRoom(nextRoom);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("room:update", onRoomUpdate);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("room:update", onRoomUpdate);
      socket.disconnect();
    };
  }, []);

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

    const onResponse = (response: RoomResponse) => {
      if (response.ok) {
        setRoom(response.room);
      } else {
        setError(response.error);
      }
    };

    if (action === "create") {
      socket.emit("room:create", { playerName: name }, onResponse);
    } else {
      socket.emit("room:join", { playerName: name, roomCode: roomCodeInput }, onResponse);
    }
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
            <span>✦ 2–6 players</span>
            <span>⌁ Live multiplayer</span>
          </div>
        </div>

        <div className="join-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">THE TABLE IS WAITING</p>
              <h2>{room ? "You're in!" : "Join the game"}</h2>
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
                <button className="secondary-button" onClick={() => enterRoom("join")}>
                  Join
                </button>
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
                    <span className={`player-dot dot-${index % 6}`} />
                    {player.name}
                    {index === 0 && <small>HOST</small>}
                  </li>
                ))}
              </ul>
              <p className="lobby-hint">Waiting for friends to join… Game board coming soon.</p>
            </div>
          )}
        </div>
      </section>

      <footer>
        <span>GOOD TIMES. GREAT REAL ESTATE.</span>
        <span>MADE FOR YOUR CREW <b>✦</b></span>
      </footer>
    </main>
  );
}
