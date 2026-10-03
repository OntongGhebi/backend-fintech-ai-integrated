export const AI_USAGE_FEATURES = {
  CHAT: 'CHAT',
} as const;

export type AIUsageFeature =
  (typeof AI_USAGE_FEATURES)[keyof typeof AI_USAGE_FEATURES];
