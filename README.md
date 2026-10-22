# Monopoly India

An Indian-themed, real-time Monopoly-style game for 2–10 players. The Node.js server is authoritative: browsers send actions over Socket.IO, and the server validates turns and broadcasts the resulting room/game state.

## Play online

Open [indian-monopoly.onrender.com](https://indian-monopoly.onrender.com), create a private room, share its code with friends, and start when at least two players have joined. Players can buy Indian city and landmark properties, pay rent and taxes, build houses and hotels, mortgage properties, go to jail, bid in property auctions, trade, and chat. In chat, quick reactions add lightweight banter; when a game ends, a match recap highlights the champion, cash leader, property collector, and skyline builder, with an option to copy the recap.

In the lobby, the host can remove players and choose a rules preset before starting:

- **Classic:** ₹1,500 starting cash, ₹200 for passing GO, standard rent.
- **Quick:** ₹1,200 starting cash, ₹300 for passing GO, double rent.
- **Chaos:** ₹1,000 starting cash, ₹400 for passing GO, triple rent.

The host can also customize starting cash from ₹500 to ₹5,000, turn property auctions on or off, and optionally enable random season events before the game starts. With seasons enabled, the first three full player rounds are regular; a random special season begins every fourth full round and lasts through that round. A special season cannot repeat on consecutive special-season rounds. Events can double railway rent, double building costs, halve property rent, or give every active player a festival bonus. If auctions are off, a declined property stays unowned.

Hosts can set a 30, 60, 90, or 120 minute match; at time-up, active players rank by cash first and property count second. Landing exactly on GO pays twice the selected GO salary in total, while passing GO still pays the normal salary. A separate setting can send cities returned by bankrupt players to bank auction. Sarkari Neelami can auction one unsold city at half price starting in round 4: every other round with fewer than eight players, or every round with eight or more. It defaults off below six total seats and on at six or more; the host can override that default.

The host can add up to nine learning bots to fill seats for solo practice. Bots manage purchases and auctions, offer fair property trades when useful, and evaluate incoming trades based on asset value and available cash. Human players can still join any open seats before the game starts.

Click a city, railway, or utility on the board to view its rent schedule, ownership, mortgage values, and building costs. From the same panel, buy an available property, start an auction, pass, or manage your own mortgages and buildings. Power Grid and Water Works charge rent at 4× the dice roll when the owner has one utility, or 10× when they own both; game rules and season effects also apply. The board initially scrolls to your token; scroll the shared game page to explore the board and controls. Each owned space displays its owner's colored player token. Trade cash accepts any nonnegative whole-rupee amount. The active player has 30 seconds to roll and 45 seconds for other decisions; an automatic action keeps play moving if a timer expires.

The Render free instance can sleep after inactivity, so its first request may take around 50 seconds. Room and game state is held in server memory and is lost when the service restarts. It is a casual game implementation, not an official Monopoly product; some edge rules differ from the physical board game.

If a player disconnects during a game, their browser saves their player identity and room so it can automatically rejoin. After 30 seconds offline, a bot temporarily takes over and makes conservative moves (including managing debt); the player can rejoin the same room at any time and resume control.

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
