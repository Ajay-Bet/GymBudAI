# GymBud frontend

React/Vite frontend. Use Node.js 22.12+ and npm; the installed Vite version also supports Node 20.19+ within the Node 20 release line. Dependencies resolve from the committed `package-lock.json` using `npm ci`.

## Run locally

From the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. The development server binds to `127.0.0.1` and uses a strict port: it exits if 5173 is occupied instead of silently choosing another port. Stop it with `Ctrl+C`.

## Verify React can reach FastAPI

1. Start FastAPI at `127.0.0.1:8080` in another terminal using [backend setup](../backend/README.md).
2. Open <http://127.0.0.1:5173/dev/health> and click **Check backend**.
3. Confirm the success state. The button sends `GET /api/health`; Vite forwards it to `http://127.0.0.1:8080/health`, and React validates the `{"status":"ok"}` response.

The request is same-origin from the browser's perspective, so this check needs no backend CORS setup. No frontend environment file or API key is needed. The health page is development-only, and this proxy is not a production deployment configuration. Existing `/users/login` and `/users/profile` calls remain unsupported until replacement APIs are implemented.

If the check fails, verify the direct health URL first, confirm both terminals are still running, and retry. If you change the backend port, update the proxy target in `vite.config.js` and restart Vite. If the frontend port is occupied, stop the conflicting process you own before restarting. Use `npm run dev` for this check, rather than the production preview command.

## Frontend checks

```sh
npm run lint
npm run build
```

These commands check source lint and production bundling. The browser check above separately verifies the live React-to-FastAPI integration.
