import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Clock3,
  ChevronDown,
  Eye,
  EyeOff,
  Filter,
  LogOut,
  MapPin,
  Menu,
  Package,
  Search,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  TrendingUp,
  UserCircle,
  X,
} from 'lucide-react'
import './App.css'
import { apiHeaders, apiUrl, readAssistantResponse } from './lib/assistantApi.js'
import FasalSaathi from './components/FasalSaathi.jsx'
import LandingIntro from './components/LandingIntro.jsx'
import { useAuth, ProtectedRoute } from './lib/auth.jsx'
import { validateLogin, validateRegistration } from './lib/authValidation.js'
import {
  createListing,
  fetchActiveListings,
  fetchOwnedListings,
  fetchListingById,
  fetchRequirements,
  fetchActiveRequirements,
  saveRequirement,
  createRequirementOffer,
  getOrCreateRequirementConversation,
  fetchConversations,
  updateListing,
  getListingImageUrl,
  uploadListingImage,
  getOrCreateListingConversation,
  fetchConversationMessages,
  sendConversationMessage,
  fetchListingOffers,
  createOffer,
  updateOfferStatus,
  withdrawRequirement,
} from './lib/data.js'
import { isDemoMode, supabase } from './lib/supabase.js'
import { validateCommonInput } from './lib/assistantCalculations.js'

const demoListings = [
  {
    id: 1,
    name: 'Organic Turmeric',
    variety: 'Lakadong',
    seller: "Pema's Farm",
    place: 'West Jaintia Hills, Meghalaya',
    price: 185,
    minPrice: 185,
    unit: 'kg',
    quantity: '240 kg',
    freshness: 92,
    tag: 'Harvested 2 days ago',
    image: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=800&q=85',
    verified: true,
    status: 'active',
  },
  {
    id: 2,
    name: 'Basmati Rice',
    variety: 'Aromatic local grain',
    seller: 'Rongmei Collective',
    place: 'Tamenglong, Manipur',
    price: 92,
    minPrice: 92,
    unit: 'kg',
    quantity: '1.2 tonnes',
    freshness: 88,
    tag: 'Harvested 8 days ago',
    image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=85',
    verified: true,
    status: 'active',
  },
  {
    id: 3,
    name: 'Pineapple',
    variety: 'Queen variety',
    seller: 'Mawphu Orchard',
    place: 'Ri-Bhoi, Meghalaya',
    price: 68,
    minPrice: 68,
    unit: 'kg',
    quantity: '580 kg',
    freshness: 96,
    tag: 'Harvested today',
    image: 'https://images.unsplash.com/photo-1550258987-190a2d41a8ba?auto=format&fit=crop&w=800&q=85',
    verified: true,
    status: 'active',
  },
  {
    id: 4,
    name: "Bird's Eye Chilli",
    variety: 'Dried whole',
    seller: 'Sumi Women Growers',
    place: 'Mokokchung, Nagaland',
    price: 430,
    minPrice: 430,
    unit: 'kg',
    quantity: '85 kg',
    freshness: 81,
    tag: 'Harvested 18 days ago',
    image: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?auto=format&fit=crop&w=800&q=85',
    verified: false,
    status: 'active',
  },
]

function Logo() {
  return (
    <Link to="/" className="logo">
      <span className="logo-mark"><Sprout size={19} /></span>
      <span>Fair<span className="logo-accent">Harvest</span></span>
    </Link>
  )
}

function Freshness({ score }) {
  return (
    <div className="freshness-row">
      <span className="freshness-label">Freshness</span>
      <div className="freshness-bar"><span style={{ width: `${score}%` }} /></div>
      <strong>{score}%</strong>
    </div>
  )
}

function ListingImage({ src, alt }) {
  const isUsableImage = typeof src === 'string' && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:'))
  return isUsableImage
    ? <img className="listing-image-media" src={src} alt={alt} />
    : <div className="listing-image-placeholder"><Sprout size={34} /><span>Image not provided</span></div>
}

function DemoBanner() {
  if (!isDemoMode) return null

  return (
    <div className="demo-banner">
      <Sparkles size={14} />
      <span><strong>Demo mode</strong> Â· Showing sample marketplace data. Connect Supabase to enable live listings and authentication.</span>
      <Link to="/settings">Configure services <ArrowRight size={13} /></Link>
    </div>
  )
}

function useDesktopNavigation() {
  const [desktopNavigation, setDesktopNavigation] = useState(() => window.matchMedia('(min-width: 681px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(min-width: 681px)')
    const update = () => setDesktopNavigation(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return desktopNavigation
}

function Header() {
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const desktopNavigation = useDesktopNavigation()
  const { session, profile, signOut, activeMode, setActiveMode } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const displayName = profile?.display_name || session?.user?.user_metadata?.display_name || session?.user?.email || 'FairHarvest user'
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()

  async function handleSignOut() {
    await signOut()
    setProfileOpen(false)
    navigate('/')
  }

  return (
    <header className="site-header">
      <div className="container nav-row">
        <Logo />
        <nav className={open ? 'nav-links open' : 'nav-links'}>
          {[['Marketplace', '/marketplace'], ['Dashboard', `/dashboard/${activeMode}`]].map(([label, href]) => (
            <NavLink key={label} to={href} className={({ isActive }) => (isActive && location.pathname !== '/' ? 'active' : '')} onClick={() => setOpen(false)}>
              {label}
            </NavLink>
          ))}
          {session && <NavLink to="/messages" className={({ isActive }) => isActive ? 'active' : ''} onClick={() => setOpen(false)}>Messages</NavLink>}
          {!desktopNavigation && (session ? <><div className="mobile-mode-toggle" role="group" aria-label="Active account mode"><button type="button" className={activeMode === 'farmer' ? 'active' : ''} aria-pressed={activeMode === 'farmer'} onClick={() => setActiveMode('farmer')}>Farmer</button><button type="button" className={activeMode === 'buyer' ? 'active' : ''} aria-pressed={activeMode === 'buyer'} onClick={() => setActiveMode('buyer')}>Buyer</button></div><Link to="/profile" onClick={() => setOpen(false)}>Profile</Link></> : <><Link to="/auth" onClick={() => setOpen(false)}>Sign in</Link><Link to="/auth?role=farmer" onClick={() => setOpen(false)}>Join FairHarvest</Link></>)}
        </nav>
        <div className="nav-actions">
          {desktopNavigation && session ? (
            <>
              <div className="global-mode-toggle" role="group" aria-label="Active account mode">
                {['farmer', 'buyer'].map(mode => (
                  <button
                    key={mode}
                    type="button"
                    className={activeMode === mode ? 'active' : ''}
                    aria-pressed={activeMode === mode}
                    onClick={() => setActiveMode(mode)}
                  >{mode === 'farmer' ? 'Farmer' : 'Buyer'}</button>
                ))}
              </div>
              <div className="profile-menu">
              <button type="button" className="profile-menu-button" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen(value => !value)}>
                <span className="profile-avatar">{initials}</span>
                <span>{displayName}</span>
                <ChevronDown size={15} />
              </button>
              {profileOpen && (
                <div className="profile-dropdown" role="menu">
                  <Link to="/profile" role="menuitem" onClick={() => setProfileOpen(false)}><UserCircle size={17} /> Profile</Link>
                  <button type="button" role="menuitem" onClick={handleSignOut}><LogOut size={17} /> Sign out</button>
                </div>
              )}
            </div>
            </>
          ) : desktopNavigation ? (
            <>
              <Link to="/auth" className="btn btn-outline">Sign in</Link>
              <Link to="/auth?role=farmer" className="btn btn-primary">Join FairHarvest <ArrowRight size={16} /></Link>
            </>
          ) : null}
          {!desktopNavigation && <button type="button" className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle navigation">
            {open ? <X /> : <Menu />}
          </button>}
        </div>
      </div>
    </header>
  )
}

function ModeRoute({ role, children }) {
  const { activeMode } = useAuth()
  return activeMode === role ? children : <Navigate to={`/dashboard/${activeMode}`} replace />
}

function Layout({ children }) {
  return (
    <>
      <DemoBanner />
      <Header />
      {children}
      <footer className="site-footer">
        <div className="container footer-row">
          <Logo />
          <span>Building a fairer food system for Northeast India.</span>
          <span>Â© 2025 FairHarvest</span>
        </div>
      </footer>
    </>
  )
}

function Home() {
  return (
    <>
      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> Northeast Indiaâ€™s trusted harvest network</div>
            <h1>Your harvest.<br /><em>Your market.</em><br />Your decision.</h1>
            <p className="hero-lead">A better way for farmers to find the right buyers, and for buyers to source exceptional produce directly from the people who grow it.</p>
            <div className="hero-actions">
              <Link to="/marketplace" className="btn btn-primary btn-large">Explore the marketplace <ArrowRight size={18} /></Link>
            </div>
            <div className="trust-row">
              <div className="avatar-stack"><span>R</span><span>M</span><span>S</span><span>+</span></div>
              <div><strong>2,400+ growers</strong><small>already growing together</small></div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-photo" />
            <div className="hero-float-card float-top"><span className="float-icon"><BadgeCheck size={18} /></span><div><strong>Verified harvest</strong><small>Freshness score 96%</small></div></div>
            <div className="hero-float-card float-bottom"><div className="mini-chart"><TrendingUp size={18} /></div><div><strong>Fair prices, always</strong><small>Direct from the farm</small></div></div>
            <div className="hero-location"><MapPin size={14} /> Meghalaya Â· India</div>
          </div>
        </div>
      </section>

      <section className="stats-strip">
        <div className="container stats-grid">
          <div><strong>2,400+</strong><span>Farmers onboarded</span></div>
          <div><strong>18</strong><span>Districts connected</span></div>
          <div><strong>â‚¹4.2 Cr</strong><span>Value traded</span></div>
          <div><strong>96%</strong><span>On-time fulfillment</span></div>
        </div>
      </section>


      <section className="section section-tint">
        <div className="container split-promo">
          <div>
            <div className="eyebrow">Built for both sides</div>
            <h2>More than a marketplace.<br /><em>A growing community.</em></h2>
            <p>From a small family farm in Nagaland to a restaurant in Guwahati, FairHarvest makes every step more transparent and every decision more informed.</p>
            <Link to="/marketplace" className="btn btn-dark">See whatâ€™s fresh <ArrowRight size={17} /></Link>
          </div>
          <div className="quote-card">
            <div className="quote-mark">â€œ</div>
            <p>FairHarvest helped us find a buyer who values our Lakadong turmeric. Weâ€™re getting a fair price and planning our next crop with confidence.</p>
            <div className="quote-person">
              <div className="avatar avatar-green">P</div>
              <div><strong>Pema Lyngdoh</strong><small>Farmer, West Jaintia Hills</small></div>
              <Star size={15} fill="currentColor" />
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function Marketplace() {
  const { user, activeMode } = useAuth()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [items, setItems] = useState(isDemoMode ? demoListings.map(entry => ({ ...entry, kind: 'listing' })) : [])
  const [demands, setDemands] = useState([])
  const [loading, setLoading] = useState(!isDemoMode)
  const [loadError, setLoadError] = useState('')
  const [demandOffer, setDemandOffer] = useState(null)
  const [offerPrice, setOfferPrice] = useState('')
  const [offerQuantity, setOfferQuantity] = useState('')
  const [offerNote, setOfferNote] = useState('')
  const [offerBusy, setOfferBusy] = useState(false)
  const [offerMessage, setOfferMessage] = useState('')

  useEffect(() => {
    if (isDemoMode) return undefined
    let active = true
    const requirementRequest = user ? fetchActiveRequirements() : Promise.resolve({ data: [], error: null })
    Promise.all([fetchActiveListings(), requirementRequest]).then(([listingResult, demandResult]) => {
      if (!active) return
      if (listingResult.error || demandResult.error) setLoadError(listingResult.error?.message || demandResult.error?.message || 'Unable to load marketplace.')
      setItems((listingResult.data || []).map(entry => ({
        kind: 'listing', id: entry.id, ownerId: entry.owner_id, name: entry.produce_name, variety: entry.variety || 'Local variety',
        seller: entry.profiles?.display_name || 'FairHarvest farmer', place: [entry.village, entry.district, entry.state].filter(Boolean).join(', ') || 'Northeast India',
        price: Number(entry.asking_price_per_unit ?? entry.min_price_per_unit ?? 0), minPrice: Number(entry.min_price_per_unit), unit: entry.unit || 'kg',
        quantity: Number(entry.quantity), availability: entry.available_from, harvestDate: entry.harvest_date, image: getListingImageUrl(entry.image_paths?.[0]), status: entry.status || 'active'
      })))
      setDemands((demandResult.data || []).map(entry => ({
        kind: 'demand', id: entry.id, ownerId: entry.owner_id, name: entry.produce_name, variety: entry.variety || 'Any quality grade',
        buyer: entry.profiles?.display_name || 'FairHarvest buyer', place: entry.destination || 'Destination not provided',
        price: Number(entry.budget_per_unit || 0), unit: entry.unit || 'kg', quantity: Number(entry.quantity), requiredBy: entry.required_by,
        quality: entry.quality_requirements, delivery: entry.delivery_preference, status: entry.status || 'active'
      })))
      setLoading(false)
    }).catch(error => { if (active) { setLoadError(error.message || 'Unable to load marketplace.'); setLoading(false) } })
    return () => { active = false }
  }, [user])

  async function submitDemandOffer(event) {
    event.preventDefault()
    const quantity = Number(offerQuantity)
    const price = Number(offerPrice)
    if (!user || !demandOffer || quantity <= 0 || price < 0) { setOfferMessage('Enter a quantity and a valid non-negative price.'); return }
    setOfferBusy(true); setOfferMessage('')
    const { data: conversation, error: conversationError } = await getOrCreateRequirementConversation({ requirementId: demandOffer.id, farmerId: user.id, buyerId: demandOffer.ownerId })
    if (conversationError) { setOfferBusy(false); setOfferMessage(conversationError.message || 'Unable to open the conversation.'); return }
    const { error } = await createRequirementOffer({ conversationId: conversation.id, requirementId: demandOffer.id, farmerId: user.id, buyerId: demandOffer.ownerId, quantity, pricePerUnit: price, unit: demandOffer.unit, note: offerNote })
    setOfferBusy(false)
    if (error) { setOfferMessage(error.message || 'Unable to submit the offer.'); return }
    setOfferMessage('Offer submitted. The buyer can review it in Messages.')
  }

  const listings = activeMode === 'farmer' ? demands : items
  const visible = listings.filter(item => `${item.name} ${item.variety || ''} ${item.place}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || item.status === filter))

  return (
    <main className="page marketplace-page">
      <div className="container">
        <div className="page-heading marketplace-heading">
          <div><div className="eyebrow">Direct from the Northeast</div><h1>Marketplace</h1><p>{activeMode === 'farmer' ? 'Review buyer demand and offer the produce buyers need.' : 'Browse verified farmer harvests and contact sellers directly.'}</p><span className="market-mode-context">Viewing as {activeMode === 'farmer' ? 'Farmer' : 'Buyer'}</span></div>
          <Link to="/fasalsaathi" className="btn btn-primary">Open FasalSaathi <Bot size={16} /></Link>
        </div>
        <div className="market-toolbar marketplace-toolbar"><div className="search-shell"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search crop, variety, or location" /></div><div className="filter-shell"><Filter size={15} /><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Available / active</option><option value="negotiating">Negotiating</option><option value="closed">Closed</option></select></div></div>
        {loading && <div className="empty-state">Loading marketplace�</div>}{loadError && <div className="error-state">{loadError}</div>}
        {!loading && visible.length === 0 && <div className="empty-state"><Package size={28} /><h3>No matching {activeMode === 'farmer' ? 'buyer demand' : 'farmer listings'}</h3><p>Try another search or check back for new activity.</p></div>}
        <div className="listing-grid marketplace-card-grid">
          {visible.map(item => {
            const owned = Boolean(user && item.ownerId === user.id)
            const isDemand = item.kind === 'demand'
            return <article className={`listing-card market-listing-card ${isDemand ? 'demand-card' : ''}`} key={`${item.kind}-${item.id}`}>
              {!isDemand && <div className="listing-image"><ListingImage src={item.image} alt={`${item.name} listing`} /><span className="listing-tag">Farmer offer</span></div>}
              <div className="listing-body">
                <div className="market-card-kicker"><span>{isDemand ? 'Buyer demand' : 'Farmer offer'}</span><span className={`listing-status status-${item.status}`}>{item.status}</span></div>
                <div className="listing-header"><div><h3>{item.name}</h3><p>{item.variety}</p></div><div className="listing-price-block"><strong>?{item.price || '�'}</strong><small>per {item.unit}</small></div></div>
                <div className="listing-meta"><span><Package size={14} /> {item.quantity} {item.unit}</span><span><MapPin size={14} /> {item.place}</span>{isDemand ? item.requiredBy && <span><Clock3 size={14} /> Need by {item.requiredBy}</span> : item.harvestDate && <span><Clock3 size={14} /> Harvested {item.harvestDate}</span>}</div>
                {!isDemand && item.minPrice !== item.price && item.minPrice > 0 && <div className="listing-min-price">Minimum: ?{item.minPrice} / {item.unit}</div>}
                {isDemand && item.quality && <p className="market-card-detail">Quality: {item.quality}</p>}
                <div className="listing-footer"><span className="seller-name">{isDemand ? item.buyer : item.seller}</span>{!owned && user && isDemand && activeMode === 'farmer' ? <button type="button" className="btn btn-primary btn-small" onClick={() => { setDemandOffer(item); setOfferQuantity(String(item.quantity)); setOfferPrice(String(item.price || '')); setOfferNote(''); setOfferMessage('') }}>Make an Offer</button> : !owned && user && !isDemand && activeMode === 'buyer' ? <Link className="btn btn-primary btn-small" to={`/marketplace/${item.id}`}>Make an Offer</Link> : owned ? <Link className="text-link" to="/dashboard/farmer">Manage listing</Link> : <Link className="text-link" to="/auth">Sign in to respond</Link>}</div>
              </div>
            </article>
          })}
        </div>
        {demandOffer && <div className="offer-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDemandOffer(null) }}><div className="offer-modal" role="dialog" aria-modal="true" aria-labelledby="demand-offer-title"><button type="button" className="modal-close" onClick={() => setDemandOffer(null)} aria-label="Close offer form"><X size={18} /></button><span className="eyebrow">Buyer demand</span><h2 id="demand-offer-title">Offer on {demandOffer.name}</h2><p>Buyer budget: ?{demandOffer.price} per {demandOffer.unit}</p><form onSubmit={submitDemandOffer}><label>Price per {demandOffer.unit}<input type="number" min="0" step="0.01" required value={offerPrice} onChange={event => setOfferPrice(event.target.value)} /></label><label>Quantity ({demandOffer.unit})<input type="number" min="0.001" step="0.001" required value={offerQuantity} onChange={event => setOfferQuantity(event.target.value)} /></label><label>Message <span>(optional)</span><textarea value={offerNote} onChange={event => setOfferNote(event.target.value)} /></label>{offerMessage && <p className={offerMessage.includes('submitted') ? 'success-state' : 'error-state'}>{offerMessage}</p>}<button type="submit" className="btn btn-primary full" disabled={offerBusy}>{offerBusy ? 'Submitting�' : 'Submit Offer'}</button></form></div></div>}
      </div>
    </main>
  )
}
function ListingDetail() {
  const { id } = useParams()
  const demoItem = demoListings.find((entry) => String(entry.id) === String(id)) ?? demoListings[0]
  const [item, setItem] = useState(isDemoMode ? demoItem : null)
  const [loading, setLoading] = useState(!isDemoMode)
  const [listingError, setListingError] = useState('')
  const { user } = useAuth()
  const isBuyer = !!(user && item && item.ownerId !== user.id)
  const isSeller = !!(user && item && item.ownerId === user.id)

  // â”€â”€ Messaging â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [conversation, setConversation] = useState(null)
  const [convError, setConvError] = useState('')
  const [messages, setMessages] = useState(isDemoMode
    ? [
        { id: 'demo-msg-1', sender_id: 'farmer-demo', body: 'Hi! We can deliver this crop within 48 hours.' },
        { id: 'demo-msg-2', sender_id: 'buyer-demo', body: 'Perfect. Can we review the price and storage conditions?' },
      ]
    : [])
  const [loadedConvId, setLoadedConvId] = useState(null)
  const [messagesError, setMessagesError] = useState('')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const messagesEndRef = useRef(null)

  // â”€â”€ Offers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [offers, setOffers] = useState(isDemoMode
    ? [{ id: 'demo-offer-1', quantity: 50, unit: demoItem.unit, price_per_unit: demoItem.price, status: 'pending' }]
    : [])
  const [loadedOffersListingId, setLoadedOffersListingId] = useState(null)
  const [offersError, setOffersError] = useState('')
  const [offerQty, setOfferQty] = useState('')
  const [offerPrice, setOfferPrice] = useState('')
  const [offerNote, setOfferNote] = useState('')
  const [offerBusy, setOfferBusy] = useState(false)
  const [offerMsg, setOfferMsg] = useState('')

  // â”€â”€ Derived loading states (no setState in effects) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const convLoading = Boolean(!isDemoMode && isBuyer && !conversation && !convError)
  const messagesLoading = Boolean(!isDemoMode && conversation && loadedConvId !== conversation.id)
  const offersLoading = Boolean(!isDemoMode && item && user && loadedOffersListingId !== item.id)

  // â”€â”€ Load listing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (isDemoMode) return undefined
    let active = true
    fetchListingById(id).then(({ data, error }) => {
      if (!active) return
      setLoading(false)
      if (error) {
        setListingError(error.message)
      } else if (!data) {
        setListingError('This listing could not be found.')
      } else {
        setItem({
          id: data.id,
          ownerId: data.owner_id,
          name: data.produce_name,
          variety: data.variety || 'Local variety',
          seller: data.profiles?.display_name || 'Verified farmer',
          place: [data.village, data.district, data.state].filter(Boolean).join(', ') || 'Northeast India',
          price: Number(data.asking_price_per_unit ?? data.min_price_per_unit ?? 0),
          minPrice: Number(data.min_price_per_unit),
          unit: data.unit || 'kg',
          quantity: `${data.quantity} ${data.unit || 'kg'}`,
          freshness: 90,
          tag: 'Live listing',
          image: getListingImageUrl(data.image_paths?.[0]),
          verified: true,
          status: data.status,
        })
      }
    }).catch((error) => {
      if (!active) return
      setLoading(false)
      setListingError(error.message || 'Unable to load this listing.')
    })
    return () => { active = false }
  }, [id])

  // â”€â”€ Open conversation once listing + user are known â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (isDemoMode || !item || !user || isSeller) return undefined
    let active = true
    getOrCreateListingConversation({ listingId: item.id, buyerId: user.id, sellerId: item.ownerId })
      .then(({ data, error }) => {
        if (!active) return
        if (error) { setConvError(error.message); return }
        setConversation(data)
      })
      .catch((err) => { if (active) { setConvError(err.message || 'Unable to open conversation.') } })
    return () => { active = false }
  }, [item, user, isSeller])

  // â”€â”€ Load messages when conversation is known â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!conversation) return undefined
    let active = true
    fetchConversationMessages(conversation.id)
      .then(({ data, error }) => {
        if (!active) return
        setLoadedConvId(conversation.id)
        if (error) { setMessagesError(error.message); return }
        setMessages(data || [])
      })
      .catch((err) => {
        if (active) {
          setLoadedConvId(conversation.id)
          setMessagesError(err.message || 'Unable to load messages.')
        }
      })
    return () => { active = false }
  }, [conversation])

  // â”€â”€ Scroll to bottom on new messages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // â”€â”€ Load offers (both buyer and seller see them) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (isDemoMode || !item || !user) return undefined
    let active = true
    fetchListingOffers(item.id)
      .then(({ data, error }) => {
        if (!active) return
        setLoadedOffersListingId(item.id)
        if (error) { setOffersError(error.message); return }
        setOffers(data || [])
      })
      .catch((err) => {
        if (active) {
          setLoadedOffersListingId(item.id)
          setOffersError(err.message || 'Unable to load offers.')
        }
      })
    return () => { active = false }
  }, [item, user])

  // â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleSendMessage() {
    const text = draft.trim()
    if (!text) return
    if (isDemoMode) {
      setMessages((prev) => [...prev, { id: `demo-${Date.now()}`, sender_id: user?.id || 'buyer-demo', body: text }])
      setDraft('')
      return
    }
    if (!conversation) { setSendError('Conversation not ready. Please wait and try again.'); return }
    setSending(true)
    setSendError('')
    const { data, error } = await sendConversationMessage({ conversationId: conversation.id, senderId: user.id, body: text })
    setSending(false)
    if (error) { setSendError(error.message || 'Failed to send message.'); return }
    setMessages((prev) => [...prev, data])
    setDraft('')
  }

  function handleMessageKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() } }

  async function handleSubmitOffer(e) {
    e.preventDefault()
    if (isDemoMode) { setOfferMsg('Demo mode: offer not saved to Supabase.'); return }
    const qty = Number(offerQty)
    const price = Number(offerPrice)
    if (!Number.isFinite(qty) || qty <= 0) { setOfferMsg('Enter a valid quantity greater than zero.'); return }
    if (!Number.isFinite(price) || price < 0) { setOfferMsg('Enter a valid price.'); return }
    if (price < item.minPrice) { setOfferMsg(`Price cannot be below the seller minimum of â‚¹${item.minPrice}.`); return }
    if (!conversation) { setOfferMsg('Conversation not ready. Please wait and try again.'); return }
    setOfferBusy(true)
    setOfferMsg('')
    const { data, error } = await createOffer({
      conversationId: conversation.id,
      listingId: item.id,
      buyerId: user.id,
      sellerId: item.ownerId,
      quantity: qty,
      pricePerUnit: price,
      unit: item.unit,
      note: offerNote.trim() || null,
    })
    setOfferBusy(false)
    if (error) { setOfferMsg(error.message || 'Failed to submit offer.'); return }
    setOffers((prev) => [data, ...prev])
    setOfferQty('')
    setOfferPrice('')
    setOfferNote('')
    setOfferMsg('Offer submitted.')
  }

  async function handleOfferAction(offerId, status) {
    if (!user) return
    const { data, error } = await updateOfferStatus({ offerId, status, userId: user.id })
    if (error) { setOffersError(error.message || 'Unable to update offer.'); return }
    setOffers((prev) => prev.map((o) => o.id === offerId ? data : o))
  }

  const showConvPanel = item && (isDemoMode || user)
  const showOfferForm = item && isBuyer
  const showOfferList = item && (isBuyer || isSeller)

  return (
    <main className="page">
      <div className="container detail-layout">
        {loading && <div className="empty-state">Loading listingâ€¦</div>}
        {listingError && <div className="error-state">{listingError}</div>}
        {!loading && !listingError && !item && <div className="empty-state">This listing is not available.</div>}
        {item && <div className="listing-detail-card">
          <div className="detail-image"><ListingImage src={item.image} alt={item.name} /></div>
          <div className="detail-body">
            <div className="eyebrow">Fresh produce listing</div>
            <h1>{item.name}</h1>
            <div className="detail-meta">
              <span>{item.variety}</span>
              <span>{item.place}</span>
            </div>
            <p className="detail-copy">Direct from a verified producer in the Northeast. This listing showcases fresh, traceable produce with transparent handling and quality expectations.</p>
            <div className="detail-pricing">
              <strong>â‚¹{item.price}</strong>
              <span>per {item.unit}</span>
            </div>
            <Freshness score={item.freshness} />
          </div>
        </div>}

        {showConvPanel && (
          <div className="panel message-panel">
            <div className="panel-heading">
              <div><h2>Listing conversation</h2><p>{isDemoMode ? 'Demo conversation â€” messages are not saved.' : 'Messages are stored in Supabase and visible only to participants.'}</p></div>
            </div>
            {!isDemoMode && !user && <p className="empty-state">Sign in to join this conversation.</p>}
            {!isDemoMode && user && convLoading && <p className="empty-state msg-loading">Opening conversationâ€¦</p>}
            {!isDemoMode && user && convError && <p className="error-state">{convError}</p>}
            {(!isDemoMode && user && !convLoading && !convError && messagesLoading) && <p className="empty-state msg-loading">Loading messagesâ€¦</p>}
            {messagesError && <p className="error-state">{messagesError}</p>}
            <div className="message-list">
              {messages.length === 0 && !messagesLoading && (
                <p className="msg-empty">
                  {isSeller
                    ? (offers.length > 0
                        ? 'Select an offer below to view or reply to buyer messages.'
                        : 'No messages yet. When buyers inquire or make offers, you can chat with them here.')
                    : 'No messages yet. Start the conversation below.'}
                </p>
              )}
              {messages.map((message) => (
                <div key={message.id} className={`message-bubble ${message.sender_id === user?.id ? 'outgoing' : 'incoming'}`}>
                  <small>{message.sender_id === user?.id ? 'You' : 'Other participant'}{message.created_at ? ` · ${new Date(message.created_at).toLocaleString()}` : ''}</small>
                  <span>{message.body}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            {(isDemoMode || (user && conversation)) && (
              <div className="message-compose">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleMessageKey}
                  placeholder="Write a messageâ€¦"
                  disabled={sending}
                />
                <button type="button" className="btn btn-primary" onClick={handleSendMessage} disabled={sending}>
                  {sending ? 'Sendingâ€¦' : 'Send'}
                </button>
              </div>
            )}
            {sendError && <p className="error-state">{sendError}</p>}
          </div>
        )}

        {(showOfferForm || showOfferList || (item && isDemoMode)) && (
          <div className="panel offer-panel">
            <div className="panel-heading">
              <div><h2>Structured offer</h2><p>Price, quantity, and unit are visible to both parties. Offers are stored in Supabase.</p></div>
            </div>
            {offerMsg && <p className={offerMsg === 'Offer submitted.' ? 'success-state' : 'error-state'}>{offerMsg}</p>}
            {(showOfferForm || isDemoMode) && (
              <form className="offer-form" onSubmit={handleSubmitOffer}>
                <label className="offer-label">Quantity
                  <input type="number" min="0.001" step="0.001" value={isDemoMode ? 50 : offerQty}
                    onChange={(e) => setOfferQty(e.target.value)} placeholder="Quantity" required disabled={isDemoMode} />
                </label>
                <label className="offer-label">Price per {item.unit} (â‚¹)
                  <input type="number" min="0" step="0.01" value={isDemoMode ? item.price : offerPrice}
                    onChange={(e) => setOfferPrice(e.target.value)} placeholder={`Min â‚¹${item.minPrice}`} required disabled={isDemoMode} />
                </label>
                <label className="offer-label offer-note">Note (optional)
                  <input type="text" value={isDemoMode ? 'Interested in a direct purchase' : offerNote}
                    onChange={(e) => setOfferNote(e.target.value)} placeholder="Optional note" disabled={isDemoMode} />
                </label>
                <button type="submit" className="btn btn-primary" disabled={offerBusy}>
                  {offerBusy ? 'Submittingâ€¦' : 'Send offer'}
                </button>
              </form>
            )}
            {!isDemoMode && !isBuyer && !isSeller && item && user && (
              <p className="empty-state" style={{padding:'1rem 0'}}>Sign in as a buyer to make an offer.</p>
            )}
            {offersLoading && <p className="empty-state" style={{padding:'.75rem 0'}}>Loading offersâ€¦</p>}
            {offersError && <p className="error-state">{offersError}</p>}
            {(offers.length > 0 || isDemoMode) && (
              <div className="offer-list">
                {offers.map((offer) => (
                  <div key={offer.id} className="offer-item">
                    <div className="offer-item-main">
                      <strong>{offer.quantity} {offer.unit || item.unit}</strong>
                      <span>â‚¹{offer.price_per_unit} / {offer.unit || item.unit}</span>
                      {offer.note && <small className="offer-note-text">{offer.note}</small>}
                    </div>
                    <div className="offer-actions">
                      <span className={`offer-status offer-status--${offer.status}`}>{offer.status}</span>
                      {!isDemoMode && ['pending', 'countered'].includes(offer.status) && isSeller && (
                        <>
                          <button type="button" className="btn btn-small btn-primary" onClick={() => handleOfferAction(offer.id, 'accepted')}>Accept</button>
                          <button type="button" className="btn btn-small btn-outline" onClick={() => handleOfferAction(offer.id, 'countered')}>Counter</button>
                          <button type="button" className="btn btn-small btn-outline" onClick={() => handleOfferAction(offer.id, 'rejected')}>Reject</button>
                        </>
                      )}
                      {!isDemoMode && ['pending', 'countered'].includes(offer.status) && isBuyer && (
                        <button type="button" className="btn btn-small btn-outline" onClick={() => handleOfferAction(offer.id, 'withdrawn')}>Withdraw</button>
                      )}
                      {!isDemoMode && isSeller && offer.conversation_id && (
                        <button
                          type="button"
                          className="btn btn-small btn-outline"
                          onClick={() => setConversation({ id: offer.conversation_id })}
                        >
                          {conversation?.id === offer.conversation_id ? 'Active chat' : 'Chat'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

function Dashboard({ role }) {
  const farmer = role === 'farmer'
  const { user, demo } = useAuth()
  const [listings, setListings] = useState([])
  const [listingsLoading, setListingsLoading] = useState(Boolean(farmer && user && !demo))
  const [listingsError, setListingsError] = useState('')
  const [editingListing, setEditingListing] = useState(null)
  const [requirements, setRequirements] = useState([])
  const [requirementsLoading, setRequirementsLoading] = useState(Boolean(!farmer && user && !demo))
  const [requirementsError, setRequirementsError] = useState('')

  useEffect(() => {
    if (!farmer || demo || !user) return undefined
    let active = true
    async function loadListings() {
      try {
        const { data, error } = await fetchOwnedListings(user.id)
        if (!active) return
        if (error) {
          setListingsError(error.message)
          setListings([])
        } else {
          setListings(data || [])
        }
      } catch (error) {
        if (!active) return
        setListingsError(error.message || 'Unable to load your listings.')
        setListings([])
      } finally {
        if (active) setListingsLoading(false)
      }
    }

    loadListings()

    return () => { active = false }
  }, [farmer, demo, user])

  useEffect(() => {
    if (farmer || demo || !user) return undefined
    let active = true
    async function loadRequirements() {
      try {
        const { data, error } = await fetchRequirements(user.id)
        if (!active) return
        if (error) {
          setRequirementsError(error.message)
          setRequirements([])
        } else {
          setRequirements(data || [])
        }
      } catch (error) {
        if (!active) return
        setRequirementsError(error.message || 'Unable to load your requirements.')
        setRequirements([])
      } finally {
        if (active) setRequirementsLoading(false)
      }
    }
    loadRequirements()
    return () => { active = false }
  }, [farmer, demo, user])

  async function refreshRequirements() {
    if (!user || demo) return { error: new Error('A live authenticated session is required to refresh requirements.') }
    setRequirementsLoading(true)
    setRequirementsError('')
    try {
      const { data, error } = await fetchRequirements(user.id)
      if (error) {
        setRequirementsError(error.message)
        return { error }
      }

      setRequirements(data || [])
      return { error: null }
    } catch (error) {
      const refreshError = error instanceof Error ? error : new Error('Unable to refresh your requirements.')
      setRequirementsError(refreshError.message)
      return { error: refreshError }
    } finally {
      setRequirementsLoading(false)
    }
  }

  async function handleWithdrawRequirement(id) {
    if (!user || demo) return
    const result = await withdrawRequirement(id, user.id)
    if (result.error) {
      setRequirementsError(result.error.message || 'Unable to withdraw this requirement.')
      return
    }
    await refreshRequirements()
  }

  async function refreshListings() {
    if (!user || demo) return { error: new Error('A live authenticated session is required to refresh listings.') }
    setListingsLoading(true)
    setListingsError('')
    try {
      const { data, error } = await fetchOwnedListings(user.id)
      if (error) {
        setListingsError(error.message)
        return { error }
      }
      setListings(data || [])
      return { error: null }
    } catch (error) {
      const refreshError = error instanceof Error ? error : new Error('Unable to refresh your listings.')
      setListingsError(refreshError.message)
      return { error: refreshError }
    } finally {
      setListingsLoading(false)
    }
  }

  const stats = farmer
    ? [['Active listings', String(listings.filter((listing) => listing.status === 'active').length)], ['Freshness score', 'Not calculated'], ['Open offers', 'Not calculated']]
    : [['Saved requirements', demo ? '\u2014' : String(requirements.filter((r) => r.status === 'active').length)], ['Total requirements', demo ? '\u2014' : String(requirements.length)]]
  const displayName = user?.user_metadata?.display_name || user?.email || (demo ? 'Demo farmer workspace' : 'Farmer workspace')

  return (
    <main className="dashboard">
      <div className="container dashboard-layout">
        <aside className="dashboard-sidebar">
          <div className="dashboard-user">
            <div className="avatar avatar-large">{farmer ? displayName.charAt(0).toUpperCase() : 'B'}</div>
            <div>
              <strong>{farmer ? displayName : 'Buyer workspace'}</strong>
              <small>{farmer ? 'Farmer dashboard' : 'Buyer dashboard'}</small>
            </div>
          </div>
          <div className="side-list">
            <button type="button" className="side-item active">Overview</button>
            <button type="button" className="side-item">Listings</button>
            <button type="button" className="side-item">Messages</button>
          </div>
        </aside>
        <div className="dashboard-content">
          <div className="stat-grid">
            {stats.map(([label, value]) => (
              <div key={label} className="stat-card">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {farmer && (
            <div className="advisor-entry panel">
              <div>
                <div className="eyebrow"><Bot size={14} /> Farmer decision support</div>
                <h2>FasalSaathi â€” Your Agricultural Companion</h2>
                <p>Use one guided Sell/Buy agent with voice, photo, or manual details.</p>
              </div>
              <Link to="/fasalsaathi" className="btn btn-primary">Open FasalSaathi <ArrowRight size={16} /></Link>
            </div>
          )}
          {farmer && (
            <div className="panel data-form">
              <div className="panel-heading">
                <div>
                  <h2>Your listings</h2>
                  <p>{demo ? 'Demo mode: live farmer listings are not loaded or mixed with sample data.' : 'Listings loaded from your authenticated Supabase account.'}</p>
                </div>
              </div>
              {demo && <p className="empty-state">Demo mode is active. Sign in with Supabase to view real farmer listings.</p>}
              {!demo && !user && <p className="empty-state">Sign in is required to load your farmer listings.</p>}
              {!demo && user && listingsLoading && <p className="empty-state">Loading your listingsâ€¦</p>}
              {!demo && user && listingsError && <p className="error-state">{listingsError}</p>}
              {!demo && user && !listingsLoading && !listingsError && listings.length === 0 && (
                <p className="empty-state">You have not created any listings yet.</p>
              )}
              {!demo && user && !listingsLoading && !listingsError && listings.length > 0 && (
                <div className="listing-card-grid">
                  {listings.map((listing) => (
                    <article className="farmer-listing-card" key={listing.id}>
                      <div className="farmer-listing-image">
                        <ListingImage src={getListingImageUrl(listing.image_paths?.[0])} alt={`${listing.produce_name} listing`} />
                        <span className="status-pill">{listing.status}</span>
                      </div>
                      <div className="farmer-listing-body">
                        <div className="farmer-listing-heading">
                          <div>
                            <strong>{listing.produce_name}</strong>
                            <span>{listing.variety || 'Variety not specified'}</span>
                          </div>
                          <div className="farmer-listing-price">
                            <strong>â‚¹{listing.asking_price_per_unit ?? listing.min_price_per_unit}</strong>
                            <small>/{listing.unit}</small>
                          </div>
                        </div>
                        <div className="farmer-listing-meta">
                          <span><Package size={14} /> {listing.quantity} {listing.unit}</span>
                          <span>Harvested {listing.harvest_date}</span>
                          {(listing.village || listing.district || listing.state) && <span><MapPin size={14} /> {[listing.village, listing.district, listing.state].filter(Boolean).join(', ')}</span>}
                        </div>
                        {listing.asking_price_per_unit != null && listing.asking_price_per_unit !== listing.min_price_per_unit && (
                          <small className="farmer-listing-minimum">Minimum accepted: â‚¹{listing.min_price_per_unit} / {listing.unit}</small>
                        )}
                        <button type="button" className="btn btn-outline btn-small" onClick={() => setEditingListing(listing)}>Edit listing</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
          {!farmer && (
            <div className="advisor-entry panel">
              <div>
                <div className="eyebrow"><Bot size={14} /> Buyer decision support</div>
                <h2>FasalSaathi â€” Your Agricultural Companion</h2>
                <p>Use the unified agent with voice, photo, or manual buying details.</p>
              </div>
              <Link to="/fasalsaathi" className="btn btn-primary">Open FasalSaathi <ArrowRight size={16} /></Link>
            </div>
          )}
          {!farmer && (
            <div className="panel data-form">
              <div className="panel-heading">
                <div>
                  <h2>Your requirements</h2>
                  <p>{demo ? 'Demo mode: live buyer requirements are not loaded.' : 'Requirements loaded from your authenticated Supabase account.'}</p>
                </div>
                {!demo && user && requirementsError && (
                  <button type="button" className="btn btn-outline btn-small" onClick={refreshRequirements}>Retry</button>
                )}
              </div>
              {demo && <p className="empty-state">Demo mode is active. Sign in with Supabase to view your saved requirements.</p>}
              {!demo && !user && <p className="empty-state">Sign in is required to load your requirements.</p>}
              {!demo && user && requirementsLoading && <p className="empty-state">Loading your requirements...</p>}
              {!demo && user && requirementsError && <p className="error-state">{requirementsError}</p>}
              {!demo && user && !requirementsLoading && !requirementsError && requirements.length === 0 && (
                <p className="empty-state">You have not saved any buying requirements yet.</p>
              )}
              {!demo && user && !requirementsLoading && !requirementsError && requirements.length > 0 && (
                <div className="listing-card-grid">
                  {requirements.map((req) => (
                    <article className="farmer-listing-card" key={req.id}>
                      <div className="farmer-listing-body">
                        <div className="farmer-listing-heading">
                          <div>
                            <strong>{req.produce_name}</strong>
                            <span>{req.variety || 'Any variety'}</span>
                          </div>
                          <div className="farmer-listing-price">
                            <strong>&#8377;{req.budget_per_unit}</strong>
                            <small>/{req.unit} budget</small>
                          </div>
                        </div>
                        <div className="farmer-listing-meta">
                          <span><Package size={14} /> {req.quantity} {req.unit}</span>
                          <span><MapPin size={14} /> {req.destination}</span>
                          {req.required_by && <span><Clock3 size={14} /> Required by {req.required_by}</span>}
                          {req.quality_requirements && <span>{req.quality_requirements}</span>}
                        </div>
                        <span className="status-pill" style={{marginTop:'auto',alignSelf:'flex-start'}}>{req.status}</span>
                        {req.status === 'active' && (
                          <button type="button" className="btn btn-outline btn-small" onClick={() => handleWithdrawRequirement(req.id)}>
                            Withdraw requirement
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
          <DataForm
            key={editingListing?.id || 'new-listing'}
            farmer={farmer}
            editingListing={editingListing}
            onListingCreated={farmer ? refreshListings : undefined}
            onListingUpdated={refreshListings}
            onRequirementCreated={!farmer ? refreshRequirements : undefined}
            onCancelEdit={() => setEditingListing(null)}
          />
        </div>
      </div>
    </main>
  )
}

function DataForm({ farmer, editingListing, onListingCreated, onListingUpdated, onRequirementCreated, onCancelEdit }) {
  const [values, setValues] = useState(() => editingListing
    ? {
        produce_name: editingListing.produce_name,
        variety: editingListing.variety || '',
        quantity: String(editingListing.quantity),
        unit: editingListing.unit,
        minPrice: String(editingListing.min_price_per_unit),
        price: String(editingListing.asking_price_per_unit ?? editingListing.min_price_per_unit),
        destination: '',
      }
    : { produce_name: '', variety: '', quantity: '', unit: 'kg', minPrice: '', price: '', destination: '' })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(getListingImageUrl(editingListing?.image_paths?.[0]) || '')
  const photoUrlRef = useRef(null)
  const { user } = useAuth()

  useEffect(() => {
    return () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
    }
  }, [])

  const handlePhotoChange = (event) => {
    const selectedPhoto = event.target.files?.[0] || null
    if (selectedPhoto && (!selectedPhoto.type.startsWith('image/') || selectedPhoto.size > 5 * 1024 * 1024)) {
      setError('Choose an image file no larger than 5 MB.')
      return
    }
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
    photoUrlRef.current = selectedPhoto ? URL.createObjectURL(selectedPhoto) : null
    setPhoto(selectedPhoto)
    setPhotoPreview(photoUrlRef.current || getListingImageUrl(editingListing?.image_paths?.[0]) || '')
  }

  async function submit(event) {
    event.preventDefault()
    if (!user) {
      setError('Sign in to save this record.')
      return
    }

    const quantity = Number(values.quantity)
    const price = Number(values.price)
    const minPrice = farmer ? Number(values.minPrice || values.price) : null
    if (editingListing && editingListing.owner_id !== user.id) {
      setError('You can only edit listings owned by your account.')
      return
    }
    if (!values.produce_name.trim()) {
      setError('Enter a produce name.')
      return
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError('Quantity must be greater than zero.')
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Enter a valid asking price.')
      return
    }
    if (farmer && (!Number.isFinite(minPrice) || minPrice < 0 || minPrice > price)) {
      setError('Minimum price must be zero or more and no greater than the asking price.')
      return
    }

    setBusy(true)
    setError('')
    setResult('')

    let uploadedImagePath = null
    if (farmer && photo) {
      try {
        const upload = await uploadListingImage(photo, user.id)
        if (upload.error) {
          setError(`Photo upload failed: ${upload.error.message}`)
          setBusy(false)
          return
        }
        uploadedImagePath = upload.path
      } catch (uploadError) {
        setError(`Photo upload failed: ${uploadError.message || 'Unable to upload the selected image.'}`)
        setBusy(false)
        return
      }
    }

    const payload = farmer
      ? {
          produce_name: values.produce_name,
          variety: values.variety || null,
          quantity,
          unit: values.unit,
          min_price_per_unit: minPrice,
          asking_price_per_unit: price,
          harvest_date: editingListing ? editingListing.harvest_date : new Date().toISOString().slice(0, 10),
          status: editingListing ? editingListing.status : 'active',
          ...(uploadedImagePath ? { image_paths: [uploadedImagePath] } : {}),
        }
      : { produce_name: values.produce_name, variety: values.variety || null, quantity: Number(values.quantity), unit: values.unit, budget_per_unit: Number(values.price), destination: values.destination, status: 'active' }

    try {
      const response = farmer && editingListing
        ? await updateListing(editingListing.id, payload, user.id)
        : farmer
          ? await createListing(payload, user.id)
          : await saveRequirement(payload, user.id)

      if (response?.error) {
        setError(response.error.message)
        return
      }

      if (farmer && editingListing && onListingUpdated) {
        const refresh = await onListingUpdated()
        if (refresh?.error) {
          setResult('Listing updated, but your listings could not be refreshed. Reload the page to see it.')
          return
        }
      } else if (farmer && onListingCreated) {
        const refresh = await onListingCreated()
        if (refresh?.error) {
          setResult('Listing saved, but your listings could not be refreshed. Reload the page to see it.')
          if (!editingListing) {
            setValues({ produce_name: '', variety: '', quantity: '', unit: 'kg', minPrice: '', price: '', destination: '' })
          }
          return
        }
      }

      setResult(editingListing ? 'Listing updated.' : farmer ? 'Listing saved and published.' : 'Requirement saved.')
      if (!farmer && !editingListing && onRequirementCreated) {
        await onRequirementCreated()
      }
      if (!editingListing) {
        setValues({ produce_name: '', variety: '', quantity: '', unit: 'kg', minPrice: '', price: '', destination: '' })
      }
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
      photoUrlRef.current = null
      setPhoto(null)
      setPhotoPreview(editingListing
        ? getListingImageUrl(uploadedImagePath || editingListing.image_paths?.[0]) || ''
        : '')
    } catch (submitError) {
      setError(submitError.message || 'Unable to save this record.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel data-form">
      <div className="panel-heading">
        <div>
          <h2>{editingListing ? 'Edit listing' : farmer ? 'Publish a new listing' : 'Add a buying requirement'}</h2>
          <p>{farmer ? 'Live data is saved to your Supabase account.' : 'Tell farmers what you are looking for.'}</p>
        </div>
      </div>
      <form onSubmit={submit} className="form-grid">
        <input required value={values.produce_name} onChange={(event) => setValues({ ...values, produce_name: event.target.value })} placeholder="Produce name" />
        <input value={values.variety} onChange={(event) => setValues({ ...values, variety: event.target.value })} placeholder="Variety (optional)" />
        <input required type="number" min="0.001" step="0.001" value={values.quantity} onChange={(event) => setValues({ ...values, quantity: event.target.value })} placeholder="Quantity" />
        {farmer && <input required type="number" min="0" step="0.01" value={values.minPrice} onChange={(event) => setValues({ ...values, minPrice: event.target.value })} placeholder="Minimum price / unit" />}
        <input required type="number" min="0" step="0.01" value={values.price} onChange={(event) => setValues({ ...values, price: event.target.value })} placeholder={farmer ? 'Asking price / unit' : 'Budget / unit'} />
        {!farmer && <input required value={values.destination} onChange={(event) => setValues({ ...values, destination: event.target.value })} placeholder="Delivery destination" />}
        {farmer && (
          <div className="photo-field">
            <label htmlFor="listing-photo">Produce photo</label>
            <input id="listing-photo" type="file" accept="image/*" onChange={handlePhotoChange} />
            {photoPreview && <img className="photo-preview" src={photoPreview} alt="Selected produce preview" />}
            <small>Storage upload is not configured, so this preview is not saved with the listing.</small>
          </div>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? 'Savingâ€¦' : editingListing ? 'Save changes' : farmer ? 'Publish listing' : 'Save requirement'} <ArrowRight size={15} />
        </button>
        {editingListing && <button type="button" className="btn btn-outline" disabled={busy} onClick={onCancelEdit}>Cancel</button>}
      </form>
      {result && <p className="success-state">{result}</p>}
      {error && <p className="error-state">{error}</p>}
    </div>
  )
}

function Auth() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [accountType, setAccountType] = useState(searchParams.get('role') === 'buyer' ? 'buyer' : 'both')
  const [location, setLocation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [authMethod, setAuthMethod] = useState('password')
  const [signup, setSignup] = useState(searchParams.get('join') === 'true' || searchParams.has('role'))
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const { demo } = useAuth()

  function resetFeedback() { setErrors({}); setMessage('') }
  function ensureSupabase() { if (demo || !supabase) { setErrors({ form: 'Authentication is unavailable until Supabase is configured.' }); return false } return true }

  async function signIn(event) {
    event.preventDefault()
    resetFeedback()
    const nextErrors = validateLogin({ email, password })
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    if (!ensureSupabase()) return
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) { setErrors({ form: error.message }); return }
    navigate('/', { replace: true })
  }

  async function signUp(event) {
    event.preventDefault()
    resetFeedback()
    const nextErrors = validateRegistration({ email, fullName, password, confirmPassword, accountType })
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    if (!ensureSupabase()) return
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), display_name: fullName.trim(), account_type: accountType, location: location.trim(), role: accountType === 'buyer' ? 'buyer' : 'farmer' } },
    })
    setBusy(false)
    if (error) { setErrors({ form: error.message }); return }
    if (data.session) {
      navigate('/', { replace: true })
    } else {
      setMessage('Account registered. Check your email and verify your address before signing in.')
    }
  }

  async function sendRecovery(event) {
    event.preventDefault()
    resetFeedback()
    const emailError = validateLogin({ email, password: 'present' }).email
    if (emailError) { setErrors({ email: emailError }); return }
    if (!ensureSupabase()) return
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth?reset=true` })
    setBusy(false)
    setErrors(error ? { form: error.message } : {})
    if (!error) setMessage('If an account exists for this email, a password reset link has been sent.')
  }

  async function updatePassword(event) {
    event.preventDefault()
    if (!ensureSupabase()) return
    const nextErrors = password.length >= 8 ? {} : { password: 'Use at least 8 characters.' }
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setErrors({ form: error.message })
    else { setMessage('Password updated. You can now continue.'); navigate('/', { replace: true }) }
  }

  const resetMode = searchParams.get('reset') === 'true'
  return (
    <main className="auth-page">
      <div className="auth-card auth-card-wide">
        <Logo />
        <div className="auth-icon"><ShieldCheck size={25} /></div>
        <h1>{resetMode ? 'Set a new password' : signup ? 'Join FairHarvest' : 'Welcome back'}</h1>
        <p>{resetMode ? 'Choose a strong new password for your account.' : signup ? 'Create an account for your harvest and market.' : 'Sign in to manage your harvest, requirements, and profile.'}</p>

        {resetMode ? (
          <form onSubmit={updatePassword}>
            <PasswordField label="New password" value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword(value => !value)} />
            <button className="btn btn-primary full" disabled={busy}>{busy ? 'Updating…' : 'Update password'} <ArrowRight size={16} /></button>
          </form>
        ) : authMethod === 'otp' ? (
          <form onSubmit={sendRecovery}><EmailField value={email} onChange={setEmail} /><button className="btn btn-primary full" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'} <ArrowRight size={16} /></button></form>
        ) : (
          <form onSubmit={signup ? signUp : signIn}>
            {signup && (
              <>
                <label>Full name<input required autoComplete="name" value={fullName} onChange={event => { setFullName(event.target.value); setErrors(current => ({ ...current, fullName: undefined })) }} placeholder="Your full name" /></label>
                {errors.fullName && <p className="field-error">{errors.fullName}</p>}
                <fieldset className="account-type-field"><legend>Account type</legend><div>{[['farmer','Farmer'],['buyer','Buyer'],['both','Both']].map(([value,label]) => <label key={value}><input type="radio" name="accountType" checked={accountType === value} onChange={() => setAccountType(value)} /> {label}</label>)}</div></fieldset>
                {errors.accountType && <p className="field-error">{errors.accountType}</p>}
                <label>Location <span>(optional)</span><input value={location} onChange={event => setLocation(event.target.value)} autoComplete="address-level2" placeholder="District or city" /></label>
              </>
            )}
            <EmailField value={email} onChange={setEmail} />
            {errors.email && <p className="field-error">{errors.email}</p>}
            <PasswordField value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword(value => !value)} />
            {signup && <small className="password-hint">At least 8 characters, including a letter and number.</small>}
            {errors.password && <p className="field-error">{errors.password}</p>}
            {signup && <><PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} show={showPassword} onToggle={() => setShowPassword(value => !value)} />{errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}</>}
            <button type="submit" disabled={busy} className="btn btn-primary full">{busy ? (signup ? 'Creating account…' : 'Signing in…') : (signup ? 'Create account' : 'Sign in')} <ArrowRight size={16} /></button>
          </form>
        )}

        {message && <p className="success-state">{message}</p>}
        {errors.form && <p className="error-state">{errors.form}</p>}
        {!resetMode && <div className="auth-switches">
          {authMethod === 'password' && <button type="button" className="text-link" onClick={() => { setSignup(value => !value); resetFeedback() }}>{signup ? 'Already have an account? Sign in' : 'Need an account? Join FairHarvest'}</button>}
          {authMethod === 'password' && !signup && <button type="button" className="text-link" onClick={() => { setAuthMethod('otp'); resetFeedback() }}>Forgot password?</button>}
          {authMethod === 'otp' && <button type="button" className="text-link" onClick={() => setAuthMethod('password')}>Back to sign in</button>}
        </div>}
        <small className="auth-note">Passwords are handled by Supabase Auth. Never share your password.</small>
      </div>
    </main>
  )
}

function MessagesPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [messageError, setMessageError] = useState('')

  async function loadInbox() {
    if (!user) return
    setError('')
    const { data, error: loadError } = await fetchConversations(user.id)
    setLoading(false)
    if (loadError) { setError(loadError.message || 'Unable to load conversations.'); return }
    setConversations(data || [])
  }

  // Load once when the authenticated user changes; manual refresh also calls loadInbox.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadInbox() }, [user])

  async function openConversation(conversation) {
    setActiveId(conversation.id); setMessages([]); setMessageError('')
    const { data, error: loadError } = await fetchConversationMessages(conversation.id)
    if (loadError) { setMessageError(loadError.message || 'Unable to load messages.'); return }
    setMessages(data || [])
  }

  async function sendMessage(event) {
    if (event) event.preventDefault()
    const body = draft.trim()
    if (!activeId || !body || !user) return
    setSending(true); setMessageError('')
    const { data, error: sendError } = await sendConversationMessage({ conversationId: activeId, senderId: user.id, body })
    setSending(false)
    if (sendError) { setMessageError(sendError.message || 'Unable to send message.'); return }
    setMessages(current => [...current, data]); setDraft('')
    loadInbox()
  }

  const activeConversation = conversations.find(conversation => conversation.id === activeId)
  return <main className="page messages-page"><div className="container"><div className="page-heading"><div><div className="eyebrow">Trade conversations</div><h1>Messages</h1><p>Your persistent offer and marketplace conversations.</p></div></div>{error && <div className="error-state">{error}</div>}<div className="messages-layout"><aside className="conversation-list"><div className="conversation-list-heading"><strong>Inbox</strong><button type="button" className="text-link" onClick={loadInbox}>Refresh</button></div>{loading && <div className="empty-state compact">Loading conversations�</div>}{!loading && conversations.length === 0 && <div className="empty-state compact"><h3>No conversations yet</h3><p>Make an offer or contact a listing owner to start one.</p></div>}{conversations.map(conversation => { const listing = conversation.listing || conversation.demand; return <button type="button" key={conversation.id} className={`conversation-row ${activeId === conversation.id ? 'active' : ''}`} onClick={() => openConversation(conversation)}><span className="conversation-avatar">{String(listing?.produce_name || 'FH').slice(0, 2).toUpperCase()}</span><span><strong>{listing?.produce_name || 'Marketplace conversation'}</strong><small>{conversation.latest_message?.body || 'No messages yet'}</small></span></button> })}</aside><section className="conversation-panel">{activeConversation ? <><div className="conversation-header"><div><span className="conversation-eyebrow">Conversation</span><strong>{activeConversation.listing?.produce_name || activeConversation.demand?.produce_name || 'Marketplace listing'}</strong></div></div><div className="message-history">{messages.map(message => <div key={message.id} className={`message-bubble ${message.sender_id === user?.id ? 'own' : 'other'}`}><p>{message.body}</p><time>{message.created_at ? new Date(message.created_at).toLocaleString() : 'Just now'}</time></div>)}</div>{messageError && <div className="error-state conversation-error">{messageError}</div>}<form className="message-composer" onSubmit={sendMessage}><textarea value={draft} rows="2" placeholder="Write a message�" onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) sendMessage(event) }} /><button type="submit" className="btn btn-primary" disabled={sending || !draft.trim()}>{sending ? 'Sending�' : 'Send'}</button></form></> : <div className="conversation-placeholder"><h2>Select a conversation</h2><p>Choose one from your inbox to view messages.</p></div>}</section></div></div></main>
}
function EmailField({ value, onChange }) {
  return <label>Email address<input required type="email" autoComplete="email" value={value} onChange={event => onChange(event.target.value)} placeholder="you@example.com" /></label>
}

function PasswordField({ label = 'Password', value, onChange, show, onToggle }) {
  return <label>{label}<span className="password-input"><input required type={show ? 'text' : 'password'} minLength={8} autoComplete={label === 'Password' ? 'current-password' : 'new-password'} value={value} onChange={event => onChange(event.target.value)} placeholder="At least 8 characters" /><button type="button" aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} onClick={onToggle}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
}

function ProfilePage() {
  const navigate = useNavigate()
  const { user, profile, profileError, refreshProfile, activeMode, signOut } = useAuth()
  const [fullName, setFullName] = useState(profile?.display_name || profile?.full_name || '')
  const [location, setLocation] = useState(profile?.location || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function saveProfile(event) {
    event.preventDefault()
    setError(''); setMessage('')
    const cleanName = fullName.trim()
    if (cleanName.length < 2) { setError('Enter your full name.'); return }
    setSaving(true)
    const { error: saveError } = await supabase.from('profiles').update({ display_name: cleanName, full_name: cleanName, location: location.trim() }).eq('id', user.id).select('id').single()
    if (saveError) { setSaving(false); setError(saveError.message); return }
    await refreshProfile()
    setSaving(false)
    setMessage('Profile saved to your account.')
  }

  async function handleSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  const displayName = profile?.full_name || profile?.display_name || user?.email || 'FairHarvest member'
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()

  return (
    <main className="page profile-page">
      <div className="container profile-container">
        <section className="profile-hero">
          <div className="profile-avatar-large">{initials}</div>
          <div className="profile-identity"><span className="eyebrow">Your FairHarvest account</span><h1>{displayName}</h1><p>{user?.email}</p></div>
          <span className={`profile-mode-badge ${activeMode}`}><Sprout size={15} /> Active {activeMode === 'farmer' ? 'Farmer' : 'Buyer'} mode</span>
        </section>
        <div className="profile-layout">
          <form className="profile-card profile-edit-card" onSubmit={saveProfile}>
            <div className="profile-card-heading"><div><span className="profile-card-icon"><UserCircle size={20} /></span><div><h2>Personal information</h2><p>Details used across your FairHarvest workspace.</p></div></div></div>
            <div className="profile-fields">
              <label>Full name<input value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" /></label>
              <label>Location <span>(optional)</span><input value={location} onChange={event => setLocation(event.target.value)} autoComplete="address-level2" placeholder="District or village" /></label>
            </div>
            {profileError && <p className="error-state">{profileError}</p>}{error && <p className="error-state">{error}</p>}{message && <p className="success-state">{message}</p>}
            <div className="profile-actions"><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save profile'} <ArrowRight size={16} /></button></div>
          </form>
          <aside className="profile-card profile-account-card">
            <div className="profile-card-heading"><div><span className="profile-card-icon"><ShieldCheck size={20} /></span><div><h2>Account</h2><p>Identity and workspace details.</p></div></div></div>
            <dl><div><dt>Email</dt><dd>{user?.email || 'Not available'}</dd></div><div><dt>Account type</dt><dd>{profile?.account_type || 'both'}</dd></div><div><dt>Workspace</dt><dd>{activeMode === 'farmer' ? 'Farmer' : 'Buyer'}</dd></div></dl>
            <div className="profile-security"><strong>Account security</strong><p>Your password and sign-in sessions are managed securely by Supabase.</p><button type="button" className="btn btn-outline profile-signout" onClick={handleSignOut}><LogOut size={16} /> Sign out</button></div>
          </aside>
        </div>
      </div>
    </main>
  )
}

function AssistantResult({ result, selling, onRevise }) {
  const scenarios = selling ? result.calculated : [result.calculated.current, ...result.calculated.alternatives]
  const incompleteCosts = selling && scenarios.some(scenario => scenario.costsComplete === false)
  const provisional = selling && (!result.marketEvidence?.available || incompleteCosts)
  return (
    <div className="assistant-results">
      <div className="result-meta">
        <span className={result.live ? 'live-pill' : 'demo-pill'}>{result.live ? 'Live AI explanation' : 'Limited analysis'}</span>
        <span>{result.dataSource}</span>
        <span>Retrieved {new Date(result.dataTimestamp).toLocaleString()}</span>
      </div>
      <div className="panel result-summary">
        <div className="assistant-orb"><Bot size={22} /></div>
        <div><h2>{selling && result.recommendation?.label ? result.recommendation.label : (provisional ? 'Provisional recommendation' : (result.explanation?.summary || 'Scenario comparison'))}</h2><p>{provisional ? 'The available information is not sufficient for a definitive sell-or-wait recommendation. Review the assumptions and conditions below before deciding.' : (result.recommendation?.rationale || result.explanation?.recommendation || 'Review the evidence, assumptions, and risks below.')}</p></div>
      </div>
      {selling && <div className="evidence-panel panel">
        <h3>Market evidence</h3>
        {result.marketEvidence?.available && result.marketEvidence.observations?.length
          ? <div className="evidence-list">{result.marketEvidence.observations.map((observation, index) => <div key={`${observation.market}-${observation.observationDate}-${index}`}><strong>{observation.market || 'Market not provided'}</strong><span>{observation.commodity || 'Commodity not provided'} Â· {observation.observationDate || 'Date unavailable'} Â· modal {observation.modalPrice ?? 'n/a'} {observation.priceUnit}</span></div>)}</div>
          : <p>{result.marketEvidence?.message || 'Market data unavailable. This analysis uses farmer-provided inputs only.'}</p>}
      </div>}
      <div className="scenario-grid">
        {scenarios.map((scenario, index) => (
          <div key={scenario.id || scenario.label || index} className={`scenario-card ${index === 0 ? 'recommended' : ''}`}>
            <h3>{scenario.label || 'Option'}</h3>
            <p className="scenario-assumption">{scenario.priceAssumption || scenario.quotedBy || 'User-provided assumption'}</p>
            <ul><li>Gross value: {scenario.grossRevenue == null && scenario.produceCost == null ? 'Unavailable' : `â‚¹${scenario.grossRevenue ?? scenario.produceCost} (${scenario.quantity ?? ''} ${scenario.unit || ''} at â‚¹${scenario.assumedPricePerUnit ?? scenario.pricePerUnit ?? ''}/${scenario.priceUnit || scenario.unit || 'unit'})`}</li><li>Costs: {scenario.costStatus || (scenario.knownCosts == null && scenario.netProceeds == null ? 'Unavailable' : `â‚¹${scenario.knownCosts ?? scenario.deliveredCost}`)}</li><li>Net: {scenario.netProceeds == null && scenario.costPerUnit == null ? 'Unavailable â€” required costs are missing' : `â‚¹${scenario.netProceeds ?? scenario.costPerUnit}`}</li></ul>
            <p>{scenario.freshnessConcern || scenario.risks?.[0] || 'No major risks flagged.'}</p>
          </div>
        ))}
      </div>
      {selling && result.transport && <div className="panel evidence-panel"><h3>Transport cost</h3><p>{result.transport.status === 'unavailable' ? 'Unavailable â€” no verified quote or configured rate was provided. Net proceeds may be incomplete.' : `${result.transport.status === 'estimated' ? 'Estimated' : 'Farmer-provided'}: â‚¹${result.transport.amount} ${result.transport.currency} (${result.transport.basis}).`}</p></div>}
      <div className="panel risk-panel"><h3>Risks and uncertainty</h3><p>{result.explanation?.uncertainty || 'Evidence is limited. No future price or shelf-life guarantee is provided.'}</p><ul>{(result.explanation?.followUpQuestions || ['What additional evidence could change this decision?']).map(question => <li key={question}>{question}</li>)}</ul></div>
      <button type="button" className="btn btn-outline" onClick={onRevise}>Revise details</button>
    </div>
  )
}

function Assistant({ mode }) {
  const selling = mode === 'sell'
  const initialInput = { produce: '', variety: '', quantity: '', unit: 'kg', harvestDate: '', qualityGrade: 'not sure', cropStatus: 'harvested', state: '', district: '', nearestMarket: '', currentOffer: '', transportCost: '', transportQuote: '', handlingCost: '', storageCostPerDay: '', packagingCost: '', commissionCost: '', storageConditions: '', storageCapacity: '', minimumPrice: '', sellingDeadline: '', confirmedBuyer: 'unknown', destination: '', requiredBy: '', qualityRequirements: '', alternativeOffers: [] }
  const [input, setInput] = useState(initialInput)
  const [reviewing, setReviewing] = useState(false)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { session } = useAuth()

  function update(key, value) { setInput(previous => ({ ...previous, [key]: value })) }
  function validate() {
    const errors = validateCommonInput(input, mode)
    return errors
  }
  async function submit(event) {
    event.preventDefault()
    setError('')
    const errors = validate()
    if (errors.length) { setError(errors.join(' ')); return }
    if (!reviewing) { setReviewing(true); return }
    setBusy(true)
    try {
      const response = await fetch(apiUrl('/api/assistant'), { method: 'POST', headers: apiHeaders(session, { 'Content-Type': 'application/json' }), body: JSON.stringify({ mode, input }) })
      const payload = await readAssistantResponse(response)
      setResult(payload)
    } catch (requestError) {
      const details = Array.isArray(requestError.details) && requestError.details.length ? ` ${requestError.details.join(' ')}` : ''
      setError(`${requestError.message || 'Unable to analyze these details. Your entries were kept.'}${details}`)
    } finally { setBusy(false) }
  }
  const field = (key, label, options = {}) => <label className="assistant-field">{label}{options.help && <small>{options.help}</small>}<input type={options.type || 'text'} value={input[key]} min={options.min} step={options.step} onChange={event => update(key, event.target.value)} placeholder={options.placeholder} /></label>
  return (
    <main className="page assistant-page"><div className="container">
      <Link to={`/dashboard/${selling ? 'farmer' : 'buyer'}`} className="text-link">â† Back to dashboard</Link>
      <div className="assistant-heading"><div><div className="eyebrow"><Bot size={14} /> {selling ? 'Farmer workspace' : 'Buyer workspace'}</div><h1>{selling ? 'AI Selling Advisor' : 'Purchase Assistant'}</h1><p>{selling ? 'Use your actual harvest details and clearly labelled evidence to compare selling today with waiting.' : 'Compare buying options using your actual quotes.'}</p></div><span className="assistant-mode-pill">{isDemoMode ? 'Demo mode: no live AI' : 'Live endpoint when configured'}</span></div>
      <div className="assistant-layout">
        {!result && <form className="panel assistant-form" onSubmit={submit}>
          <div className="panel-heading"><div><h2>{reviewing ? 'Review your details' : 'Produce details'}</h2><p>{reviewing ? 'Check these values before requesting analysis. No listing or offer will be created.' : 'Unknown optional values may be left blank; they will not be treated as zero.'}</p></div></div>
          {!reviewing ? <div className="assistant-form-sections">
            <div className="assistant-form-group"><h3>Harvest and price</h3><div className="form-grid">{field('produce','Crop / produce name',{placeholder:'e.g. turmeric'})}{field('variety','Variety (if known)',{placeholder:'Optional'})}{field('quantity','Quantity',{type:'number',min:'0.001',step:'0.001'})}<label className="assistant-field">Unit<select value={input.unit} onChange={event => update('unit', event.target.value)}><option value="kg">kg</option><option value="quintal">quintal</option><option value="tonne">tonne</option></select></label>{field('harvestDate','Harvest date',{type:'date'})}<label className="assistant-field">Crop status<select value={input.cropStatus} onChange={event => update('cropStatus', event.target.value)}><option value="harvested">Harvested</option><option value="growing">Still growing</option></select></label><label className="assistant-field">Quality / grade<select value={input.qualityGrade} onChange={event => update('qualityGrade', event.target.value)}><option value="not sure">Not sure</option><option value="A">Grade A</option><option value="B">Grade B</option></select></label>{field('currentOffer','Current offer or expected price',{type:'number',min:'0',step:'0.01',help:'Per selected unit'})}</div></div>
            <div className="assistant-form-group"><h3>Location and market</h3><div className="form-grid">{field('state','State',{placeholder:'Optional'})}{field('district','District',{placeholder:'Optional'})}{field('nearestMarket','Nearest market',{placeholder:'Optional'})}</div></div>
            <div className="assistant-form-group"><h3>Costs and storage <small>Leave unknown values blank</small></h3><div className="form-grid">{field('transportQuote','Verified transport quote (optional)',{type:'number',min:'0',step:'0.01',help:'Used only when you have an actual quote.'})}{field('handlingCost','Handling cost',{type:'number',min:'0',step:'0.01'})}{field('storageCostPerDay','Storage cost per day',{type:'number',min:'0',step:'0.01'})}{field('packagingCost','Packaging cost',{type:'number',min:'0',step:'0.01'})}{field('commissionCost','Commission cost',{type:'number',min:'0',step:'0.01'})}{field('storageConditions','Storage type / conditions',{placeholder:'Optional'})}{field('storageCapacity','Storage capacity',{placeholder:'Optional'})}{field('minimumPrice','Minimum acceptable price',{type:'number',min:'0',step:'0.01'})}{field('sellingDeadline','Urgency or selling deadline',{type:'date'})}<label className="assistant-field">Confirmed buyer<select value={input.confirmedBuyer} onChange={event => update('confirmedBuyer', event.target.value)}><option value="unknown">Unknown</option><option value="yes">Yes</option><option value="no">No</option></select></label></div></div>
            {!selling && <div className="assistant-form-group"><h3>Purchase details</h3><div className="form-grid">{field('destination','Destination',{placeholder:'Required for buyers'})}{field('requiredBy','Required by',{type:'date'})}{field('qualityRequirements','Quality requirements',{placeholder:'Optional'})}</div></div>}
          </div> : <div className="review-summary">{Object.entries(input).filter(([, value]) => value !== '' && !Array.isArray(value)).map(([key, value]) => <div key={key}><span>{key.replace(/[A-Z]/g, letter => ` ${letter}`).replace(/^./, letter => letter.toUpperCase())}</span><strong>{String(value)}</strong></div>)}</div>}
          {error && <p className="error-state">{error}</p>}
          <button type="submit" disabled={busy} className="btn btn-primary full">{busy ? 'Analyzingâ€¦' : reviewing ? 'Request analysis' : 'Review details'} <ArrowRight size={16} /></button>
          {reviewing && <button type="button" className="btn btn-outline full" onClick={() => setReviewing(false)}>Edit details</button>}
        </form>}
        {result ? <AssistantResult result={result} selling={selling} onRevise={() => { setResult(null); setReviewing(false) }} /> : <div className="panel assistant-empty"><Bot size={36} /><h2>{reviewing ? 'Ready to analyze' : 'Your evidence-grounded comparison will appear here'}</h2><p>Future prices are not forecast without a validated model. Market data is shown only when the official adapter is configured and returns verified observations.</p></div>}
      </div>
    </div></main>
  )
}

function Settings() {
  return (
    <main className="page">
      <div className="container">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Service configuration</div>
            <h1>Connect FairHarvest</h1>
            <p>Live integrations are opt-in. The app stays in clearly labelled demo mode until configured.</p>
          </div>
        </div>
        <div className="panel settings-panel">
          <div className="metric-icon"><ShieldCheck size={17} /></div>
          <h2>Supabase</h2>
          <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to a local <code>.env</code> file, then restart Vite.</p>
          <span className="status-pill">{isDemoMode ? 'Demo mode active' : 'Supabase configured'}</span>
        </div>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <LandingIntro>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
      <Route path="*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/marketplace/:id" element={<ListingDetail />} /><Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
            <Route path="/fasalsaathi" element={<ProtectedRoute><FasalSaathi /></ProtectedRoute>} />
            <Route path="/assistant/sell" element={<ProtectedRoute><ModeRoute role="farmer"><Assistant mode="sell" /></ModeRoute></ProtectedRoute>} />
            <Route path="/assistant/buy" element={<ProtectedRoute><ModeRoute role="buyer"><Assistant mode="buy" /></ModeRoute></ProtectedRoute>} />
            <Route path="/dashboard/farmer" element={<ProtectedRoute><ModeRoute role="farmer"><Dashboard role="farmer" /></ModeRoute></ProtectedRoute>} />
            <Route path="/dashboard/buyer" element={<ProtectedRoute><ModeRoute role="buyer"><Dashboard role="buyer" /></ModeRoute></ProtectedRoute>} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
        } />
      </Routes>
    </LandingIntro>
  )
}
