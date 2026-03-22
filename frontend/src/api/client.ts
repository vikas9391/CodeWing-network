const BASE = ''  // Vite proxy handles /api → localhost:3000

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// ── Chain ──────────────────────────────────────────────────────────────────────
export const getStats       = ()       => req<any>('/api/chain/stats')
export const getBlocks      = ()       => req<any>('/api/chain/blocks')
export const validateChain  = ()       => req<any>('/api/chain/valid')

// ── Wallet ─────────────────────────────────────────────────────────────────────
export const createWallet   = ()       => req<any>('/api/wallet/new', { method: 'POST' })
export const getBalance     = (addr: string) => req<any>(`/api/wallet/${addr}/balance`)
export const getWalletFull  = (addr: string) => req<any>(`/api/wallet/${addr}/full`)
export const getWalletFiles = (addr: string) => req<any>(`/api/wallet/${addr}/files`)
export const getTxHistory   = (addr: string) => req<any>(`/api/wallet/${addr}/history`)
export const importWallet   = (private_key: string) =>
  req<any>('/api/wallet/import', { method: 'POST', body: JSON.stringify({ private_key }) })
export const exportWallet   = (addr: string) => req<any>(`/api/wallet/export/${addr}`)

// ── Transactions ───────────────────────────────────────────────────────────────
export const sendPayment    = (from: string, to: string, amount: number) =>
  req<any>('/api/tx/send', { method: 'POST', body: JSON.stringify({ from, to, amount }) })
export const getPendingTxs  = () => req<any>('/api/tx/pending')
export const getAllHistory   = () => req<any>('/api/tx/history')

// ── Mining ─────────────────────────────────────────────────────────────────────
export const mineBlock      = (addr: string) =>
  req<any>(`/api/mine/${addr}`, { method: 'POST' })

// ── Economy ────────────────────────────────────────────────────────────────────
export const getFeeSchedule = () => req<any>('/api/economy/fees')
export const getInvoice     = (file_name: string, size_bytes: number, days?: number) =>
  req<any>('/api/economy/invoice', { method: 'POST', body: JSON.stringify({ file_name, size_bytes, days }) })
export const getLeaderboard = () => req<any>('/api/economy/leaderboard')
export const faucetDrip     = (addr: string) =>
  req<any>(`/api/faucet/${addr}`, { method: 'POST' })

// ── Storage ────────────────────────────────────────────────────────────────────
export const listFiles      = ()       => req<any>('/api/storage/files')
export const listOwnerFiles = (owner: string) => req<any>(`/api/storage/files/${owner}`)
export const getFileInfo    = (cid: string)   => req<any>(`/api/storage/info/${cid}`)
export const getStorageStats = ()      => req<any>('/api/storage/stats')
export const deleteFile     = (cid: string)   =>
  req<any>(`/api/storage/delete/${cid}`, { method: 'DELETE' })

export const uploadFile = async (file: File, owner: string): Promise<any> => {
  const form = new FormData()
  form.append('file', file)
  form.append('owner', owner)
  const r = await fetch('/api/storage/upload', { method: 'POST', body: form })
  return r.json()
}

export const downloadUrl = (cid: string, key: string) =>
  `/api/storage/download/${cid}?key=${encodeURIComponent(key)}`

// ── Nodes ──────────────────────────────────────────────────────────────────────
export const listNodes      = ()       => req<any>('/api/nodes')
export const getNodeStats   = ()       => req<any>('/api/nodes/stats')
export const announceNode   = (info: any) =>
  req<any>('/api/nodes/announce', { method: 'POST', body: JSON.stringify(info) })
export const heartbeat      = (nodeId: string) =>
  req<any>(`/api/nodes/${nodeId}/heartbeat`, { method: 'POST' })

// ── Network ────────────────────────────────────────────────────────────────────
export const getPeers       = ()       => req<any>('/api/network/peers')
export const getNodeInfo    = ()       => req<any>('/api/network/info')
export const connectPeer    = (address: string) =>
  req<any>('/api/network/connect', { method: 'POST', body: JSON.stringify({ address }) })

// ── Charging ───────────────────────────────────────────────────────────────────
export const checkUploadCost = (owner: string, file_name: string, size_bytes: number, days?: number) =>
  req<any>('/api/storage/check-cost', { method: 'POST', body: JSON.stringify({ owner, file_name, size_bytes, days }) })

export const uploadFileCharged = async (file: File, owner: string, days?: number): Promise<any> => {
  const form = new FormData()
  form.append('file', file)
  form.append('owner', owner)
  if (days) form.append('days', String(days))
  const r = await fetch('/api/storage/upload', { method: 'POST', body: form })
  return r.json()
}