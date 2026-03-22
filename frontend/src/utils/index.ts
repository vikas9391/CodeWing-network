export const MICRO = 1_000_000

export const fmtCWC = (micro: number): string => {
  const v = micro / MICRO
  return v === 0 ? '0 CWC' : `${v.toFixed(v < 1 ? 6 : 4).replace(/\.?0+$/, '')} CWC`
}

export const fmtCWCShort = (micro: number): string =>
  `${(micro / MICRO).toFixed(2)} CWC`

export const fmtBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`
}

export const timeAgo = (ts: number): string => {
  const s = Math.floor(Date.now() / 1000) - ts
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const truncAddr = (addr: string, n = 10): string =>
  addr ? `${addr.slice(0, n)}...${addr.slice(-6)}` : '—'

export const copyText = (text: string): void => {
  navigator.clipboard?.writeText(text)
}

export const clsx = (...classes: (string | boolean | undefined | null)[]): string =>
  classes.filter(Boolean).join(' ')

export const genNodeId = (): string => {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

export const mimeIcon = (mime: string): string => {
  if (mime.startsWith('image/'))       return '🖼️'
  if (mime.startsWith('video/'))       return '🎬'
  if (mime.startsWith('audio/'))       return '🎵'
  if (mime === 'application/pdf')      return '📄'
  if (mime.includes('zip') || mime.includes('tar')) return '🗜️'
  if (mime.startsWith('text/'))        return '📝'
  return '📁'
}

export const txTypeColor = (type: string): string => {
  const m: Record<string, string> = {
    Payment:       'text-blue-400',
    StoreFile:     'text-cyan-400',
    StorageReward: 'text-amber-400',
    Faucet:        'text-yellow-300',
    DeleteFile:    'text-red-400',
  }
  return m[type] ?? 'text-gray-400'
}

export const txTypeBg = (type: string): string => {
  const m: Record<string, string> = {
    Payment:       'bg-blue-500/10 text-blue-400 border-blue-500/20',
    StoreFile:     'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    StorageReward: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Faucet:        'bg-yellow-500/10 text-yellow-300 border-yellow-500/20',
    DeleteFile:    'bg-red-500/10 text-red-400 border-red-500/20',
  }
  return m[type] ?? 'bg-gray-500/10 text-gray-400 border-gray-500/20'
}
