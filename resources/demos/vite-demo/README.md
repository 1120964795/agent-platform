# Vite Demo

This demo is built for the V4 Node/Vite acceptance path.

## Start

```powershell
npm install
npm run dev
```

The dev script uses `--strictPort` so a real port conflict produces `EADDRINUSE` instead of silently switching ports.

## Expected Diagnostics

- `package.json` cites `src/main.jsx` as the entry file.
- `npm run dev` starts Vite on port `5173`.
- Starting another server on `5173` first should trigger the port-conflict branch.
