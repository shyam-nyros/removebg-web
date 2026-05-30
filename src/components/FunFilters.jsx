import { useState, useRef, useCallback } from 'react'
import BeforeAfter from './BeforeAfter'

/* ── Canvas pixel filters ──────────────────────────── */
function runFilter(canvas, filterId) {
  if (filterId === 'normal') return

  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext('2d')

  /* Mirror is a transform op, not pixel-level */
  if (filterId === 'mirror') {
    const tmp = document.createElement('canvas')
    tmp.width = w; tmp.height = h
    tmp.getContext('2d').drawImage(canvas, 0, 0)
    ctx.save()
    ctx.scale(-1, 1)
    ctx.drawImage(tmp, -w, 0)
    ctx.restore()
    return
  }

  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data
  const o = new Uint8ClampedArray(d) // original, read-only

  const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)))

  /* tiny deterministic hash for seeded patterns */
  const hash = (n) => ((n * 1664525 + 1013904223) >>> 0) / 0xffffffff

  switch (filterId) {

    case 'glitch': {
      const shift = Math.max(5, Math.floor(w * 0.028))
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i  = (y * w + x) * 4
          const ri = (y * w + Math.min(w - 1, x + shift)) * 4
          const bi = (y * w + Math.max(0, x - shift)) * 4
          d[i]     = o[ri]       // R channel → right
          d[i + 1] = o[i + 1]   // G → normal
          d[i + 2] = o[bi + 2]  // B channel → left
        }
      }
      /* deterministic scan-line tears */
      for (let b = 0; b < 10; b++) {
        const yPos  = Math.floor(hash(b * 7 + 1) * h)
        const bh    = 2 + (b % 5)
        const xOff  = Math.floor((hash(b * 3 + 9) - 0.5) * 50)
        for (let dy = 0; dy < bh; dy++) {
          const row = Math.min(h - 1, yPos + dy)
          for (let x = 0; x < w; x++) {
            const sx = Math.min(w - 1, Math.max(0, x + xOff))
            const di = (row * w + x) * 4
            const si = (row * w + sx) * 4
            d[di] = o[si]; d[di + 1] = o[si + 1]; d[di + 2] = o[si + 2]
          }
        }
      }
      break
    }

    case 'vaporwave': {
      for (let i = 0; i < d.length; i += 4) {
        const gray = o[i] * 0.299 + o[i+1] * 0.587 + o[i+2] * 0.114
        const t = gray / 255
        // map dark→purple, bright→hot-pink
        d[i]     = clamp(108 + (255 - 108) * t)
        d[i + 1] = clamp(40  + (80  - 40)  * t)
        d[i + 2] = clamp(220 + (180 - 220) * t)
      }
      break
    }

    case 'cartoon': {
      /* posterise to 5 levels */
      for (let i = 0; i < d.length; i += 4) {
        d[i]     = Math.round(o[i]     / 51) * 51
        d[i + 1] = Math.round(o[i + 1] / 51) * 51
        d[i + 2] = Math.round(o[i + 2] / 51) * 51
      }
      /* crude edge darkening: compare each pixel to right neighbour */
      const e = new Uint8ClampedArray(d)
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i  = (y * w + x) * 4
          const ir = (y * w + x + 1) * 4
          const ib = ((y + 1) * w + x) * 4
          const diff = Math.abs(e[i] - e[ir]) + Math.abs(e[i+1] - e[ir+1]) +
                       Math.abs(e[i] - e[ib]) + Math.abs(e[i+1] - e[ib+1])
          if (diff > 80) { d[i] = 0; d[i+1] = 0; d[i+2] = 0 }
        }
      }
      break
    }

    case 'neon': {
      for (let i = 0; i < d.length; i += 4) {
        const r = 255 - o[i], g = 255 - o[i+1], b = 255 - o[i+2]
        const avg = (r + g + b) / 3
        const s = 2.8
        d[i]     = clamp(avg + (r - avg) * s)
        d[i + 1] = clamp(avg + (g - avg) * s)
        d[i + 2] = clamp(avg + (b - avg) * s)
      }
      break
    }

    case 'vintage': {
      for (let i = 0; i < d.length; i += 4) {
        const r = o[i], g = o[i+1], b = o[i+2]
        let sr = clamp(r * 0.393 + g * 0.769 + b * 0.189)
        let sg = clamp(r * 0.349 + g * 0.686 + b * 0.168)
        let sb = clamp(r * 0.272 + g * 0.534 + b * 0.131)
        /* film grain via deterministic noise */
        const grain = (Math.sin(i * 127.1) * 43758.5453 % 1) * 28 - 14
        d[i]     = clamp(sr + grain)
        d[i + 1] = clamp(sg + grain * 0.8)
        d[i + 2] = clamp(sb + grain * 0.5)
      }
      /* vignette */
      const cx = w / 2, cy = h / 2
      const maxD = Math.sqrt(cx * cx + cy * cy)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4
          const vig = Math.max(0, 1 - (Math.sqrt((x-cx)**2+(y-cy)**2) / maxD) * 1.5)
          d[idx]   = clamp(d[idx]   * vig)
          d[idx+1] = clamp(d[idx+1] * vig)
          d[idx+2] = clamp(d[idx+2] * vig)
        }
      }
      break
    }

    case 'infrared': {
      for (let i = 0; i < d.length; i += 4) {
        const r = o[i], g = o[i+1], b = o[i+2]
        d[i]     = clamp(g * 1.5)               // green → red (vegetation bright)
        d[i + 1] = clamp(r * 0.5 + b * 0.4)
        d[i + 2] = clamp(b * 0.25)              // blue very dark
      }
      break
    }

    case 'mirror': break // handled above

    case 'pixel': {
      const bsz = Math.max(6, Math.floor(Math.min(w, h) / 72))
      for (let by = 0; by < h; by += bsz) {
        for (let bx = 0; bx < w; bx += bsz) {
          let r = 0, g = 0, b = 0, cnt = 0
          for (let y = by; y < Math.min(h, by + bsz); y++) {
            for (let x = bx; x < Math.min(w, bx + bsz); x++) {
              const idx = (y * w + x) * 4
              r += o[idx]; g += o[idx+1]; b += o[idx+2]; cnt++
            }
          }
          r /= cnt; g /= cnt; b /= cnt
          for (let y = by; y < Math.min(h, by + bsz); y++) {
            for (let x = bx; x < Math.min(w, bx + bsz); x++) {
              const idx = (y * w + x) * 4
              d[idx] = r; d[idx+1] = g; d[idx+2] = b
            }
          }
        }
      }
      break
    }

    case 'trippy': {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1
        if (t < 1/6) return p + (q - p) * 6 * t
        if (t < 1/2) return q
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
        return p
      }
      for (let i = 0; i < d.length; i += 4) {
        let r = o[i]/255, g = o[i+1]/255, b = o[i+2]/255
        const max = Math.max(r,g,b), min = Math.min(r,g,b), delta = max - min
        let h = 0, s = 0, l = (max + min) / 2
        if (delta > 0) {
          s = delta / (l > 0.5 ? 2 - max - min : max + min)
          if (max === r) h = ((g - b) / delta + (g < b ? 6 : 0)) / 6
          else if (max === g) h = ((b - r) / delta + 2) / 6
          else h = ((r - g) / delta + 4) / 6
        }
        h = (h + 0.5) % 1   // rotate hue 180°
        s = Math.min(1, s * 2.4)
        if (s === 0) { r = g = b = l }
        else {
          const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s
          const p2 = 2 * l - q2
          r = hue2rgb(p2, q2, h + 1/3)
          g = hue2rgb(p2, q2, h)
          b = hue2rgb(p2, q2, h - 1/3)
        }
        d[i] = clamp(r*255); d[i+1] = clamp(g*255); d[i+2] = clamp(b*255)
      }
      break
    }

    case 'xray': {
      for (let i = 0; i < d.length; i += 4) {
        const gray = clamp(o[i]*0.299 + o[i+1]*0.587 + o[i+2]*0.114)
        const inv  = 255 - gray
        d[i] = clamp(inv * 0.4); d[i+1] = clamp(inv * 0.95); d[i+2] = inv
      }
      break
    }

    case 'thermal': {
      for (let i = 0; i < d.length; i += 4) {
        const gray = o[i]*0.299 + o[i+1]*0.587 + o[i+2]*0.114
        const t = gray / 255
        if (t < 0.25)      { d[i]=0;           d[i+1]=0;               d[i+2]=clamp(t*4*255) }
        else if (t < 0.5)  { d[i]=0;           d[i+1]=clamp((t-0.25)*4*255); d[i+2]=255 }
        else if (t < 0.75) { d[i]=clamp((t-0.5)*4*255); d[i+1]=255;    d[i+2]=clamp((1-(t-0.5)*4)*255) }
        else               { d[i]=255;          d[i+1]=clamp((1-t)*4*255); d[i+2]=0 }
      }
      break
    }

    /* ── FACE EFFECTS ─────────────────────────────── */

    case 'joker': {
      // Pass 1 — dramatic clown colour mapping
      for (let i = 0; i < d.length; i += 4) {
        const r = o[i], g = o[i+1], b = o[i+2]
        const lum = r * 0.299 + g * 0.587 + b * 0.114

        // Vivid red pixels (lips, wounds, existing warm tones) → crimson
        const isRed = r > 120 && r > g * 1.75 && r > b * 1.75
        // Dark pixels (hair, deep shadows) → sickly green
        const isDark = lum < 68

        let nr, ng, nb
        if (isRed) {
          nr = clamp(r * 1.35 + 25)
          ng = clamp(g * 0.18)
          nb = clamp(b * 0.18)
        } else if (isDark) {
          const t = lum / 68
          nr = clamp(lum * 0.18)
          ng = clamp(lum * 0.85 + 45 * (1 - t))  // green hair
          nb = clamp(lum * 0.28)
        } else {
          // Skin → pale white with purple cast
          const p = 0.64
          nr = clamp(r + (255 - r) * p + 10)
          ng = clamp(g + (255 - g) * p * 0.86)
          nb = clamp(b + (255 - b) * p * 0.72 + 28)  // violet push
          // Boost contrast on bleached tones
          nr = clamp((nr - 128) * 1.28 + 128)
          ng = clamp((ng - 128) * 1.28 + 128)
          nb = clamp((nb - 128) * 1.28 + 128)
        }
        d[i] = nr; d[i+1] = ng; d[i+2] = nb
      }
      // Pass 2 — painted posterise (6 levels)
      for (let i = 0; i < d.length; i += 4) {
        d[i]   = Math.round(d[i]   / 42) * 42
        d[i+1] = Math.round(d[i+1] / 42) * 42
        d[i+2] = Math.round(d[i+2] / 42) * 42
      }
      break
    }

    case 'ghostface': {
      // Pass 1 — icy desaturate
      for (let i = 0; i < d.length; i += 4) {
        const gray = o[i] * 0.299 + o[i+1] * 0.587 + o[i+2] * 0.114
        d[i]   = clamp(gray * 0.80)   // pull red down
        d[i+1] = clamp(gray * 0.86)   // pull green down
        d[i+2] = clamp(gray * 1.22)   // icy blue boost
      }
      // Pass 2 — extreme contrast
      for (let i = 0; i < d.length; i += 4) {
        const c = 2.5
        d[i]   = clamp((d[i]   - 128) * c + 128)
        d[i+1] = clamp((d[i+1] - 128) * c + 128)
        d[i+2] = clamp((d[i+2] - 128) * c + 128)
      }
      // Pass 3 — ghostly bloom: spread glow from bright (white face) pixels
      const snap = new Uint8ClampedArray(d)
      for (let y = 3; y < h - 3; y++) {
        for (let x = 3; x < w - 3; x++) {
          const i = (y * w + x) * 4
          if (snap[i+2] > 195) {           // only bloom bright-cold pixels
            let sr = 0, sg = 0, sb = 0
            for (let dy = -3; dy <= 3; dy++)
              for (let dx = -3; dx <= 3; dx++) {
                const ni = ((y+dy)*w + (x+dx)) * 4
                sr += snap[ni]; sg += snap[ni+1]; sb += snap[ni+2]
              }
            const n = 49
            d[i]   = clamp(d[i]   * 0.3 + (sr/n) * 0.7 + 12)
            d[i+1] = clamp(d[i+1] * 0.3 + (sg/n) * 0.7 + 18)
            d[i+2] = clamp(d[i+2] * 0.3 + (sb/n) * 0.7 + 38)
          }
        }
      }
      // Pass 4 — heavy dark vignette
      const cvx = w / 2, cvy = h / 2
      const mxD = Math.sqrt(cvx*cvx + cvy*cvy)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y*w+x)*4
          const vig = Math.pow(Math.max(0, 1 - Math.sqrt((x-cvx)**2+(y-cvy)**2) / mxD * 1.55), 0.5)
          d[idx]   = clamp(d[idx]   * vig)
          d[idx+1] = clamp(d[idx+1] * vig)
          d[idx+2] = clamp(d[idx+2] * vig)
        }
      }
      break
    }

    default: break
  }

  ctx.putImageData(imgData, 0, 0)
}

async function filterImage(img, filterId) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width  = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d').drawImage(img, 0, 0)
    runFilter(canvas, filterId)
    canvas.toBlob((blob) => resolve(URL.createObjectURL(blob)), 'image/png')
  })
}

/* ── Filter catalogue ──────────────────────────────── */
const FILTERS = [
  { id:'normal',    label:'Original',  emoji:'✦',  color:'#6b7280', desc:'No filter' },
  { id:'glitch',    label:'Glitch',    emoji:'👾', color:'#06b6d4', desc:'RGB channel shift' },
  { id:'vaporwave', label:'Vaporwave', emoji:'🌸', color:'#a855f7', desc:'Synthwave dream' },
  { id:'pixel',     label:'Pixel Art', emoji:'🕹️', color:'#f59e0b', desc:'8-bit retro' },
  { id:'cartoon',   label:'Cartoon',   emoji:'🎨', color:'#10b981', desc:'Comic book edges' },
  { id:'neon',      label:'Neon',      emoji:'💡', color:'#ec4899', desc:'Electric invert' },
  { id:'vintage',   label:'Vintage',   emoji:'📷', color:'#d97706', desc:'Film grain + vignette' },
  { id:'mirror',    label:'Mirror',    emoji:'🪞', color:'#3b82f6', desc:'Symmetric flip' },
  { id:'trippy',    label:'Trippy',    emoji:'🌀', color:'#8b5cf6', desc:'Hue rotate 180°' },
  { id:'infrared',  label:'Infrared',  emoji:'🔴', color:'#ef4444', desc:'Heat vision' },
  { id:'xray',      label:'X-Ray',     emoji:'🦴', color:'#22d3ee', desc:'Cyan negative' },
  { id:'thermal',   label:'Thermal',   emoji:'🌡️', color:'#f97316', desc:'Heat map palette' },
]

const FACE_FILTERS = [
  {
    id: 'joker',
    label: 'Joker Face',
    emoji: '🃏',
    color: '#7c3aed',
    desc: 'Pale skin · crimson lips · green-tinted shadows · purple cast',
    gradient: 'linear-gradient(135deg, rgba(124,58,237,.22), rgba(34,197,94,.12))',
  },
  {
    id: 'ghostface',
    label: 'Ghost Face',
    emoji: '👻',
    color: '#94a3b8',
    desc: 'Ice-cold B&W · extreme contrast · spectral glow · deep vignette',
    gradient: 'linear-gradient(135deg, rgba(148,163,184,.18), rgba(59,130,246,.10))',
  },
]

const ALL_FILTERS = [...FILTERS, ...FACE_FILTERS]

/* ── Component ─────────────────────────────────────── */
export default function FunFilters() {
  const [phase,       setPhase]       = useState('idle')
  const [originalUrl, setOriginalUrl] = useState(null)
  const [filteredUrl, setFilteredUrl] = useState(null)
  const [activeFilter,setActiveFilter]= useState('normal')
  const [applying,    setApplying]    = useState(false)
  const [dragOver,    setDragOver]    = useState(false)
  const [errorMsg,    setErrorMsg]    = useState('')

  const fileInputRef = useRef(null)
  const imgRef       = useRef(null)

  const processFile = useCallback((file) => {
    if (!file?.type.startsWith('image/')) return
    setErrorMsg(''); setPhase('loading')
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setOriginalUrl(url)
      setFilteredUrl(url)
      setActiveFilter('normal')
      setPhase('done')
    }
    img.onerror = () => { setErrorMsg('Could not load image.'); setPhase('error') }
    img.src = url
  }, [])

  const selectFilter = useCallback(async (id) => {
    if (!imgRef.current || applying) return
    setActiveFilter(id); setApplying(true)
    try {
      if (id === 'normal') { setFilteredUrl(originalUrl) }
      else { setFilteredUrl(await filterImage(imgRef.current, id)) }
    } finally { setApplying(false) }
  }, [originalUrl, applying])

  const handleFile  = (file) => { if (file) processFile(file) }
  const handleInput = (e)    => handleFile(e.target.files[0])
  const handleDrop  = (e)    => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }

  const download = () => {
    if (!filteredUrl) return
    Object.assign(document.createElement('a'), { href: filteredUrl, download: `fun-${activeFilter}.png` }).click()
  }

  const reset = () => {
    setPhase('idle'); setOriginalUrl(null); setFilteredUrl(null)
    setActiveFilter('normal'); setErrorMsg('')
    imgRef.current = null
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  /* ── Idle ── */
  if (phase === 'idle' || phase === 'error') return (
    <>
      <div
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="drop-zone-corner tl"/><div className="drop-zone-corner tr"/>
        <div className="drop-zone-corner bl"/><div className="drop-zone-corner br"/>
        <div className="dz-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5z"/>
            <path d="M2 20c0-4 4-7 10-7s10 3 10 7"/>
          </svg>
        </div>
        <div className="dz-title">Drop your image here</div>
        <div className="dz-sub">Apply fun filters — all processed locally in your browser</div>
        {phase === 'error' && <p style={{color:'#f87171',fontSize:'.83rem',marginBottom:12}}>{errorMsg}</p>}
        <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Choose Image
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleInput}/>

      {/* Filter preview tiles (decorative, no image loaded) */}
      <div className="filter-grid">
        {FILTERS.map(f => (
          <div key={f.id} className="filter-card filter-card-ghost" style={{'--fc': f.color}}>
            <span className="filter-emoji">{f.emoji}</span>
            <span className="filter-name">{f.label}</span>
          </div>
        ))}
      </div>
      <div className="face-effects-section" style={{opacity:.45}}>
        <div className="face-effects-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5z"/>
            <path d="M2 20c0-4 4-7 10-7s10 3 10 7"/>
          </svg>
          Face Effects
        </div>
        <div className="face-grid">
          {FACE_FILTERS.map(f => (
            <div key={f.id} className="face-card" style={{'--fc': f.color, '--fg': f.gradient}}>
              <span className="face-emoji">{f.emoji}</span>
              <div className="face-info">
                <span className="face-name">{f.label}</span>
                <span className="face-desc">{f.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )

  /* ── Loading ── */
  if (phase === 'loading') return (
    <div className="proc-placeholder" style={{padding:'60px 0'}}>
      <div className="proc-ring"/>Loading image…
    </div>
  )

  /* ── Done ── */
  return (
    <>
      <BeforeAfter before={originalUrl} after={filteredUrl}/>

      {applying && (
        <div className="progress-lbl" style={{justifyContent:'center'}}>
          <span className="spin-ring"/> Applying {ALL_FILTERS.find(f=>f.id===activeFilter)?.label}…
        </div>
      )}

      {/* Regular filters */}
      <div className="filter-grid">
        {FILTERS.map(f => (
          <button
            key={f.id}
            className={`filter-card${activeFilter === f.id ? ' filter-card-active' : ''}${applying ? ' filter-card-disabled' : ''}`}
            style={{'--fc': f.color}}
            onClick={() => selectFilter(f.id)}
            disabled={applying}
            title={f.desc}
          >
            <span className="filter-emoji">{f.emoji}</span>
            <span className="filter-name">{f.label}</span>
            <span className="filter-desc">{f.desc}</span>
          </button>
        ))}
      </div>

      {/* Face effects */}
      <div className="face-effects-section">
        <div className="face-effects-label">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5z"/>
            <path d="M2 20c0-4 4-7 10-7s10 3 10 7"/>
          </svg>
          Face Effects
        </div>
        <div className="face-grid">
          {FACE_FILTERS.map(f => (
            <button
              key={f.id}
              className={`face-card${activeFilter === f.id ? ' face-card-active' : ''}${applying ? ' filter-card-disabled' : ''}`}
              style={{'--fc': f.color, '--fg': f.gradient}}
              onClick={() => selectFilter(f.id)}
              disabled={applying}
            >
              <span className="face-emoji">{f.emoji}</span>
              <div className="face-info">
                <span className="face-name">{f.label}</span>
                <span className="face-desc">{f.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="actions">
        <button className="btn btn-success" onClick={download} disabled={applying}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download PNG
        </button>
        <button className="btn btn-ghost" onClick={reset}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.1"/>
          </svg>
          New Image
        </button>
      </div>
    </>
  )
}
