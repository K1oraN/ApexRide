import { authRequest } from '../services/auth';
import type { Media, SocialPost } from './types';
export const social = async <T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
) => {
  const result = await authRequest<T>(
    path.startsWith('/groups') ? path : `/social${path}`,
    method,
    body,
    signal,
  );
  if (method !== 'GET') window.dispatchEvent(new Event('apex:social-changed'));
  return result;
};
export const savePost = (body: unknown, id?: string, groupId?: string) =>
  social<{ post: SocialPost }>(
    id ? `/posts/${id}` : groupId ? `/groups/${groupId}/posts` : '/posts',
    id ? 'PATCH' : 'POST',
    body,
  );
export const uploadPhoto = (file: File) =>
  social<{ media: Media }>('/media', 'POST', file);
