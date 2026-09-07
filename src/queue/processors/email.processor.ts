import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

import { EmailService } from 'src/integrations/email/email.service';

import {
  EMAIL_VERIFICATION_JOB,
  EmailVerificationJobData,
} from '../jobs/email-verification.job';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<EmailVerificationJobData>): Promise<void> {
    if (job.name !== EMAIL_VERIFICATION_JOB) {
      this.logger.warn(`Unknown email job: ${job.name}`);

      return;
    }

    const { email, name, verificationUrl } = job.data;

    this.logger.log(`Processing email verification job ${job.id} for ${email}`);

    await this.emailService.sendEmailVerification(email, name, verificationUrl);

    this.logger.log(`Verification email sent successfully to ${email}`);
  }
}
