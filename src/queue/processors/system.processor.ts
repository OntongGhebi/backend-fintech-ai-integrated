import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('system')
export class SystemProcessor extends WorkerHost {
  private readonly logger = new Logger(SystemProcessor.name);

  process(job: Job): Promise<void> {
    this.logger.log(`Processing job ${job.id} (${job.name})`);

    if (job.name === 'test') {
      this.logger.log(`Test job payload: ${JSON.stringify(job.data)}`);
    }

    return Promise.resolve();
  }
}
