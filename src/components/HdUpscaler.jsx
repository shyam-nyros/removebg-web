import { useState, useRef, useCallback } from 'react'
import BeforeAfter from './BeforeAfter'

const SCALES = [1.5, 2, 3, 4]
const MAX_DIM = 8192

/* ── Sharpen kernels ── */
function applySharpen(ctx, w, h, strength, mode) {
  if (strength === 0) return
  const d = ctx.getImageData(0, 0, w, h)
  const px = d.data
  const orig = new Uint8ClampedArray(px)
  const k = strength

  // Photo: gentle 3×3 unsharp mask  |  Illustration: crisp Laplacian boost
  const K = mode === 'illustration'
    ? [0, -k, 0, -k, 1 + 4 * k, -k, 0, -k, 0]
    : [-k/6, -k/6, -k/6, -k/6, 1 + (8*k)/6, -k/6, -k/6, -k/6, -k/6]

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let v = 0
        for (let ky = -1; ky <= 1; ky++)
          for (let kx = -1; kx <= 1; kx++)
            v += orig[((y + ky) * w + (x + kx)) * 4 + c] * K[(ky + 1) * 3 + (kx + 1)]
        px[(y * w + x) * 4 + c] = Math.min(255, Math.max(0, v))
      }
    }
  }
  ctx.putImageData(d, 0, 0)
}

/* ── Multi-step bicubic upscale ── */
function upscaleStep(src, srcW, srcH, dstW, dstH) {
  const c = document.createElement('canvas')
  c.width = dstW; c.height = dstH
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, dstW, dstH)
  return c
}

async function performUpscale(file, scale, sharpenStr, mode) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const src = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(src)
      const sw = img.naturalWidth
      const sh = img.naturalHeight

      let dw = Math.round(sw * scale)
      let dh = Math.round(sh * scale)

      // Clamp to browser canvas limit
      if (dw > MAX_DIM || dh > MAX_DIM) {
        const r = Math.min(MAX_DIM / dw, MAX_DIM / dh)
        dw = Math.round(dw * r); dh = Math.round(dh * r)
      }

      // Multi-step: max 2× per hop for better interpolation quality
      let current = img
      let cw = sw, ch = sh

      while (cw < dw || ch < dh) {
        const nw = Math.min(dw, cw * 2)
        const nh = Math.min(dh, ch * 2)
        current = upscaleStep(current, cw, ch, nw, nh)
        cw = nw; ch = nh
      }

      // Ensure final canvas is exactly the right size
      let finalCanvas
      if (cw !== dw || ch !== dh) {
        finalCanvas = upscaleStep(current, cw, ch, dw, dh)
      } else {
        finalCanvas = current
      }

      // Apply sharpening
      if (sharpenStr > 0) {
        applySharpen(finalCanvas.getContext('2d'), dw, dh, sharpenStr, mode)
      }

      finalCanvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Canvas export failed')); return }
        resolve({ blob, sw, sh, dw, dh })
      }, 'image/png')
    }

    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

export default function HdUpscaler() {
  const [phase,       setPhase]       = useState('idle')
  const [scale,       setScale]       = useState(2)
  const [sharpen,     setSharpen]     = useState(0.4)
  const [mode,        setMode]        = useState('photo')
  const [originalUrl, setOriginalUrl] = useState(null)
  const [outputUrl,   setOutputUrl]   = useState(null)
  const [outputBlob,  setOutputBlob]  = useState(null)
  const [info,        setInfo]        = useState(null)
  const [errorMsg,    setErrorMsg]    = useState('')
  const [dragOver,    setDragOver]    = useState(false)

  const fileInputRef = useRef(null)
  const fileRef      = useRef(null)
  const runId        = useRef(0)

  const process = useCallback(async (file, scl, shr, md) => {
    if (!file?.type.startsWith('image/')) return
    const myId = ++runId.current

    setErrorMsg('')
    setPhase('processing')
    setOutputUrl(null); setOutputBlob(null); setInfo(null)
    setOriginalUrl(URL.createObjectURL(file))

    try {
      const result = await performUpscale(file, scl, shr, md)
      if (myId !== runId.current) return

      setOutputBlob(result.blob)
      setOutputUrl(URL.createObjectURL(result.blob))
      setInfo({ sw: result.sw, sh: result.sh, dw: result.dw, dh: result.dh })
      setPhase('done')
    } catch (err) {
      if (myId !== runId.current) return
      console.error(err)
      setErrorMsg('Failed to process image. Please try another file.')
      setPhase('error')
    }
  }, [])

  const handleFile  = (file) => { if (file) { fileRef.current = file; process(file, scale, sharpen, mode) } }
  const handleInput = (e)   => handleFile(e.target.files[0])
  const handleDrop  = (e)   => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }

  const rerun = (s = scale, shr = sharpen, md = mode) => {
    if (fileRef.current) process(fileRef.current, s, shr, md)
  }

  const updateScale = (s)   => { setScale(s);   rerun(s, sharpen, mode) }
  const updateMode  = (m)   => { setMode(m);    rerun(scale, sharpen, m) }
  const updateSharpen = (v) => {
    const num = parseFloat(v)
    setSharpen(num)
    rerun(scale, num, mode)
  }

  const download = () => {
    if (!outputBlob) return
    const url = URL.createObjectURL(outputBlob)
    Object.assign(document.createElement('a'), { href: url, download: `hd-${scale}x.png` }).click()
    URL.revokeObjectURL(url)
  }

  const reset = () => {
    setPhase('idle')
    setOriginalUrl(null); setOutputUrl(null); setOutputBlob(null); setInfo(null)
    setErrorMsg(''); fileRef.current = null
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const Controls = (
    <div className="options-bar">
      <div className="opt-group">
        <span className="opt-lbl">Scale</span>
        <div className="pill-group">
          {SCALES.map((s) => (
            <button key={s} className={`pill-btn${scale === s ? ' active' : ''}`} onClick={() => updateScale(s)}>
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="opt-group">
        <span className="opt-lbl">Mode</span>
        <div className="pill-group">
          {[['photo','Photo'],['illustration','Illustration']].map(([id, label]) => (
            <button key={id} className={`pill-btn${mode === id ? ' active' : ''}`} onClick={() => updateMode(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="opt-group">
        <span className="opt-lbl">Sharpen — {Math.round(sharpen * 100)}%</span>
        <div className="range-wrap">
          <div className="range-row">
            <input
              type="range" className="range-input"
              min="0" max="0.8" step="0.05"
              value={sharpen}
              onChange={(e) => updateSharpen(e.target.value)}
            />
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
          {Controls}
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div className="dz-title">Drop your image here</div>
            <div className="dz-sub">Upscale up to 4× with multi-step bicubic<br/>Smart sharpening · up to 8192 px output</div>
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
            <span className="chip">Multi-step bicubic upscaling</span>
            <span className="chip">Photo &amp; illustration modes</span>
            <span className="chip">Adjustable sharpening</span>
            <span className="chip">Up to 8192 px output</span>
          </div>
        </>
      )}

      {/* ── Processing ── */}
      {phase === 'processing' && (
        <>
          {Controls}
          <div className="canvas-row">
            <div className="canvas-card">
              <div className="canvas-card-head"><span className="cc-title">Original</span></div>
              <div className="canvas-card-body"><img src={originalUrl} alt="original" /></div>
            </div>
            <div className="canvas-card">
              <div className="canvas-card-head">
                <span className="cc-title">HD {scale}×</span>
                <span className="cc-dim">upscaling…</span>
              </div>
              <div className="canvas-card-body">
                <div className="proc-placeholder">
                  <div className="proc-ring" />
                  Upscaling…
                </div>
              </div>
            </div>
          </div>
          <div className="progress-block">
            <div className="progress-lbl">
              <span className="spin-ring" />
              Upscaling to {scale}× · {mode} mode · sharpen {Math.round(sharpen * 100)}%
            </div>
            <div className="progress-track">
              <div className="progress-sweep" />
            </div>
          </div>
        </>
      )}

      {/* ── Done ── */}
      {phase === 'done' && (
        <>
          {Controls}

          <BeforeAfter before={originalUrl} after={outputUrl} />

          {info && (
            <div className="status status-ok">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {info.sw}×{info.sh} → {info.dw}×{info.dh} px &nbsp;·&nbsp; {scale}× &nbsp;·&nbsp; {mode} mode
            </div>
          )}

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
