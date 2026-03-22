import React, { useState, useEffect, useCallback, useRef } from 'react'
import { StatCard, Badge, PulseDot, Empty, Spinner } from '../components/ui'
import { useWebSocket, useInterval, useSessionWallet, loadAccounts } from '../hooks'
import { getStats, getBlocks, getPendingTxs } from '../api/client'
import { fmtBytes, fmtCWC, timeAgo, truncAddr } from '../utils'
import type { Block, ChainStats, WsStatsUpdate } from '../types'

// ─── Animated Landing Overlay ────────────────────────────────────────────────

function HexGrid() {
  const hexes = Array.from({ length: 42 }, (_, i) => i)
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.07]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="hex" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
            <polygon
              points="28,4 52,16 52,40 28,52 4,40 4,16"
              fill="none"
              stroke="#6ee7f7"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hex)" />
      </svg>
    </div>
  )
}

function GlowOrb({ x, y, delay, size = 300 }: { x: string; y: string; delay: number; size?: number }) {
  return (
    <div
      className="absolute rounded-full pointer-events-none"
      style={{
        left: x,
        top: y,
        width: size,
        height: size,
        background: 'radial-gradient(circle, rgba(110,231,247,0.15) 0%, transparent 70%)',
        animation: `orbPulse 4s ease-in-out infinite`,
        animationDelay: `${delay}s`,
        transform: 'translate(-50%, -50%)',
      }}
    />
  )
}

function DataStream({ index }: { index: number }) {
  const chars = '01アイウエオABCDEFGHIJKLMN◆◇○●'
  const [stream, setStream] = useState('')

  useEffect(() => {
    const len = 8 + Math.floor(Math.random() * 12)
    let s = ''
    for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
    setStream(s)
  }, [])

  return (
    <div
      className="absolute font-mono text-xs text-cyan-400/30 whitespace-nowrap select-none"
      style={{
        left: `${(index * 7.3) % 95}%`,
        top: `-20px`,
        animation: `streamFall ${3 + (index % 4)}s linear infinite`,
        animationDelay: `${(index * 0.37) % 3}s`,
        letterSpacing: '0.05em',
      }}
    >
      {stream}
    </div>
  )
}

function CounterTick({ target, duration = 1200 }: { target: number; duration?: number }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    const steps = 30
    const step = target / steps
    let cur = 0
    const interval = setInterval(() => {
      cur = Math.min(cur + step, target)
      setVal(Math.floor(cur))
      if (cur >= target) clearInterval(interval)
    }, duration / steps)
    return () => clearInterval(interval)
  }, [target, duration])
  return <>{val.toLocaleString()}</>
}

function LandingOverlay({ onEnter }: { onEnter: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'syncing' | 'ready'>('idle')
  const [progress, setProgress] = useState(0)
  const [exiting, setExiting] = useState(false)
  const streams = Array.from({ length: 18 }, (_, i) => i)

  const handleEnter = () => {
    setPhase('connecting')
    let p = 0
    const tick = setInterval(() => {
      p += Math.random() * 8 + 2
      setProgress(Math.min(p, 100))
      if (p >= 40 && phase !== 'syncing') setPhase('syncing')
      if (p >= 100) {
        clearInterval(tick)
        setPhase('ready')
        setTimeout(() => {
          setExiting(true)
          setTimeout(onEnter, 700)
        }, 600)
      }
    }, 60)
  }

  const phaseLabel = {
    idle: 'INITIALIZE NODE',
    connecting: 'ESTABLISHING CONNECTION…',
    syncing: 'SYNCHRONIZING CHAIN…',
    ready: 'NETWORK SYNCHRONIZED',
  }[phase]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #050f1a 0%, #020609 100%)',
        transition: exiting ? 'opacity 0.7s ease, transform 0.7s ease' : undefined,
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'scale(1.04)' : 'scale(1)',
      }}
    >
      <style>{`
        @keyframes orbPulse {
          0%, 100% { opacity: 0.6; transform: translate(-50%,-50%) scale(1); }
          50%       { opacity: 1;   transform: translate(-50%,-50%) scale(1.15); }
        }
        @keyframes streamFall {
          0%   { transform: translateY(0);     opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.5; }
          100% { transform: translateY(100vh); opacity: 0; }
        }
        @keyframes scanLine {
          0%   { top: -2px; }
          100% { top: 100%; }
        }
        @keyframes glitch {
          0%,100% { clip-path: inset(0 0 100% 0); transform: translateX(0); }
          10%     { clip-path: inset(30% 0 50% 0); transform: translateX(-4px); }
          20%     { clip-path: inset(10% 0 70% 0); transform: translateX(4px); }
          30%     { clip-path: inset(60% 0 20% 0); transform: translateX(-2px); }
          40%     { clip-path: inset(0 0 100% 0); transform: translateX(0); }
        }
        @keyframes ringRotate {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes ringRotateRev {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes barGrow {
          from { width: 0%; }
        }
        @keyframes blink {
          0%,100% { opacity: 1; }
          50%     { opacity: 0; }
        }
        @keyframes logoReveal {
          0%   { clip-path: inset(0 100% 0 0); }
          100% { clip-path: inset(0 0% 0 0); }
        }
      `}</style>

      {/* BG grid */}
      <HexGrid />

      {/* Data streams */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {streams.map(i => <DataStream key={i} index={i} />)}
      </div>

      {/* Glow orbs */}
      <GlowOrb x="20%" y="30%" delay={0} size={400} />
      <GlowOrb x="80%" y="70%" delay={1.5} size={350} />
      <GlowOrb x="50%" y="50%" delay={3} size={500} />

      {/* Scan line */}
      <div
        className="absolute left-0 right-0 h-px pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(110,231,247,0.3), transparent)',
          animation: 'scanLine 6s linear infinite',
        }}
      />

      {/* Central content */}
      <div className="relative flex flex-col items-center gap-8 px-8 max-w-lg w-full">

        {/* Rotating rings */}
        <div className="relative w-36 h-36 flex items-center justify-center">
          {/* Outer ring */}
          <div
            className="absolute inset-0 rounded-full border border-cyan-400/20"
            style={{ animation: 'ringRotate 12s linear infinite' }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-cyan-400/80" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400/40" />
          </div>
          {/* Middle ring */}
          <div
            className="absolute inset-4 rounded-full border border-cyan-400/30"
            style={{ animation: 'ringRotateRev 8s linear infinite' }}
          >
            <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cyan-300/60" />
          </div>
          {/* Inner ring */}
          <div
            className="absolute inset-8 rounded-full border-2 border-cyan-400/50"
            style={{ animation: 'ringRotate 5s linear infinite' }}
          >
            <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-cyan-400" />
          </div>
          {/* Core */}
          <div className="relative w-12 h-12 rounded-2xl border border-cyan-400/40 bg-cyan-400/5 flex items-center justify-center backdrop-blur-sm">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#6ee7f7" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#6ee7f7" strokeWidth="1.5" strokeLinejoin="round" opacity="0.6"/>
            </svg>
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <div
            className="text-4xl font-black tracking-[0.2em] text-transparent"
            style={{
              fontFamily: '"Courier New", monospace',
              background: 'linear-gradient(135deg, #e0f7fa 0%, #6ee7f7 50%, #22d3ee 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: 'logoReveal 0.8s ease forwards',
              textShadow: 'none',
            }}
          >
            CODEWING
          </div>
          <div
            className="text-xs tracking-[0.4em] text-cyan-400/50 font-mono uppercase"
            style={{ animation: 'fadeSlideUp 0.6s ease 0.4s both' }}
          >
            Network Node Interface
          </div>
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />

        {/* Stats row */}
        <div
          className="flex gap-8 text-center"
          style={{ animation: 'fadeSlideUp 0.6s ease 0.6s both' }}
        >
          {[
            { label: 'BLOCK HEIGHT', value: 12847 },
            { label: 'PEERS', value: 24 },
            { label: 'TXS PENDING', value: 318 },
          ].map(({ label, value }) => (
            <div key={label} className="space-y-1">
              <div
                className="text-2xl font-black font-mono"
                style={{ color: '#6ee7f7' }}
              >
                {phase !== 'idle' ? <CounterTick target={value} /> : '—'}
              </div>
              <div className="text-[10px] tracking-widest text-gray-600 font-mono">{label}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        {phase !== 'idle' && (
          <div
            className="w-full space-y-2"
            style={{ animation: 'fadeSlideUp 0.3s ease both' }}
          >
            <div className="flex justify-between text-[10px] font-mono text-cyan-400/50">
              <span>{phaseLabel}</span>
              <span>{Math.floor(progress)}%</span>
            </div>
            <div className="w-full h-1 bg-cyan-900/30 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-75"
                style={{
                  width: `${progress}%`,
                  background: 'linear-gradient(90deg, #0e7490, #22d3ee, #6ee7f7)',
                  boxShadow: '0 0 8px rgba(110,231,247,0.6)',
                }}
              />
            </div>
          </div>
        )}

        {/* CTA Button */}
        {phase === 'idle' && (
          <button
            onClick={handleEnter}
            className="relative group px-10 py-3 font-mono text-sm tracking-[0.2em] uppercase overflow-hidden"
            style={{
              animation: 'fadeSlideUp 0.6s ease 0.8s both',
              border: '1px solid rgba(110,231,247,0.4)',
              color: '#6ee7f7',
              background: 'rgba(110,231,247,0.05)',
              borderRadius: '4px',
            }}
          >
            {/* hover fill */}
            <span
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{ background: 'rgba(110,231,247,0.08)' }}
            />
            {/* corner accents */}
            <span className="absolute top-0 left-0 w-2 h-2 border-t border-l border-cyan-400/80" />
            <span className="absolute top-0 right-0 w-2 h-2 border-t border-r border-cyan-400/80" />
            <span className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-cyan-400/80" />
            <span className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-cyan-400/80" />
            <span className="relative">ENTER DASHBOARD</span>
          </button>
        )}

        {phase === 'ready' && (
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-sm">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#22d3ee" strokeWidth="1.5"/>
              <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            ACCESS GRANTED
          </div>
        )}

        {/* Corner decoration */}
        <div className="absolute -bottom-4 left-0 right-0 flex justify-center">
          <div className="font-mono text-[9px] tracking-widest text-gray-700">
            v0.4.2 · MAINNET · NODE_ID: 7f3a1c
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [showLanding, setShowLanding] = useState(true)
  const [dashVisible, setDashVisible]  = useState(false)

  const [stats,   setStats]   = useState<ChainStats | null>(null)
  const [blocks,  setBlocks]  = useState<Block[]>([])
  const [pending, setPending] = useState(0)
  const [log,     setLog]     = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const { wallet }  = useSessionWallet()
  const accLabel    = wallet ? (loadAccounts()[wallet.address]?.label ?? '') : ''

  const addLog = (msg: string) =>
    setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50))

  const loadData = useCallback(async () => {
    try {
      const [s, b, p] = await Promise.all([getStats(), getBlocks(), getPendingTxs()])
      setStats(s)
      setBlocks(b.blocks ?? [])
      const txList = p?.pending ?? p?.transactions ?? []
      setPending(txList.length)
    } catch { /* node offline */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useInterval(loadData, 5000)

  const handleWs = useCallback((msg: WsStatsUpdate) => {
    if (msg.type === 'stats_update') {
      addLog(`Block #${msg.height ?? '?'} · pending: ${msg.pending ?? 0} · peers: ${msg.peers ?? 0}`)
      setStats(prev => prev ? {
        ...prev,
        chain_height:         msg.height  ?? prev.chain_height,
        pending_transactions: msg.pending ?? prev.pending_transactions,
        peer_count:           msg.peers   ?? prev.peer_count,
        total_files:          msg.files   ?? prev.total_files,
      } : prev)
    }
  }, [])
  useWebSocket(handleWs)

  const handleEnterDashboard = () => {
    setShowLanding(false)
    // Small delay so landing fade-out finishes, then reveal dashboard
    setTimeout(() => setDashVisible(true), 100)
  }

  return (
    <>
      {/* ── Landing overlay ── */}
      {showLanding && <LandingOverlay onEnter={handleEnterDashboard} />}

      {/* ── Dashboard (hidden until landing exits) ── */}
      <div
        className="space-y-6"
        style={{
          opacity: dashVisible ? 1 : 0,
          transform: dashVisible ? 'translateY(0)' : 'translateY(24px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold font-display tracking-tight">Dashboard</h1>
            <p className="text-gray-500 text-sm mt-0.5">CodeWing Network Overview</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {wallet && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-cw-accent/10 border border-cw-accent/20 rounded-xl">
                <div className="w-2 h-2 rounded-full bg-cw-accent" />
                <span className="text-xs text-cw-accent font-medium">
                  {accLabel || truncAddr(wallet.address, 10)}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 bg-cw-surface border border-cw-border rounded-xl">
              <PulseDot active={!!stats} />
              <span className="text-sm text-gray-400">{stats ? 'Connected' : 'Offline'}</span>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Spinner size="lg" />
          </div>
        ) : !stats ? (
          /* Node offline */
          <div className="card p-12 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
              <span className="text-red-400 text-xl font-bold">!</span>
            </div>
            <div>
              <p className="text-gray-200 font-semibold text-lg">Node Unreachable</p>
              <p className="text-gray-500 text-sm mt-1.5">
                Start your node with{' '}
                <code className="font-mono text-cw-accent bg-cw-muted px-2 py-0.5 rounded">
                  cargo run --bin codewing-node
                </code>
              </p>
            </div>
            <button onClick={loadData} className="btn-secondary">Retry Connection</button>
          </div>
        ) : (
          <>
            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Chain Height"   value={stats.chain_height}                  accent />
              <StatCard label="Difficulty"     value={stats.difficulty}                           />
              <StatCard label="Total Files"    value={stats.total_files}                          />
              <StatCard label="Storage Used"   value={fmtBytes(stats.total_storage_bytes)}        />
              <StatCard label="Transactions"   value={stats.total_transactions}                    />
              <StatCard label="Pending Txs"    value={stats.pending_transactions}                 />
              <StatCard label="Peers"          value={stats.peer_count}                           />
              <StatCard label="Total Supply"   value={fmtCWC(stats.total_supply ?? 0)}            />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Recent blocks */}
              <div className="card">
                <div className="px-5 py-4 border-b border-cw-border flex items-center justify-between">
                  <h3 className="font-semibold">Recent Blocks</h3>
                  <div className="flex items-center gap-2">
                    <Badge color="blue">{blocks.length}</Badge>
                    <button
                      onClick={loadData}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-cw-muted"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-cw-border">
                  {blocks.slice(0, 8).map(b => (
                    <div key={b.index} className="px-5 py-3 flex items-center justify-between hover:bg-cw-muted/30 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-cw-accent/10 border border-cw-accent/20 flex items-center justify-center text-cw-accent font-bold text-xs flex-shrink-0 font-mono">
                          {b.index}
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-gray-300 truncate">{b.hash}</p>
                          <p className="text-gray-600 text-xs mt-0.5">
                            {b.tx_count} txs · {truncAddr(b.miner ?? '', 10)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <Badge color="blue">{b.difficulty}x</Badge>
                        <p className="text-gray-600 text-xs mt-1">{timeAgo(b.timestamp)}</p>
                      </div>
                    </div>
                  ))}
                  {blocks.length === 0 && (
                    <Empty title="No blocks yet" sub="Mine the first block on the Blocks page." />
                  )}
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Latest Block',   value: blocks[0] ? `#${blocks[0].index}` : '—' },
                    { label: 'Pending Txs',    value: pending },
                    { label: 'Avg Block Time', value: blocks.length > 1
                        ? `${Math.round((blocks[0].timestamp - blocks[blocks.length - 1].timestamp) / blocks.length)}s`
                        : '—'
                    },
                    { label: 'Peers',          value: stats.peer_count },
                  ].map(({ label, value }) => (
                    <div key={label} className="card p-3 flex items-center gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
                        <p className="font-bold text-sm truncate mt-0.5">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live feed */}
                <div className="card flex flex-col" style={{ maxHeight: 260 }}>
                  <div className="px-5 py-3 border-b border-cw-border flex items-center gap-2.5 flex-shrink-0">
                    <PulseDot active />
                    <h3 className="font-semibold text-sm">Live Feed</h3>
                  </div>
                  <div className="flex-1 p-4 overflow-y-auto space-y-1.5">
                    {log.length === 0 ? (
                      <p className="text-gray-600 text-xs text-center py-6">
                        Awaiting WebSocket events…
                      </p>
                    ) : (
                      log.map((entry, i) => (
                        <p key={i} className="font-mono text-xs text-gray-400 animate-tx-slide">
                          {entry}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}