export type GroupRole = 'owner' | 'admin' | 'moderator' | 'member';
export interface Group {
  id: string;
  slug: string;
  name: string;
  description: string;
  privacy_type: 'public' | 'private';
  discovery_mode: 'listed' | 'unlisted';
  join_policy: 'immediate' | 'approval';
  posting_policy: 'members' | 'staff';
  members_can_invite: boolean;
  city: string;
  state: string;
  categories: string[];
  rules: string[];
  rules_version: number;
  status: 'active' | 'archived' | 'deleted';
  role: GroupRole | null;
  member_status: string | null;
  accepted_rules_version: number | null;
  member_count: number | null;
  images: { avatar?: string; cover?: string };
}
export interface GroupMember {
  id: string;
  user_id: string;
  username: string;
  displayName: string;
  role: GroupRole;
  status: string;
  joined_at: string | null;
  suspended: boolean;
}
export interface Invitation {
  id: string;
  group_id: string;
  name: string;
  rules: string[];
  rules_version: number;
  expires_at: string;
  status?: string;
  usage_count?: number;
  usage_limit?: number;
}
export const roleNames: Record<GroupRole, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  moderator: 'Moderador',
  member: 'Membro',
};
export const statusNames: Record<string, string> = {
  active: 'Ativo',
  pending: 'Pendente',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
  removed: 'Removido',
  banned: 'Banido',
  accepted: 'Aceito',
  revoked: 'Revogado',
};
