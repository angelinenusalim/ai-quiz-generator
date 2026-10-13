import { loadEnvironment } from './environment.js';
import { createApp } from './app.js';

loadEnvironment();
const port = Number(process.env.PORT || 8080);
const server = createApp().listen(port, () => console.log(`Quiz API listening on port ${port}`));
server.requestTimeout = 190_000;
server.headersTimeout = 20_000;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
