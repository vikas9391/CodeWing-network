import React, { useEffect, useRef } from 'react'
import { clsx } from '../utils'

// ── Toast ──────────────────────────────────────────────────────────────────────

export interface ToastItem { id: number; msg: string; type: 'success' | 'error' | 'info' }

export function Toast({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={clsx(
            'px-4 py-3 rounded-xl text-sm font-medium shadow-2xl animate-fade-in',
            'flex items-center gap-2.5 min-w-[260px]',
            t.type === 'success' && 'bg-emerald-600 text-white',
            t.type === 'error'   && 'bg-red-600 text-white',
            t.type === 'info'    && 'bg-cw-accent text-white',
          )}>
          <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────────────────────────

export function Modal({
  open, onClose, title, children, size = 'md'
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  const maxW = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={clsx('relative z-10 w-full', maxW,
          'bg-cw-surface border border-cw-border rounded-2xl p-6 shadow-2xl animate-bounce-in')}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg
              bg-cw-muted hover:bg-cw-border text-gray-400 hover:text-white transition-colors">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Badge ──────────────────────────────────────────────────────────────────────

export function Badge({
  children, color = 'gray'
}: {
  children: React.ReactNode
  color?: 'blue' | 'cyan' | 'green' | 'amber' | 'red' | 'purple' | 'gray'
}) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
    cyan:   'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    green:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red:    'bg-red-500/10 text-red-400 border-red-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    gray:   'bg-gray-500/10 text-gray-400 border-gray-500/20',
  }
  return (
    <span className={clsx('badge', colors[color])}>
      {children}
    </span>
  )
}

// ── StatCard ───────────────────────────────────────────────────────────────────

export function StatCard({
  label, value, sub, icon, accent = false
}: {
  label: string
  value: React.ReactNode
  sub?: string
  icon?: string
  accent?: boolean
}) {
  return (
    <div className={clsx('stat-card', accent && 'border-cw-accent/30 glow-blue')}>
      <div className="flex items-center justify-between">
        <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">{label}</p>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className="text-2xl font-bold font-display mt-1">{value}</p>
      {sub && <p className="text-gray-600 text-xs">{sub}</p>}
    </div>
  )
}

// ── Loading spinner ────────────────────────────────────────────────────────────

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-10 h-10' : 'w-6 h-6'
  return (
    <div className={clsx(s, 'border-2 border-cw-accent border-t-transparent rounded-full animate-spin')} />
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

export function Empty({ icon, title, sub, action }: {
  icon?: string
  title: string
  sub?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <p className="text-5xl mb-4">{icon}</p>}
      <p className="text-gray-300 font-medium">{title}</p>
      {sub && <p className="text-gray-600 text-sm mt-1">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ── Pulse dot ─────────────────────────────────────────────────────────────────

export function PulseDot({ active = true }: { active?: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {active && (
        <span className="animate-ping absolute inline-flex h-full w-full
          rounded-full bg-emerald-400 opacity-75" />
      )}
      <span className={clsx(
        'relative inline-flex rounded-full h-2 w-2',
        active ? 'bg-emerald-400' : 'bg-gray-600'
      )} />
    </span>
  )
}

// ── Copy button ────────────────────────────────────────────────────────────────

export function CopyButton({ text, onCopy }: { text: string; onCopy?: () => void }) {
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text); onCopy?.() }}
      className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-cw-muted
        transition-colors text-xs"
      title="Copy">
      📋
    </button>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────

export function SectionHeader({
  title, sub, action
}: {
  title: string
  sub?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h2 className="text-xl font-bold font-display">{title}</h2>
        {sub && <p className="text-gray-500 text-sm mt-0.5">{sub}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ── QR Code ────────────────────────────────────────────────────────────────────

export function QRCodeDisplay({ value, size = 180 }: { value: string; size?: number }) {
  // Simple fallback QR using a public API since we can't import qrcode.react in plain html
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=0d1221&color=3d6bff&format=svg`
  return (
    <div className="p-3 bg-cw-bg rounded-xl border border-cw-border">
      <img src={url} width={size} height={size} alt="QR Code"
        className="rounded-lg" />
    </div>
  )
}

// ── Progress bar ───────────────────────────────────────────────────────────────

export function ProgressBar({
  value, max, color = 'blue', showLabel = false
}: {
  value: number; max: number; color?: string; showLabel?: boolean
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const colors: Record<string, string> = {
    blue:   'from-cw-accent to-blue-400',
    purple: 'from-cw-purple to-pink-500',
    green:  'from-emerald-500 to-teal-400',
    amber:  'from-amber-500 to-yellow-400',
  }
  return (
    <div className="space-y-1">
      <div className="h-1.5 bg-cw-muted rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full bg-gradient-to-r transition-all duration-500', colors[color] ?? colors.blue)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-gray-600 text-right">{pct.toFixed(0)}%</p>
      )}
    </div>
  )
}
