# AI Quiz Generator client

See the repository [README](../README.md) for installation, environment configuration, uploads, deployment, and test commands.

Run `npm run dev` from this directory for the frontend, with the backend running on port 8080. The frontend is at `http://localhost:5173` and defaults to the original Railway backend. To use an explicitly local backend, run `VITE_API_BASE_URL=/ npm run dev`. Netlify builds use the same Railway default unless `VITE_API_BASE_URL` overrides it.

Commands: `npm test`, `npm run test:e2e`, `npm run lint`, and `npm run build`. Browser tests require `npx playwright install chromium` first.
