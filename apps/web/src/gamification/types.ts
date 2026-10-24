export interface ProgressData {
  totalXp: number;
  level: number;
  levelFloor: number;
  nextLevelXp: number;
  remainingXp: number;
  percent: number;
  pending: boolean;
  updatedAt: string | null;
  validRides: number;
  version: number;
}
export interface Achievement {
  code: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  target: number;
  current_value: number;
  status: 'locked' | 'unlocked' | 'revoked' | 'unavailable';
  unlocked_at: string | null;
  xp_reward: number;
  enabled: boolean;
}
export interface Preferences {
  opted_in: boolean;
  show_progress: boolean;
  show_achievements: boolean;
  circuit_opt_in: boolean;
  state: string;
  city: string;
}
export interface Season {
  id: string;
  name: string;
  status: 'scheduled' | 'active' | 'closed' | 'archived';
  starts_at: string;
  ends_at: string;
  revision: number;
}
export interface RankingEntry {
  user_id: string;
  username: string;
  display_name: string;
  score: number;
  position: number;
  state: string;
  city: string;
}
export interface Ranking {
  items: RankingEntry[];
  hasMore: boolean;
  me: { score: number; position: number } | null;
  season: Season | null;
  unavailable: string | null;
}
export interface XpEntry {
  id: string;
  reason: string;
  xp_delta: number;
  status: string;
  source_type: string;
  source_id: string;
  created_at: string;
  rule_version: number;
  season_id: string | null;
}
export interface Challenge {
  code: string;
  name: string;
  description: string;
  status: string;
  baseline: number;
  target: number;
  current_value: number;
}
