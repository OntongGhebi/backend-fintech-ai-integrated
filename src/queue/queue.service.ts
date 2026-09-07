import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  EMAIL_VERIFICATION_JOB,
  EmailVerificationJobData,
} from './jobs/email-verification.job';

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue('system') private readonly systemQueue: Queue,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {}

  async addTestJob(payload: { message: string }) {
    return this.systemQueue.add('test', payload);
  }

  async addEmailVerificationJob(data: EmailVerificationJobData): Promise<void> {
    await this.emailQueue.add(EMAIL_VERIFICATION_JOB, data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  }
}
