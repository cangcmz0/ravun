import { create } from 'zustand'
import { getSession, login as apiLogin, logout as apiLogout } from '@/lib/api'

// Oturum sunucuda HttpOnly çerezle tutulur; burası yalnızca arayüz durumunu yansıtır.
interface AuthState {
  isAuthed: boolean
  login: (pin: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<boolean>
}

export const useAuthStore = create<AuthState>()((set) => ({
  isAuthed: false,
  login: async (pin: string) => {
    await apiLogin(pin)
    set({ isAuthed: true })
  },
  logout: async () => {
    try { await apiLogout() } finally { set({ isAuthed: false }) }
  },
  refresh: async () => {
    try {
      const { authed } = await getSession()
      set({ isAuthed: authed })
      return authed
    } catch {
      set({ isAuthed: false })
      return false
    }
  },
}))
