import { createContext } from 'react';
import type { User } from '../services/auth';
export interface AuthState {
  user: User | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
  endSession: () => void;
}
export const AuthContext = createContext<AuthState | null>(null);
