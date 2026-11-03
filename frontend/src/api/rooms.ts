import { api } from './client';

export interface RoomDto { code: string; status: 'WAITING' | 'IN_PROGRESS' | 'FINISHED'; playerCount: number }

export const roomsApi = {
  create: () => api<RoomDto>('/api/rooms', { method: 'POST' }),
  get: (code: string) => api<RoomDto>(`/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}`),
};
