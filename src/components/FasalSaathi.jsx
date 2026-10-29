import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot, Camera, CheckCircle2, Mic, MicOff, Paperclip, RefreshCw } from 'lucide-react'
import { readAssistantResponse } from '../lib/assistantApi.js'
import { useAuth } from '../lib/auth.jsx'
import { createListing, saveRequirement } from '../lib/data.js'
import { buildFasalSaathiAssistantInput, createFasalSaathiInput, intentSpecificUnresolved, mergeFasalSaathiExtraction, missingFasalSaathiFields, validateFasalSaathiInput, validateProducePhoto } from '../lib/fasalSaathi.js'

export default function FasalSaathi() {
  const { user, demo, activeMode } = useAuth()
  const mode = activeMode === 'buyer' ? 'buy' : 'sell'
  const [input, setInput] = useState(() => createFasalSaathiInput(activeMode === 'buyer' ? 'buy' : 'sell'))
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const [voiceSupported] = useState(() => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder))
  const [recordingState, setRecordingState] = useState('idle')
  const [seconds, setSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [errors, setErrors] = useState([])
  const [notice, setNotice] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractedFields, setExtractedFields] = useState([])
  const [pendingVoiceChanges, setPendingVoiceChanges] = useState(null)
  const [preservedManualFields, setPreservedManualFields] = useState([])
  const [result, setResult] = useState(null)
  const [actionOpen, setActionOpen] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionNotice, setActionNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionValues, setActionValues] = useState(null)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const extractionRequestRef = useRef(0)
  const manualFieldsRef = useRef(new Set())
  const autoFieldsRef = useRef(new Set())
  const recordingRequestRef = useRef(0)

  function stopTracks() {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  function stopTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
  }

  useEffect(() => () => {
    recordingRequestRef.current += 1
    stopTimer()
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    stopTracks()
  }, [])

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview) }, [photoPreview])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInput(previous => {
        const shared = { produce: previous.produce, quantity: previous.quantity, unit: previous.unit, quality: previous.quality }
        return { ...createFasalSaathiInput(mode), ...shared }
      })
      manualFieldsRef.current = new Set()
      autoFieldsRef.current = new Set()
      setExtractedFields([])
      setResult(null)
      setReviewing(false)
      setErrors([])
    }, 0)
    return () => window.clearTimeout(timer)
  }, [mode])

  function update(key, value) { manualFieldsRef.current.add(key); autoFieldsRef.current.delete(key); setInput(previous => ({ ...previous, [key]: value })); setExtractedFields(previous => previous.filter(field => field !== key)); setErrors([]); setResult(null) }

  function choosePhoto(file) {
    const validation = validateProducePhoto(file)
    if (validation) { setErrors([validation]); return }
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
    setErrors([])
    setNotice('Photo attached locally for this session. It has not been uploaded and does not certify crop grade or freshness.')
  }

  function removePhoto() { if (photoPreview) URL.revokeObjectURL(photoPreview); setPhoto(null); setPhotoPreview('') }

  async function startRecording() {
    if (['requesting', 'recording'].includes(recordingState) || !voiceSupported) return
    const requestId = ++recordingRequestRef.current
    extractionRequestRef.current += 1
    setErrors([])
    setNotice('')
    setRecordingState('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (requestId !== recordingRequestRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      streamRef.current = stream
      const preferred = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
      const mimeType = preferred.find(type => MediaRecorder.isTypeSupported(type)) || ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = event => { if (event.data?.size) chunksRef.current.push(event.data) }
      recorder.onerror = () => {
        if (requestId !== recordingRequestRef.current) return
        stopTimer(); stopTracks(); setRecordingState('error')
        setErrors(['Recording failed. Please check your microphone and retry.'])
      }
      recorder.onstop = () => {
        if (requestId !== recordingRequestRef.current) return
        stopTimer(); stopTracks()
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (!blob.size) { setRecordingState('error'); setErrors(['The recording was empty. Please retry.']); return }
        setAudioBlob(blob)
        setRecordingState('recorded')
      }
      recorder.start(250)
      setSeconds(0)
      setAudioBlob(null)
      setRecordingState('recording')
      timerRef.current = window.setInterval(() => setSeconds(value => value + 1), 1000)
    } catch (error) {
      if (requestId !== recordingRequestRef.current) return
      stopTracks(); setRecordingState('error')
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') setErrors(['Microphone permission was denied. Allow microphone access in browser settings, then retry.'])
      else if (error?.name === 'NotFoundError') setErrors(['No usable microphone was found. Connect one, then retry.'])
      else setErrors(['The microphone could not start. Check it and retry.'])
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  function retryRecording() {
    recordingRequestRef.current += 1
    extractionRequestRef.current += 1
    stopTimer()
    stopTracks()
    chunksRef.current = []
    setAudioBlob(null)
    setTranscript('')
    setSeconds(0)
    setRecordingState('idle')
    setTranscribing(false)
    setExtracting(false)
    setErrors([])
    setNotice('')
  }

  async function analyzeRecording() {
    if (!audioBlob) { setErrors(['Record audio first, then analyze it.']); return }
    const requestId = ++extractionRequestRef.current
    const selectedMode = mode
    if (!String(transcript || '').trim()) {
      setTranscribing(true); setErrors([])
      try {
        const extension = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('ogg') ? 'ogg' : 'webm'
        const response = await fetch('/api/transcribe', {
          method: 'POST', headers: { 'Content-Type': audioBlob.type || 'audio/webm', 'X-Fasal-Audio-Extension': extension }, body: audioBlob,
        })
        const text = await response.text()
        let payload = {}
        try { payload = text ? JSON.parse(text) : {} } catch { throw new Error('The voice service returned an invalid response.') }
        if (!response.ok) throw new Error(payload.error || `Voice analysis failed (HTTP ${response.status}).`)
        if (!String(payload.text || '').trim()) throw new Error('No speech was detected. Please retry or edit the transcript manually.')
        if (requestId !== extractionRequestRef.current) return
        setTranscript(payload.text.trim())
        await extractStructuredTranscript(payload.text.trim(), requestId, selectedMode)
      } catch (error) {
        if (requestId === extractionRequestRef.current) setErrors([error.message || 'Voice analysis failed. Retry or enter the details manually.'])
      } finally { if (requestId === extractionRequestRef.current) setTranscribing(false) }
      return
    }
    await extractStructuredTranscript(transcript, requestId, selectedMode)
  }

  async function extractStructuredTranscript(text, requestId = ++extractionRequestRef.current, selectedMode = mode) {
    const clean = String(text || '').trim()
    if (!clean) { setErrors(['Enter a transcript or record again before filling the form.']); return }
    setExtracting(true)
    setErrors([])
    try {
      const response = await fetch('/api/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: clean, mode: selectedMode }),
      })
      const raw = await response.text()
      let payload
      try { payload = raw ? JSON.parse(raw) : {} } catch { throw new Error('The field extraction service returned invalid JSON.') }
      if (!response.ok) throw new Error(payload.error || `Field extraction failed (HTTP ${response.status}).`)
      if (requestId === extractionRequestRef.current) applyStructuredExtraction(payload, selectedMode)
    } catch (error) {
      if (requestId === extractionRequestRef.current) setErrors([error.message || 'Field extraction failed. Retry or enter the details manually.'])
    } finally { if (requestId === extractionRequestRef.current) setExtracting(false) }
  }

  function applyStructuredExtraction(payload, selectedMode) {
    let targetMode = selectedMode
    const responseIntent = payload.intent === 'buy' || payload.intent === 'sell' ? payload.intent : selectedMode
    if (responseIntent !== selectedMode && window.confirm(`The transcript indicates ${responseIntent === 'buy' ? 'buying' : 'selling'}. Switch modes before applying these fields?`)) {
      targetMode = responseIntent
      setMode(targetMode)
      manualFieldsRef.current = new Set()
      autoFieldsRef.current = new Set()
      setExtractedFields([])
    }

    const extracted = {}
    if (payload.produce) extracted.produce = payload.produce
    if (payload.quantity) extracted.quantity = payload.quantity
    if (payload.unit) extracted.unit = payload.unit
    if (payload.location) extracted[targetMode === 'sell' ? 'location' : 'destination'] = payload.location
    if (targetMode === 'sell' && payload.availabilityDate) extracted.harvestDate = payload.availabilityDate
    if (targetMode === 'buy' && payload.requiredByDate) extracted.requiredBy = payload.requiredByDate
    if (payload.price) extracted.price = payload.price
    if (payload.grade) extracted.quality = payload.grade

    setInput(previous => {
      const base = targetMode === mode ? previous : createFasalSaathiInput(targetMode)
      const preserved = Object.keys(extracted).filter(key => manualFieldsRef.current.has(key))
      const updates = mergeFasalSaathiExtraction(base, extracted, {
        manualFields: manualFieldsRef.current,
        autoFields: autoFieldsRef.current,
      })
      Object.keys(updates).forEach(key => autoFieldsRef.current.add(key))
      const updated = { ...base, ...updates }
      setExtractedFields(Object.keys(updates))
      setPreservedManualFields(preserved)
      setPendingVoiceChanges(preserved.length ? extracted : null)
      const unresolved = intentSpecificUnresolved(payload, targetMode)
      setNotice(Object.keys(updates).length
        ? `Transcription succeeded; extraction succeeded. Fields populated or corrected: ${Object.keys(updates).length}. Review highlighted fields.${preserved.length ? ` Preserved manual edits: ${preserved.join(', ')}.` : ''}${unresolved.length ? ` Needs clarification: ${unresolved.join(', ')}.` : ''}`
        : `Transcription succeeded; extraction succeeded, but no fields changed. Valid manual and voice values were preserved.${preserved.length ? ` Preserved manual edits: ${preserved.join(', ')}.` : ''}${unresolved.length ? ` Needs clarification: ${unresolved.join(', ')}.` : ''}`)
      return updated
    })
    setErrors([])
  }

  function applyPendingVoiceChanges() {
    if (!pendingVoiceChanges) return
    setInput(previous => {
      const updates = mergeFasalSaathiExtraction(previous, pendingVoiceChanges, { manualFields: manualFieldsRef.current, autoFields: autoFieldsRef.current, overrideManual: true })
      Object.keys(updates).forEach(key => { manualFieldsRef.current.delete(key); autoFieldsRef.current.add(key) })
      setExtractedFields(Object.keys(updates))
      setPreservedManualFields([])
      setPendingVoiceChanges(null)
      setNotice(`Voice changes applied to ${Object.keys(updates).length} field(s). Review the updated values.`)
      return { ...previous, ...updates }
    })
  }


  function submitDetails(event) {
    event.preventDefault()
    if (reviewing) {
      analyze()
      return
    }
    const validation = validateFasalSaathiInput(input, mode)
    setErrors(validation)
    if (!validation.length) setReviewing(true)
  }

  async function analyze() {
    if (busy) return
    setBusy(true); setErrors([])
    try {
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, input: buildFasalSaathiAssistantInput(input, mode) }) })
      const payload = await readAssistantResponse(response)
      setResult(payload)
    } catch (error) { setErrors([error.message || 'Analysis could not be completed. Your entries were kept.']) }
    finally { setBusy(false) }
  }

  function openActionReview() {
    setActionError(''); setActionNotice('')
    setActionValues(mode === 'sell' ? {
      produce_name: input.produce, variety: '', quantity: input.quantity, unit: input.unit,
      asking_price_per_unit: input.price || '', min_price_per_unit: input.price || '0',
      location: input.location, harvest_date: input.harvestDate, quality_grade: input.quality,
    } : {
      produce_name: input.produce, variety: '', quantity: input.quantity, unit: input.unit,
      budget_per_unit: input.price || '0', destination: input.destination || input.location,
      required_by: input.requiredBy || '', quality_requirements: input.quality,
    })
    setActionOpen(true)
  }

  async function publishAction(event) {
    event.preventDefault()
    if (actionBusy || !actionValues) return
    if (demo || !user) { setActionError('Sign in to Supabase to publish this listing or demand. Nothing has been saved.'); return }
    const quantity = Number(actionValues.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) { setActionError('Enter a quantity greater than zero.'); return }
    setActionBusy(true); setActionError(''); setActionNotice('')
    try {
      let response
      if (mode === 'sell') {
        const price = actionValues.asking_price_per_unit === '' ? null : Number(actionValues.asking_price_per_unit)
        const minimum = actionValues.min_price_per_unit === '' ? 0 : Number(actionValues.min_price_per_unit)
        if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error('Enter a valid asking price or leave it blank.')
        if (!Number.isFinite(minimum) || minimum < 0 || (price !== null && minimum > price)) throw new Error('Minimum price must be between zero and the asking price.')
        response = await createListing({
          produce_name: actionValues.produce_name.trim(), variety: actionValues.variety || null, quantity, unit: actionValues.unit,
          min_price_per_unit: minimum, asking_price_per_unit: price, state: actionValues.location,
          harvest_date: actionValues.harvest_date, quality_grade: actionValues.quality_grade,
          available_from: actionValues.harvest_date, status: 'active',
        }, user.id)
      } else {
        const budget = Number(actionValues.budget_per_unit || 0)
        if (!Number.isFinite(budget) || budget < 0) throw new Error('Enter a valid budget or zero for budget unknown.')
        response = await saveRequirement({
          produce_name: actionValues.produce_name.trim(), variety: actionValues.variety || null, quantity, unit: actionValues.unit,
          budget_per_unit: budget, destination: actionValues.destination, required_by: actionValues.required_by || null,
          quality_requirements: actionValues.quality_requirements || null, status: 'active',
        }, user.id)
      }
      if (response?.error) throw response.error
      setActionNotice(mode === 'sell' ? 'Listing saved and active.' : 'Buyer demand saved and active.')
      setActionOpen(false)
    } catch (error) {
      setActionError(error?.message || 'The record could not be saved. Nothing has been falsely marked as published.')
    } finally { setActionBusy(false) }
  }

  function revise() { setResult(null); setReviewing(false) }
  const missing = missingFasalSaathiFields(input, mode)
  const priceLabel = mode === 'sell' ? 'Current offer or expected price (optional)' : 'Budget or target price (optional)'
  const extractedFieldClass = field => extractedFields.includes(field) ? ' assistant-field extracted-field' : ' assistant-field'

  return (
    <main className="page fasalsaathi-page"><div className="container">
      <Link to={`/dashboard/${mode === 'sell' ? 'farmer' : 'buyer'}`} className="text-link">← Back to dashboard</Link>
      <div className="assistant-heading"><div><div className="eyebrow"><Bot size={14} /> Unified agricultural companion</div><h1>FasalSaathi — Your Agricultural Companion</h1><p>Use voice, a photo, or manual entry. You stay in control of every detail.</p></div><span className="assistant-mode-pill">Voice and photo do not replace manual review</span></div>
      <div className="fasalsaathi-shell">
        <section className="panel input-methods"><div className="panel-heading"><div><span>2</span><h2>Add information in any combination</h2><p>Your entries are preserved when switching methods.</p></div></div><div className="method-grid">
          <article className={`method-card voice-card ${recordingState === 'recording' ? 'recording' : ''}`}><Mic size={26} /><h3>Voice</h3>
            {!voiceSupported ? <p role="status">This browser does not support microphone recording. Manual entry remains available.</p> : <><div className="recording-status" role="status" aria-live="polite"><span className={`recording-dot ${recordingState === 'recording' ? 'active' : ''}`} /> {recordingState === 'recording' ? 'Recording' : recordingState === 'requesting' ? 'Waiting for microphone permission' : recordingState === 'recorded' ? 'Recording ready' : recordingState === 'error' ? 'Recording error' : 'Ready to record'} <strong>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</strong></div>{recordingState === 'recording' && <div className="waveform" aria-hidden="true"><i/><i/><i/><i/><i/></div>}
            {recordingState === 'recording' ? <button type="button" className="btn btn-primary" onClick={stopRecording}><MicOff size={16}/> Stop Recording</button> : <button type="button" className="btn btn-primary" disabled={recordingState === 'requesting'} onClick={startRecording}><Mic size={16}/> {recordingState === 'idle' || recordingState === 'requesting' ? 'Start Recording' : 'Retry'}</button>}
            {(recordingState === 'recorded' || transcript) && <button type="button" className="btn btn-outline" disabled={transcribing || extracting} onClick={analyzeRecording}>{transcribing ? 'Transcribing…' : extracting ? 'Extracting fields…' : 'Analyze & Fill Form'}</button>}            {(recordingState === 'recorded' || transcript) && <button type="button" className="btn btn-outline" onClick={retryRecording}>Retry</button>}
            {(recordingState === 'recorded' || transcript) && <label className="transcript-editor">Transcript preview<textarea value={transcript} rows="4" onChange={event => setTranscript(event.target.value)} placeholder="Edit the transcript before analysis" /></label>}</>}
          </article>
          <article className="method-card photo-card"><Camera size={26} /><h3>Photo</h3><p>Attach a produce photo. Visual review only.</p>
            {!photoPreview ? <div className="photo-preview photo-empty"><Camera size={28}/><span>No photo selected</span></div> : <div className="photo-preview"><img src={photoPreview} alt="Selected produce preview"/><strong>{photo?.name}</strong></div>}
            <div className="photo-actions">            <label className="btn btn-outline photo-button"><Camera size={16}/> {photoPreview ? 'Replace Photo' : 'Choose Photo'}<input aria-label={photoPreview ? 'Replace photo' : 'Choose photo'} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => { choosePhoto(event.target.files?.[0]); event.target.value = '' }}/></label>{photoPreview && <button type="button" className="btn btn-outline" onClick={removePhoto}>Remove Photo</button>}</div>          </article>
          <article className="method-card"><Paperclip size={26} /><h3>Manual</h3><p>Edit every field directly in the form below.</p><a className="btn btn-outline" href="#fasalsaathi-form">Open form</a></article>
        </div>{notice && <p className="notice-state">{notice}</p>}{pendingVoiceChanges && <button type="button" className="btn btn-outline" onClick={applyPendingVoiceChanges}>Apply voice changes to {preservedManualFields.length} protected field(s)</button>}</section>
        {!result && <form id="fasalsaathi-form" className="panel fasalsaathi-form" onSubmit={submitDetails}>
          <div className="panel-heading"><div><span>3</span><h2>{reviewing ? 'Review before analysis' : 'Review and edit details'}</h2><p>{reviewing ? 'Nothing has been analyzed yet. Confirm the values below.' : 'Required values are marked clearly; optional values may remain blank.'}</p></div>{missing.length > 0 && <span className="missing-pill">Missing: {missing.join(', ')}</span>}</div>
          {!reviewing ? <div className="form-grid">
            <label className={extractedFieldClass('produce')}>Produce / crop *<input value={input.produce} onChange={event => update('produce', event.target.value)} placeholder="e.g. Turmeric"/></label>
            <label className={extractedFieldClass('quantity')}>Quantity *<input type="number" min="0.001" step="0.001" value={input.quantity} onChange={event => update('quantity', event.target.value)}/></label>
            <label className={extractedFieldClass('unit')}>Unit *<select value={input.unit} onChange={event => update('unit', event.target.value)}><option value="kg">kg</option><option value="quintal">quintal</option><option value="tonne">tonne</option></select></label>
            <label className={extractedFieldClass(mode === 'sell' ? 'location' : 'destination')}>{mode === 'sell' ? 'Location *' : 'Delivery location *'}<input value={mode === 'sell' ? input.location : input.destination} onChange={event => update(mode === 'sell' ? 'location' : 'destination', event.target.value)} placeholder="City or district"/></label>
            <label className={extractedFieldClass(mode === 'sell' ? 'harvestDate' : 'requiredBy')}>{mode === 'sell' ? 'Harvest / availability date *' : 'Required by date'}<input type="date" value={mode === 'sell' ? input.harvestDate : input.requiredBy} onChange={event => update(mode === 'sell' ? 'harvestDate' : 'requiredBy', event.target.value)}/></label>
            <label className={extractedFieldClass('quality')}>{mode === 'sell' ? 'Quality / condition' : 'Desired quality'}<select value={input.quality} onChange={event => update('quality', event.target.value)}><option value="not sure">Not sure</option><option value="A">Grade A</option><option value="B">Grade B</option></select></label>
            <label className={extractedFieldClass('price')}>{priceLabel}<input type="number" min="0" step="0.01" value={input.price} onChange={event => update('price', event.target.value)} /></label>
          </div> : <div className="review-summary">{Object.entries(input).filter(([, value]) => String(value || '').trim()).map(([key, value]) => <div key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><strong>{String(value)}</strong></div>)}</div>}
          {errors.length > 0 && <div className="error-state">{errors.map(error => <p key={error}>{error}</p>)}</div>}
          {!reviewing ? <button className="btn btn-primary full" type="submit">Review details <ArrowRight size={16}/></button> : <><button className="btn btn-primary full" type="button" disabled={busy} onClick={analyze}>{busy ? 'Analyzing…' : 'Request analysis'} <ArrowRight size={16}/></button><button className="btn btn-outline full" type="button" onClick={() => setReviewing(false)}>Edit details</button></>}
        </form>}
        {result && <section className="panel fasalsaathi-results">
          <div className="panel-heading"><div><h2><CheckCircle2 size={22}/> Decision report</h2><small>Prepared {result.dataTimestamp ? new Date(result.dataTimestamp).toLocaleString() : 'at an unavailable time'}</small></div><span className="assistant-mode-pill">{result.live ? 'AI interpretation with deterministic calculations' : 'Degraded deterministic report'}</span></div>
          <div className="result-grid">
            <article><h3>Decision summary</h3><p><strong>{mode === 'sell' ? result.sellDecision?.action || 'Sell' : 'Buy'}</strong> · {input.produce || 'Produce not specified'} · {input.quantity} {input.unit}</p><p>{mode === 'sell' ? input.location : input.destination}</p>{input.price !== '' && <p>{mode === 'sell' ? 'Current offer' : 'Buyer budget'}: ₹{input.price}</p>}<p>{result.explanation?.executiveSummary || result.explanation?.summary || 'Deterministic figures are available; the AI interpretation could not be retrieved.'}</p><strong>{result.recommendation?.label || 'Provisional recommendation'}</strong><p>{result.recommendation?.rationale}</p>{result.sellDecision?.hold?.reason && <p><strong>Hold:</strong> {result.sellDecision.hold.reason}</p>}</article>
            <article><h3>Financial breakdown</h3>{mode === 'sell' && result.sellDecision?.suggestedAskingPrice ? <p><strong>Suggested market reference: ₹{result.sellDecision.suggestedAskingPrice.min}–₹{result.sellDecision.suggestedAskingPrice.max}/kg</strong><small> Median ₹{result.sellDecision.suggestedAskingPrice.median}/kg · not a guaranteed offer</small></p> : <p>Suggested market-based price unavailable — no sufficiently comparable market observations were found.</p>}{(Array.isArray(result.calculated) ? result.calculated : mode === 'sell' ? result.calculated : [result.calculated?.current]).filter(Boolean).slice(0, mode === 'sell' ? 1 : undefined).map((item, index) => <div className="result-row" key={index}><strong>{item.label || item.name || item.id || 'Option'}</strong><span>{item.grossRevenue != null ? `Gross proceeds ₹${item.grossRevenue}` : item.produceCost != null ? `Purchase cost ₹${item.produceCost}` : item.deliveredCost != null ? `Delivered cost ₹${item.deliveredCost}` : 'Value unavailable'}</span><small>{item.knownCosts == null ? 'Known selling costs unavailable' : `Known selling costs ₹${item.knownCosts}`}</small><small>{item.netProceeds == null ? 'Net proceeds unavailable until all applicable costs are entered.' : `Net proceeds ₹${item.netProceeds}`}</small></div>)}</article>
            <article><h3>Market comparison</h3>{result.marketEvidence?.available ? <><p><strong>{result.marketEvidence.benchmark.observationCount}</strong> comparable observations. Wholesale median: ₹{result.marketEvidence.benchmark.medianModalPricePerKg}/kg.</p><p>{result.marketEvidence.benchmark.scope} · confidence: {result.marketEvidence.benchmark.confidence}.</p>{result.marketEvidence.observations.slice(0, 8).map((observation, index) => <p key={index}>{observation.commodity} · {observation.market}, {observation.state} · {observation.observationDate} · ₹{observation.modalPrice} {observation.priceUnit}</p>)}</> : <p>{result.marketEvidence?.message || 'Verified market observations are unavailable. No market prices are assumed.'}</p>}<p>{result.explanation?.benchmarkAnalysis}</p></article>
            <article><h3>Weather outlook</h3>{result.weatherEvidence?.available ? <><p>{result.weatherEvidence.location} · {result.weatherEvidence.forecastPeriod.start} to {result.weatherEvidence.forecastPeriod.end} · {result.weatherEvidence.timezone || 'Timezone unavailable'}</p>{result.weatherEvidence.daily.slice(0, 7).map(day => <p key={day.date}>{day.date}: {day.temperatureMin != null ? `${day.temperatureMin}°–${day.temperatureMax}°C` : 'temperature unavailable'}; rain {day.precipitationSum ?? 'unknown'} mm {day.precipitationProbabilityMax != null ? `(${day.precipitationProbabilityMax}% probability)` : ''}.</p>)}</> : <p>{result.weatherEvidence?.message || 'Weather forecast unavailable.'}</p>}<p>{result.explanation?.weatherAnalysis}</p></article>
            <article><h3>Nearby farmer prices on FasalSaathi</h3>{result.platformListings?.available ? <>{result.platformListings.observations.slice(0, 8).map(item => <p key={item.id}><strong>{item.commodity}</strong> · ₹{item.pricePerKg}/kg · {item.priceType} · {item.state || 'Location unavailable'} · {item.observationDate}</p>)}<small>{result.platformListings.observations.length} comparable active asking-price observations. Asking prices are not confirmed sales.</small></> : <p>{result.platformListings?.message || 'No comparable FasalSaathi listings are available.'}</p>}</article>
            <article><h3>Shelf life and storage</h3>{result.storageGuidance?.category ? <><p><strong>{result.storageGuidance.category}</strong></p>{result.storageGuidance.sourceUrl ? <p><a href={result.storageGuidance.sourceUrl} target="_blank" rel="noreferrer">{result.storageGuidance.source}</a></p> : null}<p>{result.storageGuidance.storage}</p><small>{result.storageGuidance.assumptions}</small>{result.storageGuidance.risks?.length > 0 && <p>{result.storageGuidance.risks.join('. ')}</p>}</> : <p>Crop-specific storage guidance unavailable.</p>}</article>
            <article><h3>Recommended actions</h3>{result.explanation?.practicalNextSteps?.length ? <ol>{result.explanation.practicalNextSteps.slice(0, 5).map((step, index) => <li key={index}>{step}</li>)}</ol> : <p>{result.explanation?.situationAnalysis || result.explanation?.recommendation || 'Review the submitted inputs and available evidence before deciding.'}</p>}<button type="button" className="btn btn-primary" onClick={openActionReview}>{mode === 'sell' ? 'List Produce for Sale' : 'Post Buyer Demand'}</button></article>
            {(result.explanation?.missingInformation?.length || result.explanation?.uncertainty || result.explanation?.followUpQuestions?.length) ? <article><h3>Uncertainty and missing information</h3>{result.explanation.uncertainty && <p>{result.explanation.uncertainty}</p>}{result.explanation.missingInformation?.length > 0 && <ul>{result.explanation.missingInformation.slice(0, 5).map((item, index) => <li key={index}>{item}</li>)}</ul>}{result.explanation.followUpQuestions?.length > 0 && <ul>{result.explanation.followUpQuestions.slice(0, 3).map((question, index) => <li key={index}>{question}</li>)}</ul>}</article> : null}
            <article><h3>Sources</h3><p>Farmer-provided information: used for inputs and deterministic calculations.</p>{result.marketEvidence?.available && result.marketEvidence.sourceUrl && <p><a href={result.marketEvidence.sourceUrl} target="_blank" rel="noreferrer">data.gov.in market resource</a></p>}{result.weatherEvidence?.available && <p><a href={result.weatherEvidence.sourceUrl} target="_blank" rel="noreferrer">Open-Meteo weather forecast</a></p>}<p>{result.live ? 'Groq AI interpretation: used for narrative analysis only; financial totals are deterministic.' : 'Groq AI interpretation unavailable; no AI-generated narrative is claimed.'}</p></article>
          </div>{actionOpen && actionValues && <form className="confirmation-panel" onSubmit={publishAction}><h3>Confirm {mode === 'sell' ? 'listing' : 'buyer demand'}</h3>{mode === 'sell' ? <><label>Produce<input value={actionValues.produce_name} onChange={event => setActionValues({...actionValues, produce_name: event.target.value})}/></label><label>Quantity<input type="number" min="0.001" step="0.001" value={actionValues.quantity} onChange={event => setActionValues({...actionValues, quantity: event.target.value})}/></label><label>Unit<select value={actionValues.unit} onChange={event => setActionValues({...actionValues, unit: event.target.value})}><option value="kg">kg</option><option value="quintal">quintal</option><option value="tonne">tonne</option></select></label><label>Location<input value={actionValues.location} onChange={event => setActionValues({...actionValues, location: event.target.value})}/></label><label>Asking price per unit (blank allowed)<input type="number" min="0" step="0.01" value={actionValues.asking_price_per_unit} onChange={event => setActionValues({...actionValues, asking_price_per_unit: event.target.value})}/></label><label>Minimum accepted price<input type="number" min="0" step="0.01" value={actionValues.min_price_per_unit} onChange={event => setActionValues({...actionValues, min_price_per_unit: event.target.value})}/></label></> : <><label>Produce<input value={actionValues.produce_name} onChange={event => setActionValues({...actionValues, produce_name: event.target.value})}/></label><label>Quantity<input type="number" min="0.001" step="0.001" value={actionValues.quantity} onChange={event => setActionValues({...actionValues, quantity: event.target.value})}/></label><label>Delivery location<input value={actionValues.destination} onChange={event => setActionValues({...actionValues, destination: event.target.value})}/></label><label>Required by<input type="date" value={actionValues.required_by} onChange={event => setActionValues({...actionValues, required_by: event.target.value})}/></label><label>Budget per unit<input type="number" min="0" step="0.01" value={actionValues.budget_per_unit} onChange={event => setActionValues({...actionValues, budget_per_unit: event.target.value})}/></label></>}{actionError && <div className="error-state"><p>{actionError}</p></div>}<button className="btn btn-primary" type="submit" disabled={actionBusy}>{actionBusy ? 'Saving…' : mode === 'sell' ? 'Confirm & publish listing' : 'Confirm & post demand'}</button><button className="btn btn-outline" type="button" onClick={() => setActionOpen(false)}>Cancel</button></form>}{actionNotice && <p className="notice-state">{actionNotice}</p>}<button type="button" className="btn btn-outline" onClick={revise}><RefreshCw size={16}/> Revise details</button>
        </section>}
      </div>
    </div></main>
  )
}
