import { useState, useRef, useCallback } from 'react'
import { removeBackground } from '@imgly/background-removal'
import BeforeAfter from './BeforeAfter'

/* ── Post-process: smooth alpha edges & remove fringe ── */
async function refineAlpha(blob) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(img.src)

      const d = ctx.getImageData(0, 0, w, h)
      const px = d.data
      const origA = new Uint8Array(w * h)

      // Pass 1: hard-threshold low-alpha noise
      for (let i = 0; i < w * h; i++) {
        let a = px[i * 4 + 3]
        if (a < 10) a = 0
        else if (a > 245) a = 255
        px[i * 4 + 3] = a
        origA[i] = a
      }

      // Pass 2: smooth transition band (3×3 box blur on semi-transparent pixels)
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const a = origA[y * w + x]
          if (a === 0 || a === 255) continue
          let sum = 0
          for (let ky = -1; ky <= 1; ky++)
            for (let kx = -1; kx <= 1; kx++)
              sum += origA[(y + ky) * w + (x + kx)]
          px[(y * w + x) * 4 + 3] = Math.round(sum / 9)
        }
      }

      // Pass 3: suppress color fringing on near-transparent edge pixels
      const smoothA = new Uint8Array(w * h)
      for (let i = 0; i < w * h; i++) smoothA[i] = px[i * 4 + 3]
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const a = smoothA[y * w + x]
          if (a === 0 || a > 30) continue
          // Blend RGB toward average of opaque neighbours
          let rSum = 0, gSum = 0, bSum = 0, cnt = 0
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const ni = ((y + ky) * w + (x + kx)) * 4
              if (smoothA[(y + ky) * w + (x + kx)] > 128) {
                rSum += px[ni]; gSum += px[ni + 1]; bSum += px[ni + 2]; cnt++
              }
            }
          }
          if (cnt > 0) {
            const base = (y * w + x) * 4
            px[base]     = Math.round(rSum / cnt)
            px[base + 1] = Math.round(gSum / cnt)
            px[base + 2] = Math.round(bSum / cnt)
          }
        }
      }

      ctx.putImageData(d, 0, 0)
      canvas.toBlob(resolve, 'image/png')
    }
    img.src = URL.createObjectURL(blob)
  })
}

/* ── Composite onto a background colour ── */
async function compositeOnBg(blob, bgColor) {
  if (bgColor === 'transparent') return blob
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(img.src)
      canvas.toBlob(resolve, 'image/png')
    }
    img.src = URL.createObjectURL(blob)
  })
}

const BG_SWATCHES = [
  { id: 'transparent', label: 'Transparent' },
  { id: '#ffffff',     label: 'White'       },
  { id: '#111111',     label: 'Black'       },
]

export default function BgRemover() {
  const [phase,       setPhase]       = useState('idle')
  const [progress,    setProgress]    = useState(0)
  const [progLabel,   setProgLabel]   = useState('')
  const [originalUrl, setOriginalUrl] = useState(null)
  const [resultUrl,   setResultUrl]   = useState(null)
  const [resultBlob,  setResultBlob]  = useState(null)
  const [bgColor,     setBgColor]     = useState('transparent')
  const [customColor, setCustomColor] = useState('#4f46e5')
  const [errorMsg,    setErrorMsg]    = useState('')
  const [dragOver,    setDragOver]    = useState(false)

  const fileInputRef  = useRef(null)
  const rawBlobRef    = useRef(null)  // refined alpha blob before compositing

  /* Apply the chosen background to the already-processed blob */
  const applyBg = useCallback(async (blob, color) => {
    const composited = await compositeOnBg(blob, color)
    setResultBlob(composited)
    const url = URL.createObjectURL(composited)
    setResultUrl(url)
  }, [])

  const handleBgChange = async (color) => {
    setBgColor(color)
    if (rawBlobRef.current) await applyBg(rawBlobRef.current, color)
  }

  const handleCustomColor = async (e) => {
    setCustomColor(e.target.value)
    setBgColor(e.target.value)
    if (rawBlobRef.current) await applyBg(rawBlobRef.current, e.target.value)
  }

  const processFile = useCallback(async (file) => {
    if (!file?.type.startsWith('image/')) return

    setErrorMsg('')
    setPhase('processing')
    setProgress(0)
    setProgLabel('Loading AI model…')
    setResultUrl(null)
    setResultBlob(null)
    rawBlobRef.current = null

    const origUrl = URL.createObjectURL(file)
    setOriginalUrl(origUrl)

    try {
      const raw = await removeBackground(file, {
        model: 'isnet',
        progress: (key, current, total) => {
          if (total > 0) {
            const pct = Math.round((current / total) * 100)
            setProgress(pct)
            setProgLabel(key === 'compute:inference'
              ? `Removing background… ${pct}%`
              : `Loading model… ${pct}%`)
          }
        },
        output: { format: 'image/png', quality: 1 },
      })

      const refined = await refineAlpha(raw)
      rawBlobRef.current = refined

      await applyBg(refined, bgColor)
      setPhase('done')
    } catch (err) {
      console.error(err)
      setErrorMsg('Processing failed — please try another image.')
      setPhase('error')
    }
  }, [bgColor, applyBg])

  const handleFile = (file) => { if (file) processFile(file) }
  const handleInput = (e)  => handleFile(e.target.files[0])
  const handleDrop  = (e)  => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }

  const download = () => {
    if (!resultBlob) return
    const url = URL.createObjectURL(resultBlob)
    const ext = bgColor === 'transparent' ? 'png' : 'png'
    Object.assign(document.createElement('a'), { href: url, download: `bg-removed.${ext}` }).click()
    URL.revokeObjectURL(url)
  }

  const reset = () => {
    setPhase('idle'); setProgress(0)
    setOriginalUrl(null); setResultUrl(null); setResultBlob(null)
    rawBlobRef.current = null; setErrorMsg('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /* Shared bg-color picker (shown in idle + done) */
  const BgPicker = (
    <div className="options-bar">
      <div className="opt-group">
        <span className="opt-lbl">Background</span>
        <div className="swatch-row">
          {BG_SWATCHES.map((s) => (
            <div
              key={s.id}
              className={`swatch ${s.id === 'transparent' ? 'swatch-tp' : s.id === '#ffffff' ? 'swatch-white' : 'swatch-black'} ${bgColor === s.id ? 'active' : ''}`}
              title={s.label}
              onClick={() => handleBgChange(s.id)}
            />
          ))}
          <div
            className={`swatch swatch-custom ${!['transparent','#ffffff','#111111'].includes(bgColor) ? 'active' : ''}`}
            title="Custom colour"
            style={{ background: customColor }}
          >
            <input type="color" value={customColor} onChange={handleCustomColor} />
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* ── Idle ── */}
      {phase === 'idle' && (
        <>
          {BgPicker}
          <div
            className={`drop-zone${dragOver ? ' drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="drop-zone-corner tl" />
            <div className="drop-zone-corner tr" />
            <div className="drop-zone-corner bl" />
            <div className="drop-zone-corner br" />
            <div className="dz-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="3" strokeDasharray="5 3"/>
                <circle cx="12" cy="10" r="3"/>
                <path d="M7 21c0-3 2.2-5 5-5s5 2 5 5"/>
              </svg>
            </div>
            <div className="dz-title">Drop your image here</div>
            <div className="dz-sub">PNG · JPG · WEBP supported<br/>ISNet AI runs entirely in your browser</div>
            <button
              className="btn btn-primary"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Choose Image
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleInput} />
          <div className="chips">
            <span className="chip">ISNet full-precision model</span>
            <span className="chip">Alpha edge refinement</span>
            <span className="chip">Custom background fill</span>
          </div>
        </>
      )}

      {/* ── Processing ── */}
      {phase === 'processing' && (
        <>
          <div className="canvas-row">
            <div className="canvas-card">
              <div className="canvas-card-head"><span className="cc-title">Original</span></div>
              <div className="canvas-card-body"><img src={originalUrl} alt="original" /></div>
            </div>
            <div className="canvas-card">
              <div className="canvas-card-head"><span className="cc-title">Processing…</span></div>
              <div className="canvas-card-body">
                <div className="proc-placeholder">
                  <div className="proc-ring" />
                  Analysing image…
                </div>
              </div>
            </div>
          </div>
          <div className="progress-block">
            <div className="progress-lbl">
              <span className="spin-ring" />
              {progLabel}
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </>
      )}

      {/* ── Done ── */}
      {phase === 'done' && (
        <>
          {BgPicker}

          <BeforeAfter
            before={originalUrl}
            after={resultUrl}
            checkerAfter={bgColor === 'transparent'}
          />

          <div className="status status-ok">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Background removed · edges refined · ready to download
          </div>

          <div className="actions">
            <button className="btn btn-success" onClick={download}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download PNG
            </button>
            <button className="btn btn-ghost" onClick={reset}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.1"/>
              </svg>
              New Image
            </button>
          </div>
        </>
      )}

      {/* ── Error ── */}
      {phase === 'error' && (
        <>
          <div className="status status-err">{errorMsg}</div>
          <button className="btn btn-ghost" onClick={reset}>Try Again</button>
        </>
      )}
    </>
  )
}
