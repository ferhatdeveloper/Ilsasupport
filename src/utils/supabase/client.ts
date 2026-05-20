/**
 * Eski `@supabase/supabase-js` istemcisi kaldırıldı (PostgreSQL + yerel API).
 * Geriye dönük import kırılmaması için minimal sahte nesne.
 */
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    signOut: async () => {},
    onAuthStateChange: () => ({
      data: { subscription: { unsubscribe: () => {} } },
    }),
  },
} as const;
