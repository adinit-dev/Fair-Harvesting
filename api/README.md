# Server-side assistant data access

## Groq diagnostic

`GET /api/assistant` returns only non-secret configuration status:

- whether `GROQ_API_KEY` is configured
- the configured model ID
- `liveRequestTested: false`

It does not call Groq and never returns the API key.

The assistant endpoint uses the server-only `GROQ_API_KEY` and sends it as a
Bearer token. A successful diagnostic does not prove that a live Groq request
will succeed.

## Mandi adapter

`api/lib/mandi.js` is intentionally isolated until the official data.gov.in
resource metadata is verified. It requires these server-only variables:

- `DATA_GOV_IN_API_KEY`
- `DATA_GOV_IN_RESOURCE_ID`
- `DATA_GOV_IN_PRICE_UNIT` (only after confirming the resource's actual unit)

The adapter uses the official resource URL shape
`https://api.data.gov.in/resource/<resource-id>` and returns source,
observation fields, price fields, and retrieval time. The resource ID, exact
field names, date format, price unit, historical retention, quotas, and filter
syntax must be confirmed from the selected data.gov.in resource before this
adapter is connected to Groq or presented as evidence.

No demo records or fallback market prices are returned when configuration or
provider access is missing.

Observations are rejected when there are no records, required price/date fields
are missing, the unit has not been configured as verified metadata, or the
observation is older than seven days.

If Groq is unavailable after request validation, `/api/assistant` still returns
the deterministic calculations with `live: false` and a sanitized
`aiError`. The frontend can therefore show a limited analysis without
inventing an AI explanation.

Transport estimation is fail-closed. A farmer-provided `transportQuote` is
returned as a user-provided quote. A configured `TRANSPORT_RATE_PER_KG` is
used only when `TRANSPORT_RATE_SOURCE` is also configured; otherwise transport
is returned as unavailable rather than treated as zero.
