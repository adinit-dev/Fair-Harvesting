import { isDemoMode, supabase } from './supabase'

export const LISTING_IMAGE_BUCKET = 'produce-listing-images'
export const LISTING_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const LISTING_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function friendlyMarketplaceError(error) {
  const message = error?.message || String(error || '')
  const permissionDenied = error?.code === '42501' || /permission denied for table|row-level security|not authorized/i.test(message)
  if (permissionDenied) {
    return new Error('Marketplace database access is not configured yet. Ask the workspace administrator to apply the latest Supabase permissions migration.')
  }
  return error instanceof Error ? error : new Error(message || 'The marketplace request could not be completed.')
}

export function getListingImageUrl(imagePath) {
  if (!imagePath) return null
  if (/^(https?:|blob:)/.test(imagePath)) return imagePath
  if (isDemoMode) return null
  return supabase.storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(imagePath).data.publicUrl
}

async function attachPublicProfiles(rows) {
  const ids = [...new Set((rows || []).map(row => row.owner_id).filter(Boolean))]
  if (!ids.length) return rows || []
  const { data: profiles, error } = await supabase.from('public_profiles').select('id,display_name').in('id', ids)
  if (error) return rows || []
  const byId = new Map((profiles || []).map(profile => [profile.id, profile]))
  return (rows || []).map(row => ({ ...row, profiles: byId.get(row.owner_id) || null }))
}

export async function uploadListingImage(file, userId) {
  if (isDemoMode) return { path: null, error: new Error('Supabase is not configured. Demo mode cannot upload listing photos.'), demo: true }
  if (!userId) return { path: null, error: new Error('You must be signed in to upload a listing photo.'), demo: false }
  if (!file) return { path: null, error: new Error('Select an image before uploading.'), demo: false }
  if (!LISTING_IMAGE_TYPES.includes(file.type)) return { path: null, error: new Error('Choose a JPG, PNG, or WebP image.'), demo: false }
  if (file.size > LISTING_IMAGE_MAX_BYTES) return { path: null, error: new Error('The image must be smaller than 5 MB.'), demo: false }

  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage
    .from(LISTING_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  return { path: error ? null : path, error, demo: false }
}

export async function fetchActiveListings() {
  if (isDemoMode) return { data: null, error: null, demo: true }

  const { data, error } = await supabase
    .from('produce_listings')
    .select('*')
    .eq('status', 'active')
    .order('harvest_date', { ascending: false })

  return { data: error ? data : await attachPublicProfiles(data), error, demo: false }
}

export async function fetchListingById(listingId) {
  if (isDemoMode) return { data: null, error: null, demo: true }
  if (!listingId) return { data: null, error: new Error('A listing ID is required.'), demo: false }

  const { data, error } = await supabase
    .from('produce_listings')
    .select('*')
    .eq('id', listingId)
    .maybeSingle()

  return { data: error ? data : (await attachPublicProfiles(data ? [data] : []))[0] || null, error, demo: false }
}

export async function fetchOwnedListings(userId) {
  if (isDemoMode) return { data: null, error: null, demo: true }

  const { data, error } = await supabase
    .from('produce_listings')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })

  return { data: data || [], error, demo: false }
}

export async function createListing(listing, userId) {
  if (isDemoMode) return { data: null, error: new Error('Supabase is not configured. Demo mode cannot save listings.'), demo: true }
  if (!userId) return { data: null, error: new Error('You must be signed in to create a listing.'), demo: false }

  return supabase
    .from('produce_listings')
    .insert({ ...listing, owner_id: userId })
    .select()
    .single()
}

export async function updateListing(id, changes, userId) {
  if (isDemoMode) return { data: null, error: new Error('Supabase is not configured. Demo mode cannot update listings.'), demo: true }
  if (!id || !userId) return { data: null, error: new Error('A listing and authenticated owner are required to update a listing.'), demo: false }
  if (!changes || typeof changes !== 'object') return { data: null, error: new Error('Listing changes are required.'), demo: false }

  return supabase
    .from('produce_listings')
    .update(changes)
    .eq('id', id)
    .eq('owner_id', userId)
    .select()
    .single()
}

export async function withdrawListing(id, userId) {
  return updateListing(id, { status: 'withdrawn' }, userId)
}

export async function fetchActiveRequirements() {
  if (isDemoMode) return { data: null, error: null, demo: true }
  const { data, error } = await supabase
    .from('buyer_requirements')
    .select('*')
    .eq('status', 'active')
    .order('required_by', { ascending: true })
  return { data: error ? data || [] : await attachPublicProfiles(data), error: error ? friendlyMarketplaceError(error) : null, demo: false }
}

export async function fetchRequirements(userId) {
  if (isDemoMode) return { data: null, error: null, demo: true }

  const { data, error } = await supabase
    .from('buyer_requirements')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })

  return { data: data || [], error, demo: false }
}

export async function saveRequirement(requirement, userId) {
  if (isDemoMode) return { data: null, error: new Error('Supabase is not configured. Demo mode cannot save requirements.'), demo: true }
  if (!userId) return { data: null, error: new Error('You must be signed in to save a requirement.'), demo: false }

  return supabase
    .from('buyer_requirements')
    .upsert({ ...requirement, owner_id: userId })
    .select()
    .single()
}

export async function updateRequirement(id, changes, userId) {
  if (isDemoMode) return { data: null, error: new Error('Supabase is not configured. Demo mode cannot update requirements.'), demo: true }
  if (!id || !userId || !changes || typeof changes !== 'object') return { data: null, error: new Error('A requirement, owner, and changes are required.'), demo: false }
  return supabase.from('buyer_requirements').update(changes).eq('id', id).eq('owner_id', userId).select().single()
}

export async function withdrawRequirement(id, userId) {
  return updateRequirement(id, { status: 'withdrawn' }, userId)
}

export async function getOrCreateListingConversation({ listingId, buyerId, sellerId }) {
  if (isDemoMode) return { data: null, error: null, demo: true }

  const { data: existing, error: lookupError } = await supabase
    .from('conversations')
    .select('*')
    .eq('listing_id', listingId)
    .eq('created_by', buyerId)
    .maybeSingle()

  if (lookupError && lookupError.code !== 'PGRST116') {
    return { data: null, error: friendlyMarketplaceError(lookupError), demo: false }
  }

  if (existing) {
    const { error: memberError } = await supabase
      .from('conversation_members')
      .upsert([
        { conversation_id: existing.id, user_id: buyerId },
        { conversation_id: existing.id, user_id: sellerId },
      ], { onConflict: 'conversation_id,user_id' })
    return { data: existing, error: memberError ? friendlyMarketplaceError(memberError) : null, demo: false }
  }

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({ listing_id: listingId, created_by: buyerId })
    .select()
    .single()

  if (createError) return { data: null, error: friendlyMarketplaceError(createError), demo: false }

  const members = [
    { conversation_id: created.id, user_id: buyerId },
    { conversation_id: created.id, user_id: sellerId },
  ]

  const { error: memberError } = await supabase
    .from('conversation_members')
    .upsert(members, { onConflict: 'conversation_id,user_id' })

  if (memberError) {
    return { data: created, error: friendlyMarketplaceError(memberError), demo: false }
  }

  return { data: created, error: null, demo: false }
}

export async function getOrCreateRequirementConversation({ requirementId, farmerId, buyerId }) {
  if (isDemoMode) return { data: null, error: null, demo: true }
  const { data: existing, error: lookupError } = await supabase
    .from('conversations').select('*').eq('requirement_id', requirementId).eq('created_by', farmerId).maybeSingle()
  if (lookupError) return { data: null, error: friendlyMarketplaceError(lookupError), demo: false }
  if (existing) {
    const { error: memberError } = await supabase.from('conversation_members').upsert([
      { conversation_id: existing.id, user_id: farmerId },
      { conversation_id: existing.id, user_id: buyerId },
    ], { onConflict: 'conversation_id,user_id' })
    return { data: existing, error: memberError ? friendlyMarketplaceError(memberError) : null, demo: false }
  }
  const { data: created, error: createError } = await supabase
    .from('conversations').insert({ requirement_id: requirementId, created_by: farmerId }).select().single()
  if (createError) return { data: null, error: friendlyMarketplaceError(createError), demo: false }
  const { error: memberError } = await supabase.from('conversation_members').upsert([
    { conversation_id: created.id, user_id: farmerId },
    { conversation_id: created.id, user_id: buyerId },
  ], { onConflict: 'conversation_id,user_id' })
  return { data: created, error: memberError ? friendlyMarketplaceError(memberError) : null, demo: false }
}

export async function fetchConversations(userId) {
  if (isDemoMode) return { data: [], error: null, demo: true }
  if (!userId) return { data: [], error: new Error('A signed-in user is required.'), demo: false }
  const { data: memberships, error } = await supabase
    .from('conversation_members').select('conversation_id, conversations(*, listing:listing_id(produce_name,owner_id), demand:requirement_id(produce_name,owner_id))').eq('user_id', userId)
  if (error) return { data: [], error: friendlyMarketplaceError(error), demo: false }
  const conversationIds = (memberships || []).map(item => item.conversation_id)
  let latest = []
  if (conversationIds.length) {
    const { data, error: messageError } = await supabase.from('messages').select('conversation_id,body,created_at,sender_id').in('conversation_id', conversationIds).order('created_at', { ascending: false })
    if (messageError) return { data: [], error: friendlyMarketplaceError(messageError), demo: false }
    latest = data || []
  }
  const byConversation = new Map()
  latest.forEach(message => { if (!byConversation.has(message.conversation_id)) byConversation.set(message.conversation_id, message) })
  return { data: (memberships || []).map(item => ({ ...item.conversations, latest_message: byConversation.get(item.conversation_id) || null })).sort((a, b) => new Date(b.updated_at || b.latest_message?.created_at || b.created_at) - new Date(a.updated_at || a.latest_message?.created_at || a.created_at)), error: null, demo: false }
}

export async function fetchConversationMessages(conversationId) {
  if (isDemoMode) return { data: [], error: null, demo: true }

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  return { data: data || [], error, demo: false }
}

export async function sendConversationMessage({ conversationId, senderId, body }) {
  if (isDemoMode) return { data: null, error: new Error('Demo mode cannot save conversation messages.'), demo: true }

  if (!conversationId || !senderId || !String(body || '').trim()) {
    return { data: null, error: new Error('A conversation and a non-empty message are required.'), demo: false }
  }

  return supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() })
    .select()
    .single()
}

export async function fetchListingOffers(listingId) {
  if (isDemoMode) return { data: [], error: null, demo: true }

  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })

  return { data: data || [], error, demo: false }
}

export async function createRequirementOffer({ conversationId, requirementId, farmerId, buyerId, quantity, pricePerUnit, unit, note }) {
  if (isDemoMode) return { data: null, error: new Error('Demo mode cannot save offers.'), demo: true }
  if (!conversationId || !requirementId || !farmerId || !buyerId || !quantity || !Number.isFinite(Number(pricePerUnit)) || !unit) {
    return { data: null, error: new Error('Offer details are incomplete.'), demo: false }
  }
  return supabase.from('offers').insert({
    conversation_id: conversationId,
    requirement_id: requirementId,
    listing_id: null,
    buyer_id: buyerId,
    seller_id: farmerId,
    quantity: Number(quantity),
    price_per_unit: Number(pricePerUnit),
    unit,
    note: note?.trim() || null,
    status: 'pending',
  }).select().single()
}

export async function createOffer({ conversationId, listingId, buyerId, sellerId, quantity, pricePerUnit, unit, note }) {
  if (isDemoMode) return { data: null, error: new Error('Demo mode cannot save offers.'), demo: true }

  if (!listingId || !conversationId || !buyerId || !sellerId || !quantity || !pricePerUnit || !unit) {
    return { data: null, error: new Error('Offer details are incomplete.'), demo: false }
  }

  return supabase
    .from('offers')
    .insert({
      conversation_id: conversationId,
      listing_id: listingId,
      buyer_id: buyerId,
      seller_id: sellerId,
      quantity: Number(quantity),
      price_per_unit: Number(pricePerUnit),
      unit,
      note: note?.trim() || null,
      status: 'pending',
    })
    .select()
    .single()
}

export async function updateOfferStatus({ offerId, status, userId }) {
  if (isDemoMode) return { data: null, error: new Error('Demo mode cannot update offers.'), demo: true }

  if (!offerId || !status || !userId) {
    return { data: null, error: new Error('Offer status update requires an offer, status, and user.'), demo: false }
  }

  return supabase
    .from('offers')
    .update({ status })
    .eq('id', offerId)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .select()
    .single()
}
