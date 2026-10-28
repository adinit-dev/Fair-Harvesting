function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function estimateTransport({ quantityKg, transportQuote, ratePerKg, rateSource, destination } = {}) {
  const quote = number(transportQuote)
  if (quote !== null) {
    return {
      status: 'verified-quote',
      amount: Number(quote.toFixed(2)),
      currency: 'INR',
      basis: 'Farmer-provided transport quote',
      source: 'farmer-provided',
      destination: destination || null,
      confidence: 'user-provided',
      missing: [],
    }
  }

  const quantity = number(quantityKg)
  const rate = number(ratePerKg)
  if (quantity === null || rate === null || !String(rateSource || '').trim()) {
    return {
      status: 'unavailable',
      amount: null,
      currency: 'INR',
      basis: null,
      source: null,
      destination: destination || null,
      confidence: null,
      missing: ['verified transport quote or configured rate, route, and source'],
    }
  }

  return {
    status: 'estimated',
    amount: Number((quantity * rate).toFixed(2)),
    currency: 'INR',
    basis: `Configured rate of ₹${rate}/kg`,
    source: rateSource,
    destination: destination || null,
    confidence: 'configuration-dependent',
    missing: ['route distance and vehicle constraints unless supplied by the rate source'],
  }
}
