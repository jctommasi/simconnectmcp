type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private level: number;

  constructor(level: LogLevel = 'info') {
    this.level = LOG_LEVELS[level];
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LOG_LEVELS[level] < this.level) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    const formatted = args.length > 0
      ? `${prefix} ${message} ${args.map(a => JSON.stringify(a)).join(' ')}`
      : `${prefix} ${message}`;

    process.stderr.write(formatted + '\n');
  }
}
