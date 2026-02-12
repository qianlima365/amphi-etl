/**
 * 流式输出工具
 * 从原 etl-agent.ts 提取
 */

export interface OutputHandler {
  start(label?: string): void;
  write(chunk: string): void;
  end(): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * 控制台流式输出
 */
export class ConsoleOutput implements OutputHandler {
  start(label?: string): void {
    if (label) {
      process.stdout.write(`\n🤖 ${label}\n   `);
    } else {
      process.stdout.write('\n🤖 ');
    }
  }

  write(chunk: string): void {
    const lines = chunk.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) process.stdout.write('\n   ');
      process.stdout.write(line);
    });
  }

  end(): void {
    process.stdout.write('\n');
  }

  info(message: string): void {
    console.log(`\nℹ️  ${message}`);
  }

  warn(message: string): void {
    console.log(`\n⚠️  ${message}`);
  }

  error(message: string): void {
    console.log(`\n❌ ${message}`);
  }
}

/**
 * 静默输出（用于 API 模式）
 */
export class SilentOutput implements OutputHandler {
  private buffer: string[] = [];

  start(label?: string): void {
    if (label) this.buffer.push(label);
  }

  write(chunk: string): void {
    this.buffer.push(chunk);
  }

  end(): void {
    // do nothing
  }

  info(message: string): void {
    this.buffer.push(`[INFO] ${message}`);
  }

  warn(message: string): void {
    this.buffer.push(`[WARN] ${message}`);
  }

  error(message: string): void {
    this.buffer.push(`[ERROR] ${message}`);
  }

  getBuffer(): string {
    return this.buffer.join('');
  }

  clear(): void {
    this.buffer = [];
  }
}

/**
 * 回调式输出（用于自定义处理）
 */
export class CallbackOutput implements OutputHandler {
  constructor(
    private callbacks: {
      onStart?: (label?: string) => void;
      onWrite?: (chunk: string) => void;
      onEnd?: () => void;
      onInfo?: (message: string) => void;
      onWarn?: (message: string) => void;
      onError?: (message: string) => void;
    }
  ) {}

  start(label?: string): void {
    this.callbacks.onStart?.(label);
  }

  write(chunk: string): void {
    this.callbacks.onWrite?.(chunk);
  }

  end(): void {
    this.callbacks.onEnd?.();
  }

  info(message: string): void {
    this.callbacks.onInfo?.(message);
  }

  warn(message: string): void {
    this.callbacks.onWarn?.(message);
  }

  error(message: string): void {
    this.callbacks.onError?.(message);
  }
}
