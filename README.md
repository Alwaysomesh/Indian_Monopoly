# Monopoly India

An Indian-themed, real-time Monopoly-style game for 2–6 players. The Node.js server is authoritative: browsers send actions over Socket.IO, and the server validates turns and broadcasts the resulting room/game state.

## Play online

Open [indian-monopoly.onrender.com](https://indian-monopoly.onrender.com), create a private room, share its code with friends, and start when at least two players have joined. Players can buy Indian city and landmark properties, pay rent and taxes, build houses and hotels, mortgage properties, go to jail, bid in property auctions, trade, and chat.

The Render free instance can sleep after inactivity, so its first request may take around 50 seconds. Room and game state is held in server memory and is lost when the service restarts. It is a casual game implementation, not an official Monopoly product; some edge rules differ from the physical board game.

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
