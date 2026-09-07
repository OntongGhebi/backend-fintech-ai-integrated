export const EMAIL_VERIFICATION_JOB = 'email-verification';

export interface EmailVerificationJobData {
  email: string;
  name: string;
  verificationUrl: string;
}
