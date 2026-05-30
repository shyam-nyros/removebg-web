import { useState } from 'react'
import BgRemover from './components/BgRemover'
import FunFilters from './components/FunFilters'

const TABS = [
  {
    id: 'bg',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="3" strokeDasharray="4 2"/>
        <circle cx="12" cy="10" r="3"/>
        <path d="M7 21c0-3 2.2-5 5-5s5 2 5 5"/>
      </svg>
    ),
    title: 'Remove Background',
    desc: 'ISNet AI · edge refinement · custom fill',
  },
  {
    id: 'fun',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
        <line x1="9" y1="9" x2="9.01" y2="9"/>
        <line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
    ),
    title: 'Fun Filters',
    desc: 'Glitch · Vaporwave · Pixel Art · Trippy & more',
  },
]

export default function App() {
  const [active, setActive] = useState(0)

  return (
    <div>
      {/* Ambient background orbs */}
      <div className="bg-orbs">
        <div className="bg-orb bg-orb-1" />
        <div className="bg-orb bg-orb-2" />
        <div className="bg-orb bg-orb-3" />
      </div>

      <header className="header">
        <div className="header-logo">
          <div className="logo-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <span className="header-title">ImagePro</span>
        </div>
        <div className="header-right">
          <span className="header-badge">AI · In-Browser · No Upload</span>
          <div className="header-dot" title="All processing runs locally" />
        </div>
      </header>

      <div className="page">
        {/* Hero */}
        <div className="hero">
          <div className="hero-eyebrow">
            <span className="hero-eyebrow-dot" />
            100% Client-Side Processing
          </div>
          <h1 className="hero-title">
            AI Image Studio
          </h1>
          <p className="hero-sub">
            Remove backgrounds with AI or go wild with 12 fun filters —
            everything runs entirely in your browser.
          </p>
          <div className="hero-badges">
            <span className="hero-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Privacy first — no uploads
            </span>
            <span className="hero-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              ISNet full-precision model
            </span>
            <span className="hero-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Works offline after first load
            </span>
          </div>
        </div>

        {/* Tab cards */}
        <div className="tab-cards">
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              className={`tab-card${active === i ? ' active' : ''}`}
              onClick={() => setActive(i)}
            >
              <div className="tab-card-icon">{tab.icon}</div>
              <div className="tab-card-info">
                <div className="tab-card-title">{tab.title}</div>
                <div className="tab-card-desc">{tab.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Panel */}
        <div className="panel">
          <div className="panel-inner">
            {active === 0 ? <BgRemover /> : <FunFilters />}
          </div>
        </div>
      </div>

      <footer className="footer">
        <span>ImagePro</span>
        <span className="footer-dot">·</span>
        <span>All processing runs locally in your browser</span>
        <span className="footer-dot">·</span>
        <span>No data leaves your device</span>
      </footer>
    </div>
  )
}
