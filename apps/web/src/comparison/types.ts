import type { RoutePlan } from '@apex-ride/ride-core/routes';
import type {
  ComparisonState,
  PositionSample,
  Range,
} from '@apex-ride/ride-core/comparison';
import type { MotionStats } from '@apex-ride/ride-core/motion';
export interface Bike {
  brand: string;
  model: string;
  displacementCc: number | null;
}
export interface Candidate {
  id: string;
  mode: string;
  bike: Bike | null;
  category: string;
  routeVersion: number;
  completion: string | null;
  distanceMeters: number;
  activeMs: number;
  own: boolean;
  day: string | null;
  sensors: boolean;
  pointCount: number;
}
export interface SelectionData {
  candidates: Candidate[];
  page: number;
  hasMore: boolean;
  maxActivities: number;
  minParticipants: number;
  route: {
    id: string;
    name: string;
    city: string;
    state: string;
    plan: RoutePlan | null;
  };
  categories: string[];
  ccBands: number[][];
  technicalAvailable: boolean;
}
export interface ComparisonActivity {
  id: string;
  own: boolean;
  label: string;
  bike: Bike | null;
  mode: string;
  routeVersion: number;
  state: ComparisonState;
  coverage: number;
  issues: string[];
  summary: {
    distanceMeters: number;
    routeMeters: number;
    extraMeters: number;
    activeMs: number;
    elapsedMs: number;
    pausedMs: number;
    averageKmh: number | null;
    maximumKmh: number | null;
    commonActiveMs: number | null;
    commonAverageKmh?: number | null;
    commonMaximumKmh?: number | null;
    lapMs: number | null;
    motion: MotionStats | null;
  };
  methods: {
    gps: string;
    assisted: string | null;
    motion: string | null;
    calibrated: boolean;
  };
  samples: (PositionSample & {
    assisted: number | null;
    force: number | null;
    lean: number | null;
  })[];
  track: [number, number][][];
  trackReduced: boolean;
  events: {
    type: string;
    durationMs: number | null;
    status: string;
    method: string;
    quality: { source?: string };
  }[];
  laps: {
    number: number;
    durationMs: number;
    status: string;
    quality: { method: string; accuracy: number };
  }[];
}
export interface ComparisonResult {
  referenceSource?: 'gps-common' | 'registered-route';
  referenceVersion?: string | null;
  version: string;
  state: ComparisonState;
  route: {
    id: string;
    name: string;
    city: string;
    state: string;
    plan: RoutePlan;
  };
  commonMeters: number;
  commonRanges: Range[];
  sections: { from: number; to: number; activeMs: number[] }[];
  commonGeometry: import('@apex-ride/ride-core/routes').Line[];
  activities: ComparisonActivity[];
  differences: {
    id: string;
    commonTimeMs: number | null;
    distanceMeters: number | null;
    activeMs: number | null;
    lapMs: number | null;
  }[];
  limitations: string[];
}
export interface CommunityStats {
  available: boolean;
  message?: string;
  minParticipants?: number;
  summary?: {
    distanceKm: number;
    activeMinutes: number;
    completionPercent: number;
    activitiesPerParticipant: number;
  };
}
