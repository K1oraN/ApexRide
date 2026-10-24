import type { RoutePlan } from '@apex-ride/ride-core/routes';
export interface SocialEvent {
  id: string;
  organizer_id: string;
  organizer_name: string;
  group_id: string | null;
  route_id: string | null;
  route_version: number | null;
  title: string;
  description: string;
  rules: string;
  event_type: 'meetup' | 'ride';
  visibility: 'public' | 'group' | 'invite';
  join_policy: 'immediate' | 'approval';
  city: string;
  state: string;
  meeting_point: { type: 'Point'; coordinates: [number, number] };
  meeting_point_label: string;
  meeting_reference: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  capacity: number | null;
  revision: number;
  updated_at: string;
  status: 'scheduled' | 'ongoing' | 'finished' | 'cancelled';
  participation_status: string | null;
  can_manage: boolean;
  confirmed: boolean;
  confirmed_count: number;
  image_id?: string | null;
}
export interface EventMapData {
  event: SocialEvent;
  route: { plan: RoutePlan; availability: string } | null;
}
export interface LiveSession {
  id: string;
  audience_scope: 'organizers' | 'confirmed';
  precision_mode: 'approximate' | 'precise';
  started_at: string;
  expires_at: string;
  last_update_at?: string | null;
}
export interface LivePosition {
  id: string;
  user_id: string;
  display_name: string;
  longitude: number;
  latitude: number;
  accuracy: number;
  recorded_at: string;
  received_at: string;
  expires_at: string;
  precision_mode: 'approximate' | 'precise';
  freshness: 'fresh' | 'stale';
}
export interface EventParticipant {
  attendance_verified?: boolean | null;
  user_id: string;
  display_name: string;
  participation_status: string;
  organizer: boolean;
}
export interface EventInvitation {
  id: string;
  event_id: string;
  title: string;
  starts_at: string;
  timezone: string;
  expires_at: string;
}
export const statusLabel: Record<SocialEvent['status'], string> = {
  scheduled: 'Agendado',
  ongoing: 'Em andamento',
  finished: 'Encerrado',
  cancelled: 'Cancelado',
};
export const participationLabel: Record<string, string> = {
  confirmed: 'Presença confirmada',
  interested: 'Interessado',
  pending: 'Solicitação pendente',
  cancelled: 'Presença cancelada',
  rejected: 'Solicitação recusada',
  removed: 'Removido pela organização',
};
export function eventDate(event: Pick<SocialEvent, 'starts_at' | 'timezone'>) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: event.timezone,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(event.starts_at));
}
