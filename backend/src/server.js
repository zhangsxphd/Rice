import { buildApp } from './app.js';
import { config } from './config/index.js';

const app = await buildApp({ serveFrontend: config.nodeEnv === 'production' });
try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
