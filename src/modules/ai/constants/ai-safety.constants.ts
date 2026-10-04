export const AI_MAX_USER_INPUT_LENGTH = 2000;

export const AI_MAX_SYSTEM_INSTRUCTION_LENGTH = 12000;

export const AI_SENSITIVE_INSTRUCTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /ignore\s+(all\s+)?prior\s+instructions?/i,
  /disregard\s+(all\s+)?previous\s+instructions?/i,
  /forget\s+(all\s+)?previous\s+instructions?/i,
  /reveal\s+(the\s+)?system\s+prompt/i,
  /show\s+(me\s+)?the\s+system\s+prompt/i,
  /print\s+(the\s+)?system\s+prompt/i,
  /tell\s+me\s+(the\s+)?system\s+instructions?/i,
  /reveal\s+(your\s+)?hidden\s+instructions?/i,
  /show\s+(your\s+)?hidden\s+instructions?/i,
  /developer\s+message/i,
  /developer\s+instructions?/i,
];
