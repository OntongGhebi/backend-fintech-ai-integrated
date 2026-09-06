import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class QueueService {
  constructor(@InjectQueue('system') private readonly systemQueue: Queue) {}

  async addTestJob(payload: { message: string }) {
    return this.systemQueue.add('test', payload);
  }
}
