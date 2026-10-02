export type AIResolutionStatus =
  'RESOLVED' | 'NOT_REQUESTED' | 'UNRESOLVED' | 'AMBIGUOUS';

export interface AIResolvedAccount {
  id: string;
  name: string;
  type: string;
  currency: string;
}

export interface AIResolvedCategory {
  id: string;
  name: string;
  type: string;
}

export interface AIAccountResolution {
  status: AIResolutionStatus;
  hint: string | null;
  account: AIResolvedAccount | null;
  candidates: AIResolvedAccount[];
}

export interface AICategoryResolution {
  status: AIResolutionStatus;
  hint: string | null;
  category: AIResolvedCategory | null;
  candidates: AIResolvedCategory[];
}

export interface AITransactionResolutionResult {
  account: AIAccountResolution;
  destinationAccount: AIAccountResolution;
  category: AICategoryResolution;
  ready: boolean;
}
