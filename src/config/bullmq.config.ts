import { registerAs } from '@nestjs/config';

export default registerAs('bullmq', () => ({
  prefix: process.env.BULLMQ_PREFIX ?? 'fintech-ai',
}));
