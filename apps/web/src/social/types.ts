export interface Person {
  id: string;
  username: string;
  displayName: string;
  relationship?: 'none' | 'pending' | 'approved';
}
export interface SocialProfile extends Person {
  visibility: 'public' | 'private';
  accessible: boolean;
  biography?: string;
  city?: string;
  state?: string;
  followers: number | null;
  following: number | null;
}
export interface Media {
  id: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
}
export interface RideSummary {
  id: string;
  mode: string;
  day: string;
  distanceKm: number | string;
  activeMinutes: number | string;
  locationPolicy: 'summary-only-v1';
}
export interface SocialPost {
  achievement_code?: string | null;
  achievement?: { code: string; name: string } | null;
  group_id?: string | null;
  group_private?: boolean;
  id: string;
  author_id: string;
  author: Person;
  text: string;
  visibility: 'public' | 'followers' | 'private';
  motorcycle_id: string | null;
  ride_id: string | null;
  created_at: string;
  updated_at: string;
  following: boolean;
  likes: number;
  liked: boolean;
  comments: number;
  media: Media[];
  motorcycle: {
    id: string;
    brand: string;
    model: string;
    year: number;
    displacementCc: number | null;
  } | null;
  ride: RideSummary | null;
}
export interface Comment {
  id: string;
  text: string;
  created_at: string;
  author: Person;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
