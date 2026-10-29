/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isDemoMode, supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [activeMode, setActiveModeState] = useState(() => {
    if (typeof window === 'undefined') return 'farmer'
    const stored = window.localStorage.getItem('fairharvest-active-mode')
    return stored === 'buyer' ? 'buyer' : 'farmer'
  })
  const [modeError, setModeError] = useState('')
  const [loading, setLoading] = useState(!isDemoMode)
  const [profileError, setProfileError] = useState('')

  async function loadProfile(nextSession, active = true) {
    if (!nextSession) {
      if (active) { setProfile(null); setProfileError('') }
      return
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', nextSession.user.id).maybeSingle()
    if (!active) return
    if (error) { setProfile(null); setProfileError(error.message); return }
    setProfile(data)
    setProfileError(data ? '' : 'Your profile has not been created yet. Please sign out and try again.')
    reconcileActiveMode(data)
  }

  function reconcileActiveMode(nextProfile) {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('fairharvest-active-mode') : null
    const preferred = nextProfile?.preferred_workspace
    const candidate = preferred === 'buyer' || preferred === 'farmer' ? preferred : stored
    setActiveModeState(candidate === 'buyer' ? 'buyer' : 'farmer')
  }

  async function setActiveMode(nextMode) {
    setModeError('')
    if (!['farmer', 'buyer'].includes(nextMode)) return false
    setActiveModeState(nextMode)
    if (typeof window !== 'undefined') window.localStorage.setItem('fairharvest-active-mode', nextMode)
    if (!isDemoMode && session?.user?.id) {
      const { error } = await supabase.from('profiles').update({ preferred_workspace: nextMode }).eq('id', session.user.id)
      if (error) setModeError(error.message)
    }
    return true
  }

  useEffect(() => {
    if (isDemoMode) return undefined
    let active = true
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return
      if (!error) { setSession(data.session); await loadProfile(data.session, active) }
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      if (!nextSession) { setProfile(null); setProfileError(''); setLoading(false); return }
      await loadProfile(nextSession, active)
      setLoading(false)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  async function signOut() {
    setSession(null)
    setProfile(null)
    setProfileError('')
    setActiveModeState('farmer')
    setModeError('')
    if (!isDemoMode) await supabase.auth.signOut()
  }

  async function refreshProfile() {
    await loadProfile(session)
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    profileError,
    loading,
    demo: isDemoMode,
    signOut,
    refreshProfile,
    activeMode,
    modeError,
    setActiveMode,
    allowedModes: ['farmer', 'buyer'],
    accountType: profile?.account_type || 'both',
  }
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
