# Monopoly India starter

This starter currently provides an online private-room lobby for up to six players. It does **not** yet implement the Monopoly board, game rules, chat, or trading.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Vite serves the client on port 5173 and proxies Socket.IO to the Express server on port 3001.

## Deploy one public service with Railway

The included `railway.json` builds the React client and runs the Express/Socket.IO server. The server serves the built client, so friends use one public URL for the webpage and real-time connections.

1. Push this project to a GitHub repository.
2. In Railway, create a project from that repository and deploy it using the included configuration.
3. In the service's **Settings → Networking**, generate a public domain.
4. Set the service variable `CLIENT_ORIGIN` to that exact origin, including `https://` and with no trailing slash (for example, `https://your-app.up.railway.app`). Redeploy if Railway does not do so automatically.
5. Open the public URL, create a room, and send the room code and URL to your friends.

Railway supplies the `PORT` environment variable. The `/health` endpoint is used for deployment health checks. No `VITE_SOCKET_URL` is needed for this single-service setup; the browser connects to Socket.IO on the same public origin.

### Hosting the client separately

If you host the Vite client on a different service, set `VITE_SOCKET_URL` to the Socket.IO server's public URL when building the client, and set `CLIENT_ORIGIN` on the server to the client's exact public origin. For multiple allowed client origins, separate them with commas.

Room and player data currently live in server memory. They are lost when the service restarts, and this in-memory setup is intended for a single server instance.
