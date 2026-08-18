import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createApp } from './server.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(JSON.stringify({ level: 'error', message: error.message }));
  process.exit(1);
}

const logger = createLogger(config.logLevel);
const server = createApp(config, logger);

server.listen(config.port, '0.0.0.0', () => {
  logger.info('Cinephage Stremio Gateway started', {
    port: config.port,
    cinephageUrl: config.cinephageUrl,
    publicUrl: config.publicUrl || 'request-derived',
    pathMappings: config.pathMappings.map(({ source, target }) => ({ source, target }))
  });
});

function shutdown(signal) {
  logger.info('Shutting down', { signal });
  server.close((error) => {
    if (error) {
      logger.error('Shutdown failed', { error: error.message });
      process.exit(1);
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
