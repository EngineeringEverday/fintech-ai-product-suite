export type Severity = 'High' | 'Med' | 'Low';

export interface PainPoint {
  id: string;
  quote: string;
  pain_point: string;
  severity: Severity;
  frequency_estimate: string;
  confidence_score: number;
}

export interface Theme {
  id: string;
  theme_name: string;
  summary: string;
  supporting_pain_points: string[];
  assumptions: string[];
  confidence_score: number;
}

export type CardStatus = 'pending' | 'accepted' | 'rejected' | 'edited';

export interface FeatureCard {
  id: string;
  feature_name: string;
  user_problem: string;
  proposed_solution: string;
  success_metric: string;
  priority_score: number;
  confidence_score: number;
  needs_human_review: boolean;
  // Local-only review state
  status: CardStatus;
}

export type AgentStage = 'idle' | 'researcher' | 'synthesis' | 'strategy' | 'review' | 'done';

export interface RunState {
  stage: AgentStage;
  startedAt: number | null;
  rawInput: string;
  cleanedInput: string;
  piiCounts: ReturnType<typeof import('./pii').stripPII>['counts'] | null;
  painPoints: PainPoint[];
  themes: Theme[];
  cards: FeatureCard[];
  error: string | null;
  mode: 'live' | 'demo';
}
