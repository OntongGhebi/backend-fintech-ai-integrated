import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';

import { EmailProcessor } from './email.processor';
import { EmailService } from '@/integrations/email/email.service';
import {
  EMAIL_VERIFICATION_JOB,
  EmailVerificationJobData,
} from '../jobs/email-verification.job';

describe('EmailProcessor', () => {
  let processor: EmailProcessor;

  const emailServiceMock = {
    sendEmailVerification: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        {
          provide: EmailService,
          useValue: emailServiceMock,
        },
      ],
    }).compile();

    processor = module.get<EmailProcessor>(EmailProcessor);
  });

  it('should process an email verification job', async () => {
    emailServiceMock.sendEmailVerification.mockResolvedValue(undefined);

    const jobData: EmailVerificationJobData = {
      email: 'test@example.com',
      name: 'Test User',
      verificationUrl: 'http://localhost:5173/verify-email?token=test-token',
    };

    const job = {
      id: 'job-1',
      name: EMAIL_VERIFICATION_JOB,
      data: jobData,
    } as Job<EmailVerificationJobData>;

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(emailServiceMock.sendEmailVerification).toHaveBeenCalledTimes(1);

    expect(emailServiceMock.sendEmailVerification).toHaveBeenCalledWith(
      'test@example.com',
      'Test User',
      'http://localhost:5173/verify-email?token=test-token',
    );
  });

  it('should propagate email sending errors so BullMQ can retry the job', async () => {
    const emailError = new Error('Failed to send verification email');

    emailServiceMock.sendEmailVerification.mockRejectedValue(emailError);

    const jobData: EmailVerificationJobData = {
      email: 'test@example.com',
      name: 'Test User',
      verificationUrl: 'http://localhost:5173/verify-email?token=test-token',
    };

    const job = {
      id: 'job-2',
      name: EMAIL_VERIFICATION_JOB,
      data: jobData,
    } as Job<EmailVerificationJobData>;

    await expect(processor.process(job)).rejects.toThrow(
      'Failed to send verification email',
    );

    expect(emailServiceMock.sendEmailVerification).toHaveBeenCalledTimes(1);
  });

  it('should ignore unknown email jobs', async () => {
    const job = {
      id: 'job-3',
      name: 'unknown-email-job',
      data: {},
    } as Job;

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(emailServiceMock.sendEmailVerification).not.toHaveBeenCalled();
  });
});
