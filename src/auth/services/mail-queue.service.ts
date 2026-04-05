import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TaskExecutor<T> = () => Promise<T>;

interface QueuedTask<T> {
  name: string;
  execute: TaskExecutor<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

@Injectable()
export class MailQueueService {
  private readonly maxConcurrent: number;
  private readonly queue: QueuedTask<unknown>[] = [];
  private activeCount = 0;

  constructor(private readonly configService: ConfigService) {
    const configured = Number(this.configService.get<string>('MAIL_QUEUE_CONCURRENCY') ?? 5);
    this.maxConcurrent = Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 5;
  }

  enqueue<T>(name: string, execute: TaskExecutor<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queuedTask: QueuedTask<T> = {
        name,
        execute,
        resolve,
        reject,
      };

      this.queue.push(queuedTask as QueuedTask<unknown>);
      this.processQueue();
    });
  }

  getStats() {
    return {
      active: this.activeCount,
      waiting: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }

  private processQueue(): void {
    while (this.activeCount < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) {
        return;
      }
      void this.runTask(task);
    }
  }

  private async runTask(task: QueuedTask<unknown>): Promise<void> {
    this.activeCount += 1;
    try {
      const result = await task.execute();
      task.resolve(result);
    } catch (error) {
      task.reject(error);
    } finally {
      this.activeCount -= 1;
      this.processQueue();
    }
  }
}