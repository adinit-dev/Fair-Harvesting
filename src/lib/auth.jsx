/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isDemoMode, supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(!isDemoMode)
  useEffect(() => {
    if (isDemoMode) return undefined
    let active = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (active && !error) setSession(data.session)
      if (active) setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])
  const value = { session, user: session?.user ?? null, loading, demo: isDemoMode, signOut: () => supabase?.auth.signOut() }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

export function ProtectedRoute({ children }) {
  const { session, loading, demo } = useAuth()
  const location = useLocation()
  if (loading) return <div className="auth-page"><div className="auth-card"><p>Restoring your session…</p></div></div>
  if (demo || !session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  return children
}
