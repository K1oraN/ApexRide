import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/context';
import { GarageContext } from '../garage/context';
import { Feed, LivePost } from './Feed';
import { Composer } from './Composer';
import { CommunityPreview } from './CommunityPreview';
import { social, savePost } from './service';
import type { SocialPost } from './types';
vi.mock('./service', () => ({
  social: vi.fn(),
  savePost: vi.fn(),
  uploadPhoto: vi.fn(),
}));
vi.mock('../history/service', () => ({
  historyService: { list: async () => ({ rides: [], hasMore: false }) },
}));
const user = {
  id: 'alice',
  displayName: 'Alice',
  username: 'alice',
  email: 'private@example.com',
  emailVerified: true,
  biography: '',
  city: '',
  state: '',
  avatarRef: null,
  createdAt: '2026-10-23',
  privacy: {
    profileVisibility: 'public' as const,
    activityVisibility: 'private' as const,
    liveLocationEnabled: false as const,
  },
};
const auth: AuthState = {
  user,
  status: 'ready',
  error: null,
  refresh: async () => {},
  login: async () => {},
  logout: async () => {},
  updateUser: () => {},
  endSession: () => {},
};
const post: SocialPost = {
  id: 'post',
  author_id: 'alice',
  author: { id: 'alice', username: 'alice', displayName: 'Alice' },
  text: '<script>window.hacked=true</script>',
  visibility: 'public',
  motorcycle_id: null,
  ride_id: null,
  created_at: '2026-10-23T12:00:00Z',
  updated_at: '2026-10-23T12:00:00Z',
  following: false,
  likes: 0,
  liked: false,
  comments: 0,
  media: [],
  motorcycle: null,
  ride: null,
};
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(social).mockReset();
  vi.mocked(savePost).mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function mount(content: React.ReactNode) {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <AuthContext.Provider value={auth}>
          <GarageContext.Provider
            value={{
              motorcycles: [],
              loading: false,
              error: null,
              refresh: async () => {},
            }}
          >
            {content}
          </GarageContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>,
    ),
  );
}
async function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent) === label,
  );
  expect(button, label).toBeTruthy();
  await act(async () => button!.click());
}
it('renders user content as escaped text, never executable HTML', async () => {
  await mount(<LivePost post={post} onUpdate={() => {}} onRemove={() => {}} />);
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('.post-text')?.textContent).toBe(post.text);
});
it('like remains unchanged until backend confirmation and network failure preserves state', async () => {
  let reject!: (e: Error) => void;
  vi.mocked(social).mockReturnValue(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const updated = vi.fn();
  await mount(<LivePost post={post} onUpdate={updated} onRemove={() => {}} />);
  await click('Curtir publicação');
  expect(
    container
      .querySelector('[aria-label="Curtir publicação"]')
      ?.getAttribute('aria-pressed'),
  ).toBe('false');
  expect(updated).not.toHaveBeenCalled();
  await act(async () => reject(new Error('Sem conexão')));
  expect(updated).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Sem conexão',
  );
});
it('failed publication preserves entered text and does not announce success', async () => {
  vi.mocked(social).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(savePost).mockRejectedValue(new Error('Falha de rede'));
  const saved = vi.fn();
  await mount(<Composer onSaved={saved} onCancel={() => {}} />);
  const input = container.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!.call(input, 'Legenda preservada');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('Publicar');
  expect(input.value).toBe('Legenda preservada');
  expect(saved).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Falha de rede',
  );
});
it('sharing explicitly selects a group and saves through the existing composer', async () => {
  vi.mocked(social).mockResolvedValue({
    items: [{ id: 'group', name: 'Meu grupo' }],
    nextCursor: null,
  });
  vi.mocked(savePost).mockResolvedValue({ post });
  const saved = vi.fn();
  await mount(<Composer onSaved={saved} onCancel={() => {}} />);
  const destination = container.querySelector<HTMLSelectElement>(
    '[aria-label="Destino da publicação"]',
  )!;
  await act(async () => {
    destination.value = 'group';
    destination.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const text = container.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!.call(text, 'Compartilhamento explícito');
    text.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(savePost).not.toHaveBeenCalled();
  await click('Publicar');
  expect(savePost).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'Compartilhamento explícito' }),
    undefined,
    'group',
  );
  expect(saved).toHaveBeenCalledOnce();
});
it('group feed uses the shared post UI and clears previously loaded content after revoked access', async () => {
  vi.mocked(social)
    .mockResolvedValueOnce({
      items: [{ ...post, group_id: 'group' }],
      nextCursor: null,
    })
    .mockRejectedValueOnce(new Error('Acesso revogado'));
  await mount(<Feed groupId="group" />);
  expect(container.querySelectorAll('article.post')).toHaveLength(1);
  expect(vi.mocked(social).mock.calls[0]?.[0]).toContain('/groups/group/posts');
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(container.querySelectorAll('article.post')).toHaveLength(0);
  expect(container.textContent).toContain('Acesso revogado');
});
it('cursor pagination deduplicates overlapping posts and ends the list', async () => {
  vi.mocked(social)
    .mockResolvedValueOnce({ items: [post], nextCursor: 'next' })
    .mockResolvedValueOnce({
      items: [post, { ...post, id: 'second' }],
      nextCursor: null,
    });
  await mount(<Feed />);
  await click('Carregar mais publicações');
  expect(container.querySelectorAll('article.post')).toHaveLength(2);
  expect(container.textContent).toContain('Sem novas publicações.');
});
it('following switch ignores a late response from public feed', async () => {
  let late!: (value: unknown) => void;
  vi.mocked(social)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        late = resolve;
      }),
    )
    .mockResolvedValueOnce({ items: [], nextCursor: null });
  await mount(<Feed />);
  await click('Seguindo');
  await act(async () => late({ items: [post], nextCursor: null }));
  expect(container.querySelectorAll('article.post')).toHaveLength(0);
  expect(container.textContent).toContain(
    'Nenhuma publicação das contas seguidas',
  );
});
it('home keeps its approved photo grid with real authors and thumbnails', async () => {
  vi.mocked(social).mockResolvedValue({
    items: [
      {
        ...post,
        media: [
          {
            id: 'photo',
            url: '/social/media/photo',
            thumbnailUrl: '/social/media/photo?size=thumb',
            width: 640,
            height: 480,
          },
        ],
      },
    ],
    nextCursor: null,
  });
  await mount(<CommunityPreview />);
  expect(
    container.querySelectorAll('.community-preview .community-photo'),
  ).toHaveLength(1);
  expect(container.querySelector('img')?.getAttribute('src')).toBe(
    '/api/social/media/photo?size=thumb',
  );
  expect(
    container.querySelector('.community-photo-info')?.textContent,
  ).toContain('Alice');
});
