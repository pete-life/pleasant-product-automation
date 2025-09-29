import pino from 'pino';
import { config } from './env';

const level = process.env.LOG_LEVEL ?? (config.nodeEnv === 'development' ? 'debug' : 'info');

export const logger = pino({
  level,
  base: { service: 'pleasant-product-automation' },
  timestamp: pino.stdTimeFunctions.isoTime
});

export type Logger = typeof logger;
