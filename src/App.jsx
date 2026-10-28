import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Clock3,
  Filter,
  MapPin,
  Menu,
  Package,
  Search,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'
import './App.css'
import { useAuth, ProtectedRoute } from './lib/auth.jsx'
import {
  createListing,
  fetchActiveListings,
  fetchOwnedListings,
  fetchListingById,
  fetchRequirements,
  saveRequirement,
  updateListing,
  getListingImageUrl,
  uploadListingImage,
  getOrCreateListingConversation,
  fetchConversationMessages,
  sendConversationMessage,
  fetchListingOffers,
  createOffer,
  updateOfferStatus,
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
      <span><strong>Demo mode</strong> · Showing sample marketplace data. Connect Supabase to enable live listings and authentication.</span>
      <Link to="/settings">Configure services <ArrowRight size={13} /></Link>
    </div>
  )
}

function Header() {
  const [open, setOpen] = useState(false)
  const { session, signOut } = useAuth()
  const location = useLocation()

  return (
    <header className="site-header">
      <div className="container nav-row">
        <Logo />
        <nav className={open ? 'nav-links open' : 'nav-links'}>
          {[['Marketplace', '/marketplace'], ['How it works', '/#how-it-works'], ['For farmers', '/dashboard/farmer'], ['For buyers', '/dashboard/buyer']].map(([label, href]) => (
            <NavLink key={label} to={href} className={({ isActive }) => (isActive && location.pathname !== '/' ? 'active' : '')} onClick={() => setOpen(false)}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-actions">
          {session ? (
            <button type="button" onClick={signOut} className="btn btn-outline hide-mobile">Sign out</button>
          ) : (
            <>
              <Link to="/auth" className="btn btn-outline hide-mobile">Sign in</Link>
              <Link to="/auth?role=farmer" className="btn btn-primary hide-mobile">Join FairHarvest <ArrowRight size={16} /></Link>
            </>
          )}
          <button type="button" className="menu-button" onClick={() => setOpen(!open)} aria-label="Toggle navigation">
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
    </header>
  )
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
          <span>© 2025 FairHarvest</span>
        </div>
      </footer>
    </>
  )
}

function SectionTitle({ eyebrow, title, copy, action }) {
  return (
    <div className="section-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        {copy && <p>{copy}</p>}
      </div>
      {action}
    </div>
  )
}

function Home() {
  return (
    <>
      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> Northeast India’s trusted harvest network</div>
            <h1>Your harvest.<br /><em>Your market.</em><br />Your decision.</h1>
            <p className="hero-lead">A better way for farmers to find the right buyers, and for buyers to source exceptional produce directly from the people who grow it.</p>
            <div className="hero-actions">
              <Link to="/marketplace" className="btn btn-primary btn-large">Explore the marketplace <ArrowRight size={18} /></Link>
              <Link to="/auth?role=farmer" className="text-link">I’m a farmer <ArrowRight size={16} /></Link>
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
            <div className="hero-location"><MapPin size={14} /> Meghalaya · India</div>
          </div>
        </div>
      </section>

      <section className="stats-strip">
        <div className="container stats-grid">
          <div><strong>2,400+</strong><span>Farmers onboarded</span></div>
          <div><strong>18</strong><span>Districts connected</span></div>
          <div><strong>₹4.2 Cr</strong><span>Value traded</span></div>
          <div><strong>96%</strong><span>On-time fulfillment</span></div>
        </div>
      </section>

      <section id="how-it-works" className="section">
        <div className="container">
          <SectionTitle eyebrow="A simpler way forward" title="Good food starts with good connections." copy="Everything you need to move your harvest from the field to the right hands." />
          <div className="feature-grid">
            {[
              { icon: <Sprout />, n: '01', t: 'List your harvest', d: 'Share what you grow, when it’s ready, and what makes it special.' },
              { icon: <Users />, n: '02', t: 'Find your match', d: 'Our rules-based matching connects you with serious, relevant partners.' },
              { icon: <ShieldCheck />, n: '03', t: 'Trade with clarity', d: 'Transparent freshness, fair offers, and conversations that stay human.' },
            ].map((item) => (
              <div key={item.n} className="feature-card">
                <div className="feature-icon">{item.icon}</div>
                <span className="feature-number">{item.n}</span>
                <h3>{item.t}</h3>
                <p>{item.d}</p>
                <ArrowRight size={18} className="feature-arrow" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-tint">
        <div className="container split-promo">
          <div>
            <div className="eyebrow">Built for both sides</div>
            <h2>More than a marketplace.<br /><em>A growing community.</em></h2>
            <p>From a small family farm in Nagaland to a restaurant in Guwahati, FairHarvest makes every step more transparent and every decision more informed.</p>
            <Link to="/marketplace" className="btn btn-dark">See what’s fresh <ArrowRight size={17} /></Link>
          </div>
          <div className="quote-card">
            <div className="quote-mark">“</div>
            <p>FairHarvest helped us find a buyer who values our Lakadong turmeric. We’re getting a fair price and planning our next crop with confidence.</p>
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
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [items, setItems] = useState(demoListings)
  const [loading, setLoading] = useState(!isDemoMode)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    if (isDemoMode) return undefined

    let active = true
    fetchActiveListings().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setLoadError(error.message)
        setItems([])
      } else {
        setItems((data || []).map((entry) => ({
          id: entry.id,
          name: entry.produce_name,
          variety: entry.variety || 'Local variety',
          seller: entry.profiles?.display_name || 'Verified farmer',
          place: [entry.village, entry.district, entry.state].filter(Boolean).join(', ') || 'Northeast India',
          price: Number(entry.asking_price_per_unit ?? entry.min_price_per_unit ?? 0),
          minPrice: Number(entry.min_price_per_unit),
          unit: entry.unit || 'kg',
          quantity: `${entry.quantity} ${entry.unit || 'kg'}`,
          freshness: 90,
          tag: 'Live listing',
          image: getListingImageUrl(entry.image_paths?.[0]),
          verified: true,
          status: entry.status,
        })))
      }
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [])

  const filtered = items.filter((item) => {
    const haystack = `${item.name} ${item.variety} ${item.place}`.toLowerCase()
    const matchesQuery = haystack.includes(query.toLowerCase())
    const matchesType = type === 'all' || (type === 'verified' ? item.verified : !item.verified)
    return matchesQuery && matchesType
  })

  return (
    <main className="page">
      <div className="container">
        <div className="page-heading">
          <div>
            <div className="eyebrow">Direct from the Northeast</div>
            <h1>Marketplace</h1>
            <p>Find fresh produce and match it with the right buyers at the right time.</p>
          </div>
          <Link to="/assistant/sell" className="btn btn-primary">AI Selling Advisor <Bot size={16} /></Link>
          <div className="market-toolbar">
            <div className="search-shell">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search produce, variety, or district" />
            </div>
            <div className="filter-shell">
              <Filter size={15} />
              <select value={type} onChange={(event) => setType(event.target.value)}>
                <option value="all">All listings</option>
                <option value="verified">Verified only</option>
                <option value="new">Unverified</option>
              </select>
            </div>
          </div>
        </div>

        {loading && <div className="empty-state">Loading marketplace…</div>}
        {loadError && <div className="error-state">{loadError}</div>}

        <div className="listing-grid">
          {filtered.map((item) => (
            <article key={item.id} className="listing-card">
              <div className="listing-image">
                <ListingImage src={item.image} alt={`${item.name} listing`} />
                <span className="listing-tag"><Clock3 size={13} /> {item.tag}</span>
                {item.verified && <span className="listing-verified">Verified</span>}
              </div>
              <div className="listing-body">
                <div className="listing-header">
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.variety}</p>
                  </div>
                  <div className="listing-price-block"><span className="price-badge">₹{item.price}</span><small>per {item.unit}</small></div>
                </div>
                <div className="listing-meta">
                  <span><Package size={14} /> {item.quantity}</span>
                  <span><MapPin size={14} /> {item.place}</span>
                  <span className="listing-status">{item.status}</span>
                </div>
                {item.minPrice !== item.price && <div className="listing-min-price">Minimum accepted: ₹{item.minPrice} / {item.unit}</div>}
                <Freshness score={item.freshness} />
                <div className="listing-footer">
                  <span className="seller-name">{item.seller}</span>
                  <Link to={`/marketplace/${item.id}`} className="text-link">View details <ArrowRight size={15} /></Link>
                </div>
              </div>
            </article>
          ))}
        </div>
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

  // ── Messaging ───────────────────────────────────────────────────────────
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

  // ── Offers ──────────────────────────────────────────────────────────────
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

  // ── Derived loading states (no setState in effects) ──────────────────────
  const convLoading = Boolean(!isDemoMode && isBuyer && !conversation && !convError)
  const messagesLoading = Boolean(!isDemoMode && conversation && loadedConvId !== conversation.id)
  const offersLoading = Boolean(!isDemoMode && item && user && loadedOffersListingId !== item.id)

  // ── Load listing ────────────────────────────────────────────────────────
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

  // ── Open conversation once listing + user are known ──────────────────────
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

  // ── Load messages when conversation is known ─────────────────────────────
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

  // ── Scroll to bottom on new messages ────────────────────────────────────
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ── Load offers (both buyer and seller see them) ─────────────────────────
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

  // ── Handlers ─────────────────────────────────────────────────────────────
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
    if (price < item.minPrice) { setOfferMsg(`Price cannot be below the seller minimum of ₹${item.minPrice}.`); return }
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
        {loading && <div className="empty-state">Loading listing…</div>}
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
              <strong>₹{item.price}</strong>
              <span>per {item.unit}</span>
            </div>
            <Freshness score={item.freshness} />
          </div>
        </div>}

        {showConvPanel && (
          <div className="panel message-panel">
            <div className="panel-heading">
              <div><h2>Listing conversation</h2><p>{isDemoMode ? 'Demo conversation — messages are not saved.' : 'Messages are stored in Supabase and visible only to participants.'}</p></div>
            </div>
            {!isDemoMode && !user && <p className="empty-state">Sign in to join this conversation.</p>}
            {!isDemoMode && user && convLoading && <p className="empty-state msg-loading">Opening conversation…</p>}
            {!isDemoMode && user && convError && <p className="error-state">{convError}</p>}
            {(!isDemoMode && user && !convLoading && !convError && messagesLoading) && <p className="empty-state msg-loading">Loading messages…</p>}
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
                  placeholder="Write a message…"
                  disabled={sending}
                />
                <button type="button" className="btn btn-primary" onClick={handleSendMessage} disabled={sending}>
                  {sending ? 'Sending…' : 'Send'}
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
                <label className="offer-label">Price per {item.unit} (₹)
                  <input type="number" min="0" step="0.01" value={isDemoMode ? item.price : offerPrice}
                    onChange={(e) => setOfferPrice(e.target.value)} placeholder={`Min ₹${item.minPrice}`} required disabled={isDemoMode} />
                </label>
                <label className="offer-label offer-note">Note (optional)
                  <input type="text" value={isDemoMode ? 'Interested in a direct purchase' : offerNote}
                    onChange={(e) => setOfferNote(e.target.value)} placeholder="Optional note" disabled={isDemoMode} />
                </label>
                <button type="submit" className="btn btn-primary" disabled={offerBusy}>
                  {offerBusy ? 'Submitting…' : 'Send offer'}
                </button>
              </form>
            )}
            {!isDemoMode && !isBuyer && !isSeller && item && user && (
              <p className="empty-state" style={{padding:'1rem 0'}}>Sign in as a buyer to make an offer.</p>
            )}
            {offersLoading && <p className="empty-state" style={{padding:'.75rem 0'}}>Loading offers…</p>}
            {offersError && <p className="error-state">{offersError}</p>}
            {(offers.length > 0 || isDemoMode) && (
              <div className="offer-list">
                {offers.map((offer) => (
                  <div key={offer.id} className="offer-item">
                    <div className="offer-item-main">
                      <strong>{offer.quantity} {offer.unit || item.unit}</strong>
                      <span>₹{offer.price_per_unit} / {offer.unit || item.unit}</span>
                      {offer.note && <small className="offer-note-text">{offer.note}</small>}
                    </div>
                    <div className="offer-actions">
                      <span className={`offer-status offer-status--${offer.status}`}>{offer.status}</span>
                      {!isDemoMode && offer.status === 'pending' && isSeller && (
                        <>
                          <button type="button" className="btn btn-small btn-primary" onClick={() => handleOfferAction(offer.id, 'accepted')}>Accept</button>
                          <button type="button" className="btn btn-small btn-outline" onClick={() => handleOfferAction(offer.id, 'countered')}>Counter</button>
                          <button type="button" className="btn btn-small btn-outline" onClick={() => handleOfferAction(offer.id, 'rejected')}>Reject</button>
                        </>
                      )}
                      {!isDemoMode && offer.status === 'pending' && isBuyer && (
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
                <h2>AI Selling Advisor</h2>
                <p>Compare selling today with waiting scenarios using your inputs and any verified market evidence available.</p>
              </div>
              <Link to="/assistant/sell" className="btn btn-primary">Open advisor <ArrowRight size={16} /></Link>
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
              {!demo && user && listingsLoading && <p className="empty-state">Loading your listings…</p>}
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
                            <strong>₹{listing.asking_price_per_unit ?? listing.min_price_per_unit}</strong>
                            <small>/{listing.unit}</small>
                          </div>
                        </div>
                        <div className="farmer-listing-meta">
                          <span><Package size={14} /> {listing.quantity} {listing.unit}</span>
                          <span>Harvested {listing.harvest_date}</span>
                          {(listing.village || listing.district || listing.state) && <span><MapPin size={14} /> {[listing.village, listing.district, listing.state].filter(Boolean).join(', ')}</span>}
                        </div>
                        {listing.asking_price_per_unit != null && listing.asking_price_per_unit !== listing.min_price_per_unit && (
                          <small className="farmer-listing-minimum">Minimum accepted: ₹{listing.min_price_per_unit} / {listing.unit}</small>
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
          {busy ? 'Saving…' : editingListing ? 'Save changes' : farmer ? 'Publish listing' : 'Save requirement'} <ArrowRight size={15} />
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
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [authMethod, setAuthMethod] = useState('password')
  const [signup, setSignup] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const { demo } = useAuth()
  const role = searchParams.get('role') === 'farmer' ? 'farmer' : 'buyer'

  function destination() {
    return `/dashboard/${role}`
  }

  function resetFeedback() {
    setError('')
    setMessage('')
  }

  async function signInWithPassword(event) {
    event.preventDefault()
    resetFeedback()
    if (demo || !supabase) {
      setError('Authentication is unavailable in demo mode. Configure Supabase to continue.')
      return
    }

    setBusy(true)
    const result = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    if (!result.data.session) {
      setError('Login did not create a session. Please try again.')
      return
    }
    setMessage('Signed in successfully. Redirecting…')
    navigate(destination())
  }

  async function signUpWithPassword(event) {
    event.preventDefault()
    resetFeedback()
    if (demo || !supabase) {
      setError('Authentication is unavailable in demo mode. Configure Supabase to continue.')
      return
    }

    setBusy(true)
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name.trim(),
          role,
          preferred_workspace: role,
        },
      },
    })
    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    if (result.data.session) {
      setMessage('Account created. Redirecting…')
      navigate(destination())
      return
    }
    setMessage('Account created. Check your email to confirm your address before signing in.')
  }

  async function sendCode(event) {
    event.preventDefault()
    setError('')
    if (demo || !supabase) {
      setError('Authentication is unavailable in demo mode. Configure Supabase to continue.')
      return
    }
    setBusy(true)
    const result = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setSent(true)
    setMessage('Check your email for the one-time code.')
  }

  async function verifyCode(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    if (demo || !supabase) {
      setBusy(false)
      setError('Authentication is unavailable in demo mode. Configure Supabase to continue.')
      return
    }
    const result = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    setBusy(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    setMessage('Signed in. Redirecting…')
    setTimeout(() => navigate(destination()), 600)
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Logo />
        <div className="auth-icon"><ShieldCheck size={25} /></div>
        <h1>Welcome to FairHarvest</h1>
        <p>{authMethod === 'otp' ? (sent ? 'Enter the one-time code from your email.' : 'Sign in with a one-time code sent to your email.') : signup ? 'Create your FairHarvest account with an email and password.' : 'Sign in with your email and password.'}</p>

        {authMethod === 'otp' ? (
          !sent ? (
            <form onSubmit={sendCode}>
              <label>
                Email address
                <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
              </label>
              <button type="submit" disabled={busy} className="btn btn-primary full">
                {busy ? 'Sending…' : 'Send me a code'} <ArrowRight size={16} />
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode}>
              <label>
                Verification code
                <input required inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" />
              </label>
              <button type="submit" disabled={busy} className="btn btn-primary full">
                {busy ? 'Verifying…' : 'Verify and continue'} <ArrowRight size={16} />
              </button>
            </form>
          )
        ) : (
          <form onSubmit={signup ? signUpWithPassword : signInWithPassword}>
            {signup && (
              <label>
                Name
                <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
              </label>
            )}
            <label>
              Email address
              <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </label>
            <label>
              Password
              <input required type="password" minLength="6" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" />
            </label>
            <button type="submit" disabled={busy} className="btn btn-primary full">
              {busy ? (signup ? 'Creating account…' : 'Signing in…') : (signup ? 'Create account' : 'Sign in')} <ArrowRight size={16} />
            </button>
          </form>
        )}

        {message && <p className="success-state">{message}</p>}
        {error && <p className="error-state">{error}</p>}
        <div className="auth-switches">
          {authMethod === 'password' && <button type="button" className="text-link" onClick={() => { setSignup(!signup); resetFeedback() }}>{signup ? 'Already have an account? Sign in' : 'Need an account? Sign up'}</button>}
          <button type="button" className="text-link" onClick={() => { setAuthMethod(authMethod === 'otp' ? 'password' : 'otp'); setSent(false); resetFeedback() }}>
            {authMethod === 'otp' ? 'Use email and password instead' : 'Use a one-time email code instead'}
          </button>
        </div>
        <small className="auth-note">Never share your password. By continuing, you agree to our Terms and Privacy Policy.</small>
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
          ? <div className="evidence-list">{result.marketEvidence.observations.map((observation, index) => <div key={`${observation.market}-${observation.observationDate}-${index}`}><strong>{observation.market || 'Market not provided'}</strong><span>{observation.commodity || 'Commodity not provided'} · {observation.observationDate || 'Date unavailable'} · modal {observation.modalPrice ?? 'n/a'} {observation.priceUnit}</span></div>)}</div>
          : <p>{result.marketEvidence?.message || 'Market data unavailable. This analysis uses farmer-provided inputs only.'}</p>}
      </div>}
      <div className="scenario-grid">
        {scenarios.map((scenario, index) => (
          <div key={scenario.id || scenario.label || index} className={`scenario-card ${index === 0 ? 'recommended' : ''}`}>
            <h3>{scenario.label || 'Option'}</h3>
            <p className="scenario-assumption">{scenario.priceAssumption || scenario.quotedBy || 'User-provided assumption'}</p>
            <ul><li>Gross value: {scenario.grossRevenue == null && scenario.produceCost == null ? 'Unavailable' : `₹${scenario.grossRevenue ?? scenario.produceCost} (${scenario.quantity ?? ''} ${scenario.unit || ''} at ₹${scenario.assumedPricePerUnit ?? scenario.pricePerUnit ?? ''}/${scenario.priceUnit || scenario.unit || 'unit'})`}</li><li>Costs: {scenario.costStatus || (scenario.knownCosts == null && scenario.netProceeds == null ? 'Unavailable' : `₹${scenario.knownCosts ?? scenario.deliveredCost}`)}</li><li>Net: {scenario.netProceeds == null && scenario.costPerUnit == null ? 'Unavailable — required costs are missing' : `₹${scenario.netProceeds ?? scenario.costPerUnit}`}</li></ul>
            <p>{scenario.freshnessConcern || scenario.risks?.[0] || 'No major risks flagged.'}</p>
          </div>
        ))}
      </div>
      {selling && result.transport && <div className="panel evidence-panel"><h3>Transport cost</h3><p>{result.transport.status === 'unavailable' ? 'Unavailable — no verified quote or configured rate was provided. Net proceeds may be incomplete.' : `${result.transport.status === 'estimated' ? 'Estimated' : 'Farmer-provided'}: ₹${result.transport.amount} ${result.transport.currency} (${result.transport.basis}).`}</p></div>}
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
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, input }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Assistant request failed.')
      setResult(payload)
    } catch (requestError) {
      setError(requestError.message || 'Unable to analyze these details. Your entries were kept.')
    } finally { setBusy(false) }
  }
  const field = (key, label, options = {}) => <label className="assistant-field">{label}{options.help && <small>{options.help}</small>}<input type={options.type || 'text'} value={input[key]} min={options.min} step={options.step} onChange={event => update(key, event.target.value)} placeholder={options.placeholder} /></label>
  return (
    <main className="page assistant-page"><div className="container">
      <Link to={`/dashboard/${selling ? 'farmer' : 'buyer'}`} className="text-link">← Back to dashboard</Link>
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
          <button type="submit" disabled={busy} className="btn btn-primary full">{busy ? 'Analyzing…' : reviewing ? 'Request analysis' : 'Review details'} <ArrowRight size={16} /></button>
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
    <Routes>
      <Route path="/auth" element={<Auth />} />
      <Route path="*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/marketplace/:id" element={<ListingDetail />} />
            <Route path="/assistant/sell" element={<ProtectedRoute><Assistant mode="sell" /></ProtectedRoute>} />
            <Route path="/assistant/buy" element={<ProtectedRoute><Assistant mode="buy" /></ProtectedRoute>} />
            <Route path="/dashboard/farmer" element={<ProtectedRoute><Dashboard role="farmer" /></ProtectedRoute>} />
            <Route path="/dashboard/buyer" element={<ProtectedRoute><Dashboard role="buyer" /></ProtectedRoute>} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  )
}
