// Conteúdo local ilustrativo. Nenhum perfil, percurso ou indicador é verificado.
export const photos = {
  ride: '/assets/coastal-ride.webp',
  sunset: '/assets/sunset-bike.webp',
  coast: '/assets/coastal-road.webp',
  avatar: '/assets/rider-avatar.webp',
  camera: '/assets/camera-preview.webp',
  terrain: '/assets/satellite-terrain.webp',
  motorcycle: '/assets/garage-bike.webp',
  cover: '/assets/profile-cover.webp',
};

export const demoProfile = {
  name: 'Lucas',
  level: 12,
  city: 'Maceió - AL',
  xp: 2350,
  nextLevelXp: 3000,
  biography: 'Estrada, curvas e boas companhias. Alagoas sempre no roteiro! 🏍',
  routes: '38',
  distance: '2.842',
  followers: '56',
  following: '48',
};

export type RideMode = 'passeio' | 'pista' | 'misto';
export const rideModes: {
  id: RideMode;
  name: string;
  description: string;
  subtitle: string;
}[] = [
  {
    id: 'passeio',
    name: 'Passeio',
    description: 'Curvas e paisagens',
    subtitle: 'Curvas, paisagens e novas histórias.',
  },
  {
    id: 'pista',
    name: 'Pista',
    description: 'Performance total',
    subtitle: 'Precisão e performance em cada curva.',
  },
  {
    id: 'misto',
    name: 'Misto',
    description: 'Asfalto e aventura',
    subtitle: 'Asfalto e aventura, sem limites.',
  },
];

export const demoTelemetry = {
  dateLabel: '12/10/2024 · 08:14',
  speed: 118,
  maximumSpeed: 182,
  averageSpeed: 75,
  duration: '01:28:34',
  distance: '62,4',
  leftLean: 38,
  rightLean: 42,
  acceleration: '+0,8',
  braking: '-1,2',
};

export interface DemoRoute {
  id: string;
  name: string;
  itinerary: string;
  distance: string;
  duration: string;
  difficulty: 'Fácil' | 'Médio';
  mode: RideMode;
  tags: string[];
  image: string;
  circuit: boolean;
  popular: boolean;
}

export const demoRoutes: DemoRoute[] = [
  {
    id: 'litoral-sul',
    name: 'Rota do Litoral Sul',
    itinerary: 'Maceió → Praia do Francês → Barra de São Miguel',
    distance: '62,4',
    duration: '01:28:34',
    difficulty: 'Fácil',
    mode: 'passeio',
    tags: ['Praias', 'Paisagens'],
    image: photos.coast,
    circuit: false,
    popular: true,
  },
  {
    id: 'maragogi',
    name: 'Rota para Maragogi',
    itinerary: 'Praia do Francês → Maragogi',
    distance: '124,8',
    duration: '02:53:20',
    difficulty: 'Médio',
    mode: 'misto',
    tags: ['Litoral', 'Aventura'],
    image: photos.ride,
    circuit: false,
    popular: true,
  },
  {
    id: 'litoral-norte',
    name: 'Circuito Litoral Norte',
    itinerary: 'Maceió → Praia do Francês → Maragogi',
    distance: '187,6',
    duration: '03:42:00',
    difficulty: 'Médio',
    mode: 'misto',
    tags: ['Litoral', 'Turismo'],
    image: photos.ride,
    circuit: true,
    popular: true,
  },
  {
    id: 'serra-usina',
    name: 'Serra da Usina',
    itinerary: 'Maceió → Serra da Usina',
    distance: '38,7',
    duration: '01:05:20',
    difficulty: 'Médio',
    mode: 'pista',
    tags: ['Serra', 'Curvas'],
    image: photos.coast,
    circuit: false,
    popular: false,
  },
  {
    id: 'corais',
    name: 'Costa dos Corais',
    itinerary: 'Maceió → Costa dos Corais',
    distance: '96,1',
    duration: '02:18:40',
    difficulty: 'Fácil',
    mode: 'passeio',
    tags: ['Praias', 'Litoral'],
    image: photos.coast,
    circuit: false,
    popular: false,
  },
];

export const demoMotorcycle = {
  brand: 'Honda',
  model: 'CB 650R',
  year: 2023,
  engine: '649 cc',
  image: photos.motorcycle,
};
export const demoAchievements = [
  {
    name: 'Explorador',
    description: '10 rotas completadas',
    icon: 'mountain',
    tone: 'red',
  },
  {
    name: 'Mestre das Curvas',
    description: '1.000 km em curvas',
    icon: 'route',
    tone: 'gold',
  },
  {
    name: 'Piloto Social',
    description: '50 interações na comunidade',
    icon: 'users',
    tone: 'silver',
  },
] as const;
export const demoCommunity = [
  { name: 'RafaMT', city: 'Maceió - AL', likes: 128, image: photos.sunset },
  {
    name: 'BruRider',
    city: 'Barra de São Miguel - AL',
    likes: 96,
    image: photos.coast,
  },
  {
    name: 'Marina77',
    city: 'Praia do Francês - AL',
    likes: 73,
    image: photos.ride,
  },
];
export const demoPost = {
  author: demoProfile.name,
  city: demoProfile.city,
  date: '12/10/2024',
  text: 'Que rolê incrível hoje pelo Litoral Sul! 🏍 Estradas perfeitas e vista de cinema. Alagoas não decepciona! 💪',
  image: photos.sunset,
  likes: 128,
  comments: 12,
  replies: [
    { author: 'RafaMT', text: 'Lindo demais! Qual foi a rota?', date: '12/10' },
    {
      author: 'Lucas',
      text: 'Foi a Rota do Litoral Sul, saindo de Maceió até Barra de São Miguel. Recomendo muito!',
      date: '12/10',
    },
  ],
};
export const demoGroups = [
  {
    name: 'Apex Alagoas',
    private: false,
    members: '1,2 mil',
    image: photos.coast,
  },
  {
    name: 'Riders do Litoral Sul',
    private: true,
    members: '328',
    image: photos.sunset,
  },
];
export const demoRanking = [
  { name: 'RafaMT', city: 'Maceió - AL', distance: '12.430' },
  { name: 'Lucas', city: 'Maceió - AL', distance: '2.842' },
  { name: 'Marina77', city: 'Praia do Francês - AL', distance: '2.105' },
  { name: 'BruRider', city: 'Barra de São Miguel - AL', distance: '1.890' },
  { name: 'CaioSP', city: 'Arapiraca - AL', distance: '1.560' },
];
