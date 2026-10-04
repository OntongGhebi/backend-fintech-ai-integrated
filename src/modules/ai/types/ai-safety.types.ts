export type AISafetyStatus = 'SAFE' | 'REJECTED';

export interface AISafetyValidationResult {
  status: AISafetyStatus;
  normalizedText?: string;
  reason?: string;
}
