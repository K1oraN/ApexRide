import { useState } from 'react';
import {
  Crown,
  Heart,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Mountain,
  Route,
  Share2,
  UsersRound,
} from 'lucide-react';
import {
  demoAchievements,
  demoCommunity,
  demoGroups,
  demoPost,
  demoProfile,
  demoRanking,
} from '../../data/demo';
import { Avatar, Photo, Popover, UnavailableButton } from '../ui';

export function CommunityPreview() {
  return (
    <div className="community-preview">
      {demoCommunity.map((person) => (
        <article className="community-photo" key={person.name}>
          <Photo
            src={person.image}
            alt={`Fotografia ilustrativa da publicação de ${person.name}`}
          />
          <div className="community-photo-info">
            <Avatar name={person.name} />
            <div>
              <strong>{person.name}</strong>
              <small>{person.city}</small>
            </div>
            <span className="community-likes">
              <Heart size={16} fill="currentColor" />
              {person.likes}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

export function Achievements() {
  return (
    <div className="achievements panel">
      {demoAchievements.map((item) => (
        <div className={`achievement achievement-${item.tone}`} key={item.name}>
          <div className="medal">
            <svg viewBox="0 0 100 110" aria-hidden>
              <path d="M50 3 95 28v54l-45 25L5 82V28Z" />
              <path d="M50 10 88 32v46l-38 22-38-22V32Z" />
            </svg>
            {item.icon === 'mountain' ? (
              <Mountain />
            ) : item.icon === 'route' ? (
              <Route />
            ) : (
              <UsersRound />
            )}
          </div>
          <strong>{item.name}</strong>
          <p>{item.description}</p>
        </div>
      ))}
    </div>
  );
}

export function PostCard() {
  const [liked, setLiked] = useState(true);
  const [commentsOpen, setCommentsOpen] = useState(true);
  return (
    <article className="post panel">
      <header className="post-heading">
        <Avatar name={demoPost.author} />
        <div>
          <strong>{demoPost.author}</strong>
          <small>
            {demoPost.city} · {demoPost.date}
          </small>
        </div>
        <Popover
          label="Opções da publicação"
          trigger={<MoreHorizontal size={23} />}
        >
          <p>Publicação ilustrativa</p>
          <small>Sem edição, denúncia ou publicação real nesta etapa.</small>
        </Popover>
      </header>
      <p className="post-text">{demoPost.text}</p>
      <Photo
        className="post-photo"
        src={demoPost.image}
        alt="Motociclista em um mirante do litoral ao pôr do sol — imagem ilustrativa"
      />
      <div className="post-actions">
        <button
          onClick={() => setLiked(!liked)}
          aria-label="Curtir publicação de demonstração"
          aria-pressed={liked}
          className={liked ? 'liked' : ''}
        >
          <Heart fill={liked ? 'currentColor' : 'none'} />
          {demoPost.likes + (liked ? 0 : -1)}
        </button>
        <button
          aria-expanded={commentsOpen}
          aria-controls="demo-comments"
          onClick={() => setCommentsOpen(!commentsOpen)}
        >
          <MessageCircle />
          {demoPost.comments}
          <span className="sr-only"> comentários ilustrativos</span>
        </button>
        <UnavailableButton>
          <Share2 />
          Compartilhar
        </UnavailableButton>
      </div>
      {commentsOpen && (
        <div id="demo-comments" className="post-comments">
          {demoPost.replies.map((reply, index) => (
            <div className="comment" key={index}>
              <Avatar name={reply.author} />
              <div>
                <strong>{reply.author}</strong>
                <p>{reply.text}</p>
              </div>
              <small>{reply.date}</small>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function CommunityGroups() {
  return (
    <div className="community-groups">
      {demoGroups.map((group) => (
        <article className="group-card panel" key={group.name}>
          <Photo
            src={group.image}
            alt={`Paisagem ilustrativa da comunidade ${group.name}`}
          />
          <div>
            {group.private ? (
              <LockKeyhole size={21} />
            ) : (
              <UsersRound size={21} />
            )}
            <h3>{group.name}</h3>
            <p>Comunidade {group.private ? 'privada' : 'aberta'}</p>
            <small>{group.members} membros ilustrativos</small>
            <UnavailableButton
              className={group.private ? 'button-muted' : 'button-outline'}
            >
              {group.private ? 'Solicitar' : 'Entrar'}
            </UnavailableButton>
          </div>
        </article>
      ))}
    </div>
  );
}

export function Ranking() {
  return (
    <ol className="ranking">
      {demoRanking.map((person, index) => (
        <li
          className={`panel ${person.name === demoProfile.name ? 'ranking-self' : ''}`}
          key={person.name}
        >
          <span className={`rank-number rank-${index + 1}`}>
            {index < 3 ? <Crown size={20} fill="currentColor" /> : index + 1}
          </span>
          <Avatar name={person.name} />
          <div>
            <strong>{person.name}</strong>
            <small>{person.city}</small>
          </div>
          <span>{person.distance} km</span>
        </li>
      ))}
    </ol>
  );
}
