import fastify from 'fastify';
import registerRoutes from './routes';
import { config } from './env';
import { logger } from './logger';

const app = fastify({
  logger: {
    level: logger.level,
    base: { service: 'pleasant-product-automation' },
    timestamp: () => `,"time":"${new Date().toISOString()}"`
  }
});

app.register(registerRoutes);

export async function start() {
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info({ port: config.port }, 'Server started');
  } catch (error) {
    app.log.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

process.on('unhandledRejection', (error) => {
  logger.error({ error }, 'Unhandled rejection');
});

process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
});

if (require.main === module) {
  start();
}

export default app;
