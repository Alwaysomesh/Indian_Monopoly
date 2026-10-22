# Monopoly India

An Indian-themed, real-time Monopoly-style game for 2–10 players. The Node.js server is authoritative: browsers send actions over Socket.IO, and the server validates turns and broadcasts the resulting room/game state.

## Play online

Open [indian-monopoly.onrender.com](https://indian-monopoly.onrender.com), create a private room, share its code with friends, and start when at least two players have joined. Players can buy Indian city and landmark properties, pay rent and taxes, build houses and hotels, mortgage properties, go to jail, bid in property auctions, trade, and chat. In chat, quick reactions add lightweight banter; when a game ends, a match recap highlights the champion, cash leader, property collector, and skyline builder, with an option to copy the recap.

In the lobby, the host can remove players and choose a rules preset before starting:

- **Classic:** ₹1,500 starting cash, ₹200 for passing GO, standard rent.
- **Quick:** ₹1,200 starting cash, ₹300 for passing GO, double rent.
- **Chaos:** ₹1,000 starting cash, ₹400 for passing GO, triple rent.

The host can also customize starting cash from ₹500 to ₹5,000 and turn property auctions on or off before the game starts. If auctions are off, a declined property stays unowned.

The Render free instance can sleep after inactivity, so its first request may take around 50 seconds. Room and game state is held in server memory and is lost when the service restarts. It is a casual game implementation, not an official Monopoly product; some edge rules differ from the physical board game.

If a player disconnects during a game, their browser saves their player identity and room so it can automatically rejoin. Reconnecting within 90 seconds preserves their pending action; if they stay offline, the server passes their turn, passes their auction bid, declines a pending property purchase, or declares bankruptcy to clear an unresolved debt.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Vite serves the client on port 5173 and proxies Socket.IO to the Express server on port 3001. `npm run build` runs the game-engine tests before building the client.

## Deployment

The service can host the built client and Socket.IO server together. Set `CLIENT_ORIGIN` to the public site origin if hosting the client separately; use comma-separated origins for multiple clients. `PORT` is provided by the hosting platform. The `/health` endpoint returns the health-check response.

### Hosting the client separately

If you host the Vite client on a different service, set `VITE_SOCKET_URL` to the Socket.IO server's public URL when building the client, and set `CLIENT_ORIGIN` on the server to the client's exact public origin. For multiple allowed client origins, separate them with commas.

Game rooms currently live in server memory. They are lost when the server restarts, and this setup is intended for a single server instance.
