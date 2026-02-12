/**
 * 日志工具
 * 使用 Winston 实现结构化日志
 */

import winston from 'winston';

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

// 开发环境格式
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// 创建日志实例
export const createLogger = (context: string) => {
  const isDev = process.env.NODE_ENV === 'development';
  
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { context },
    format: combine(
      timestamp(),
      errors({ stack: true }),
      isDev ? combine(colorize(), devFormat) : json()
    ),
    transports: [
      new winston.transports.Console(),
      // 可以添加文件传输
      // new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
      // new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
  });
};

// 默认日志实例
export const logger = createLogger('AgentFramework');
