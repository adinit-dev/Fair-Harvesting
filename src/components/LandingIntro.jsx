import { useEffect, useRef, useState } from 'react'
import { Sprout } from 'lucide-react'

const INTRO_SEEN_KEY = 'fairharvest-intro-seen'

function introWasSeen() {
  try { return window.sessionStorage.getItem(INTRO_SEEN_KEY) === 'true' } catch { return false }
}

export default function LandingIntro({ children }) {
  const [visible, setVisible] = useState(() => !introWasSeen())
  const [leaving, setLeaving] = useState(false)
  const timersRef = useRef(new Set())

  useEffect(() => {
    if (!visible) return undefined
    const timers = timersRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reducedMotion ? 650 : 4200
    const timer = window.setTimeout(() => setLeaving(true), duration)
    timers.add(timer)
    return () => {
      window.clearTimeout(timer)
      timers.delete(timer)
    }
  }, [visible])

  useEffect(() => {
    if (!visible || !leaving) return undefined
    const timers = timersRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => {
      timers.delete(timer)
      try { window.sessionStorage.setItem(INTRO_SEEN_KEY, 'true') } catch { /* storage can be disabled */ }
      setVisible(false)
    }, reducedMotion ? 160 : 800)
    timers.add(timer)
    return () => {
      window.clearTimeout(timer)
      timers.delete(timer)
    }
  }, [visible, leaving])

  useEffect(() => {
    if (!visible) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [visible])

  function skipIntro() {
    timersRef.current.forEach(timer => window.clearTimeout(timer))
    timersRef.current.clear()
    setLeaving(true)
  }

  return (
    <>
      {children}
      {visible && (
        <div className={`landing-intro${leaving ? ' landing-intro-leaving' : ''}`} role="dialog" aria-label="FairHarvest introduction">
          <div className="landing-intro-backdrop" />
          <div className="landing-intro-sun" />
          <button type="button" className="landing-intro-skip" onClick={skipIntro}>Skip intro</button>
          <div className="landing-intro-content">
            <div className="landing-intro-brand" aria-label="FairHarvest">
              <span className="landing-intro-mark"><Sprout size={23} strokeWidth={1.7} /></span>
              <span>Fair<span>Harvest</span></span>
            </div>
            <div className="landing-intro-copy">
              <p className="landing-intro-line landing-intro-line-one">Every harvest has a story.</p>
              <p className="landing-intro-line landing-intro-line-two">Every farmer deserves a <span>fair market.</span></p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
