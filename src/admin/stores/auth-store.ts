import { create } from 'zustand'
import {
  isValidAdminSession,
  createAdminSession,
  clearAdminSession,
  verifyAdminPin,
} from '@/lib/ravun-data'

interface AuthState {
  isAuthed: boolean
  login: (pin: string) => Promise<boolean>
  logout: () => void
  refresh: () => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  isAuthed: isValidAdminSession(),
  login: async (pin: string) => {
    const ok = await verifyAdminPin(pin)
    if (ok) {
      createAdminSession()
      set({ isAuthed: true })
      return true
    }
    return false
  },
  logout: () => {
    clearAdminSession()
    set({ isAuthed: false })
  },
  refresh: () => set({ isAuthed: isValidAdminSession() }),
}))
