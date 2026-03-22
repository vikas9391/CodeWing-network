import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Badge, Empty, Spinner, SectionHeader, StatCard } from '../components/ui'
import { Toast } from '../components/ui'
import { useToast, useInterval, useSessionWallet } from '../hooks'
import { uploadFile, uploadFileCharged, checkUploadCost, listFiles, deleteFile, getStorageStats, getBalance, getInvoice } from '../api/client'
import { fmtBytes, timeAgo, mimeIcon, clsx } from '../utils'
import type { FileListing, StorageStats } from '../types'

// ── Key Vault (localStorage) ───────────────────────────────────────────────────
interface VaultEntry {
  key:        string
  name:       string
  uploadedAt: number
}
type Vault = Record<string, VaultEntry>

const VAULT_KEY = 'cw_key_vault'

function loadVault(): Vault {
  try { return JSON.parse(localStorage.getItem(VAULT_KEY) ?? '{}') }
  catch { return {} }
}
function saveVault(vault: Vault) {
  try { localStorage.setItem(VAULT_KEY, JSON.stringify(vault)) } catch {}
}
function addToVault(cid: string, key: string, name: string) {
  const vault = loadVault()
  vault[cid]  = { key, name, uploadedAt: Math.floor(Date.now() / 1000) }
  saveVault(vault)
}
function removeFromVault(cid: string) {
  const vault = loadVault()
  delete vault[cid]
  saveVault(vault)
}

function useVault() {
  const [vault, setVault] = useState<Vault>(loadVault)
  const refresh = useCallback(() => setVault(loadVault()), [])
  const add     = useCallback((cid: string, key: string, name: string) => { addToVault(cid, key, name); refresh() }, [refresh])
  const remove  = useCallback((cid: string) => { removeFromVault(cid); refresh() }, [refresh])
  const get     = useCallback((cid: string) => vault[cid] ?? null, [vault])
  return { vault, add, remove, get, count: Object.keys(vault).length }
}

// ── Key Vault Panel ────────────────────────────────────────────────────────────
function KeyVaultPanel({
  vault, onUse, onDelete, toast
}: {
  vault: Vault
  onUse: (cid: string, key: string) => void
  onDelete: (cid: string) => void
  toast: (msg: string, type: 'success' | 'error' | 'info') => void
}) {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const entries = Object.entries(vault)

  const exportVault = () => {
    const data = JSON.stringify(vault, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `codewing-key-vault-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('Key vault exported.', 'success')
  }

  const importVault = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const imported: Vault = JSON.parse(ev.target?.result as string)
        const merged = { ...loadVault(), ...imported }
        saveVault(merged)
        window.location.reload()
      } catch { toast('Invalid vault file', 'error') }
    }
    reader.readAsText(file)
  }

  if (entries.length === 0) return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          Encryption Key Vault
          <span className="ml-2 text-xs text-gray-500 font-normal">(empty)</span>
        </h3>
      </div>
      <p className="text-gray-500 text-sm">
        Keys are saved automatically after each upload. They are stored only in this browser.
      </p>
    </div>
  )

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-cw-border flex items-center gap-3">
        <h3 className="font-semibold flex-1">
          Encryption Key Vault
          <span className="ml-2 text-xs text-emerald-400 font-normal">{entries.length} saved</span>
        </h3>
        <div className="flex gap-2">
          <label className="btn-ghost text-xs cursor-pointer">
            Import
            <input type="file" accept=".json" className="hidden" onChange={importVault} />
          </label>
          <button onClick={exportVault} className="btn-ghost text-xs">Export</button>
        </div>
      </div>

      <div className="px-5 pt-3 pb-1">
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-300">
          Keys are stored in <strong>this browser only</strong>. Export a backup to keep them safe.
        </div>
      </div>

      <div className="divide-y divide-cw-border/50">
        {entries.map(([cid, entry]) => (
          <div key={cid} className="px-5 py-4 space-y-2 hover:bg-cw-muted/20 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{entry.name}</p>
                <p className="text-gray-500 text-xs">
                  Saved {new Date(entry.uploadedAt * 1000).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => { onUse(cid, entry.key); toast('CID and key filled.', 'success') }}
                  className="btn-ghost text-xs text-cw-accent"
                >
                  Use
                </button>
                <button
                  onClick={() => { if (confirm(`Remove key for "${entry.name}" from vault?`)) onDelete(cid) }}
                  className="btn-ghost text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <p className="font-mono text-xs text-cw-accent/70 truncate flex-1">{cid}</p>
              <button
                onClick={() => { navigator.clipboard?.writeText(cid); toast('CID copied.', 'success') }}
                className="text-gray-600 hover:text-gray-300 text-xs flex-shrink-0"
              >
                Copy
              </button>
            </div>

            <div className="flex items-center gap-2">
              <p className={clsx(
                'font-mono text-xs flex-1 truncate transition-all',
                showKeys[cid] ? 'text-amber-400' : 'text-gray-700 select-none'
              )}>
                {showKeys[cid] ? entry.key : '●'.repeat(32)}
              </p>
              <button
                onClick={() => setShowKeys(s => ({ ...s, [cid]: !s[cid] }))}
                className="text-gray-600 hover:text-gray-300 text-xs flex-shrink-0"
              >
                {showKeys[cid] ? 'Hide' : 'Show'}
              </button>
              <button
                onClick={() => { navigator.clipboard?.writeText(entry.key); toast('Key copied.', 'success') }}
                className="text-gray-600 hover:text-gray-300 text-xs flex-shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Storage Page ──────────────────────────────────────────────────────────
export default function StoragePage() {
  const [files, setFiles]             = useState<FileListing[]>([])
  const [stats, setStats]             = useState<StorageStats | null>(null)
  const [loading, setLoading]         = useState(true)
  const [uploading, setUploading]     = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [dragOver, setDragOver]       = useState(false)
  const [owner, setOwner]             = useState('')
  const [lastUpload, setLastUpload]   = useState<{ cid: string; key: string; name: string } | null>(null)
  const [dlCid, setDlCid]             = useState('')
  const [dlKey, setDlKey]             = useState('')
  const [showKey, setShowKey]         = useState(false)
  const [filterOwner, setFilterOwner] = useState('')
  const [activeTab, setActiveTab]     = useState<'upload' | 'vault'>('upload')

  const [pendingFile,  setPendingFile]  = useState<File | null>(null)
  const [costPreview,  setCostPreview]  = useState<any | null>(null)
  const [checkingCost, setCheckingCost] = useState(false)
  const [storageDays,  setStorageDays]  = useState(30)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toasts, toast } = useToast()
  const { wallet }        = useSessionWallet()
  const keyVault          = useVault()

  useEffect(() => {
    if (wallet?.address && !owner) setOwner(wallet.address)
  }, [wallet?.address])

  const load = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([listFiles(), getStorageStats()])
      setFiles(f.files ?? [])
      setStats(s)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useInterval(load, 10000)

  const handleFileSelected = async (file: File) => {
    setPendingFile(file)
    setCostPreview(null)
    setCheckingCost(true)
    try {
      const ownerAddr = owner || 'anonymous'
      if (ownerAddr !== 'anonymous') {
        const preview = await checkUploadCost(ownerAddr, file.name, file.size, storageDays)
        setCostPreview({ ...preview, file_name: file.name, file_size: file.size })
      } else {
        setCostPreview({
          file_name:  file.name,
          file_size:  file.size,
          can_afford: true,
          total_cost: 0,
          balance:    0,
          anonymous:  true,
        })
      }
    } catch {
      toast('Could not fetch cost preview', 'error')
      setPendingFile(null)
    }
    setCheckingCost(false)
  }

  const handleConfirmUpload = async () => {
    if (!pendingFile) return
    setUploading(true)
    setCostPreview(null)
    try {
      const ownerAddr = owner || 'anonymous'
      const r = await uploadFileCharged(pendingFile, ownerAddr, storageDays)
      if (r.success) {
        keyVault.add(r.cid, r.encryption_key, r.name)
        const costMsg = r.cost_cwc > 0 ? ` · ${r.cost_cwc.toFixed(4)} CWC charged` : ''
        toast(`Uploaded and key saved to vault${costMsg}`, 'success')
        setLastUpload({ cid: r.cid, key: r.encryption_key, name: r.name })
        load()
      } else {
        if (r.code === 'INSUFFICIENT_BALANCE') {
          toast(`Insufficient balance: need ${r.required_cwc?.toFixed(4)} CWC, have ${r.balance_cwc?.toFixed(4)} CWC`, 'error')
        } else {
          toast(r.error ?? 'Upload failed', 'error')
        }
      }
    } catch { toast('Upload failed', 'error') }
    setPendingFile(null)
    setUploading(false)
  }

  const handleCancelUpload = () => { setPendingFile(null); setCostPreview(null) }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFileSelected(f)
  }

  const handleDelete = async (cid: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return
    const r = await deleteFile(cid)
    if (r.success) {
      toast('File deleted', 'success')
      keyVault.remove(cid)
      load()
    } else toast(r.error, 'error')
  }

  const handleDownload = async (cid: string, key: string) => {
    const cidClean = cid.trim()
    const keyClean = key.trim()
    if (!cidClean) { toast('Enter the File CID', 'error'); return }
    if (!keyClean) { toast('Enter the encryption key', 'error'); return }

    setDownloading(true)
    try {
      const url = `/api/storage/download/${cidClean}?key=${encodeURIComponent(keyClean)}`
      const res = await fetch(url)

      if (!res.ok) {
        let errMsg = `Server error ${res.status}`
        try { const j = await res.json(); errMsg = j.error ?? errMsg } catch {}
        toast(errMsg, 'error')
        setDownloading(false)
        return
      }

      const disposition = res.headers.get('content-disposition') ?? ''
      const nameMatch   = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
      const filename    = nameMatch?.[1]?.replace(/['"]/g, '').trim()
                       ?? `download-${cidClean.slice(0, 12)}`

      const blob    = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a       = document.createElement('a')
      a.href = blobUrl; a.download = filename
      document.body.appendChild(a); a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
      toast(`Downloaded: ${filename}`, 'success')
    } catch { toast('Download failed — check CID and key', 'error') }
    setDownloading(false)
  }

  const handleQuickDownload = async (f: FileListing) => {
    const saved = keyVault.get(f.cid)
    if (saved) {
      toast(`Using saved key for "${f.name}"`, 'info')
      await handleDownload(f.cid, saved.key)
    } else {
      const key = window.prompt(
        `No saved key found for "${f.name}"\n\nCID: ${f.cid}\n\nPaste your hex encryption key:`, ''
      )
      if (key === null) return
      if (!key.trim()) { toast('Key required', 'error'); return }
      await handleDownload(f.cid, key)
    }
  }

  const filtered = filterOwner
    ? files.filter(f => f.owner?.toLowerCase().includes(filterOwner.toLowerCase()))
    : files

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6 animate-slide-up">
      <Toast toasts={toasts} />
      <SectionHeader
        title="Distributed Storage"
        sub={`${files.length} files · ${fmtBytes(stats?.local?.total_bytes ?? 0)} used`}
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Files"   value={stats.local.total_files}           />
          <StatCard label="Total Chunks"  value={stats.local.total_chunks}          />
          <StatCard label="Storage Used"  value={fmtBytes(stats.local.total_bytes)} />
          <StatCard label="Keys Saved"    value={keyVault.count}                    accent />
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-cw-surface border border-cw-border rounded-xl p-1 w-fit">
        {([
          { id: 'upload', label: 'Upload & Download' },
          { id: 'vault',  label: `Key Vault (${keyVault.count})` },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-cw-accent text-white'
                : 'text-gray-400 hover:text-white hover:bg-cw-muted'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Upload / Download tab */}
      {activeTab === 'upload' && (
        <div className="grid lg:grid-cols-2 gap-6">

          {/* Upload zone */}
          <div className="space-y-4">
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !uploading && fileRef.current?.click()}
              className={clsx(
                'card border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200',
                dragOver  && 'border-cw-accent bg-cw-accent/5 scale-[1.01]',
                !dragOver && 'hover:border-cw-accent/50 hover:bg-cw-muted/20',
                uploading && 'opacity-60 cursor-wait pointer-events-none'
              )}
            >
              <input
                ref={fileRef} type="file" className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleFileSelected(e.target.files[0]) }}
              />
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <Spinner size="lg" />
                  <p className="text-gray-400 text-sm">Encrypting and uploading…</p>
                </div>
              ) : (
                <div>
                  <div className="w-12 h-12 rounded-xl bg-cw-accent/10 border border-cw-accent/20 flex items-center justify-center mx-auto mb-4">
                    <span className="text-cw-accent font-bold text-lg">+</span>
                  </div>
                  <p className="font-semibold text-gray-200">
                    {dragOver ? 'Drop to upload' : 'Drop file or click to browse'}
                  </p>
                  <p className="text-gray-500 text-sm mt-1">
                    AES-256-GCM encrypted · key auto-saved to vault
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">Owner Address (optional)</label>
                <input
                  value={owner}
                  onChange={e => setOwner(e.target.value)}
                  placeholder="CW... (leave blank for anonymous)"
                  className="input font-mono"
                />
                {wallet && owner === wallet.address && (
                  <p className="text-emerald-400/70 text-xs mt-1">Connected wallet selected</p>
                )}
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">
                  Storage Duration — {storageDays} days
                </label>
                <div className="flex gap-2">
                  {[7, 30, 90, 365].map(d => (
                    <button
                      key={d}
                      onClick={() => setStorageDays(d)}
                      className={clsx(
                        'px-3 py-1.5 rounded-lg text-xs font-medium flex-1 transition-all',
                        storageDays === d
                          ? 'bg-cw-accent text-white'
                          : 'bg-cw-muted text-gray-400 hover:text-white'
                      )}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Cost Preview */}
            {(checkingCost || costPreview) && (
              <div className="card border border-cw-accent/30 p-5 space-y-4 animate-bounce-in">
                {checkingCost ? (
                  <div className="flex items-center gap-3">
                    <Spinner size="sm" />
                    <p className="text-gray-400 text-sm">Calculating storage cost…</p>
                  </div>
                ) : costPreview && (
                  <>
                    <div>
                      <h4 className="font-semibold tracking-tight">Upload Cost Preview</h4>
                      <p className="text-xs text-gray-500 mt-0.5">Review before confirming</p>
                    </div>

                    <div className="bg-cw-bg border border-cw-border rounded-xl p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">File</span>
                        <span className="text-gray-200 truncate ml-4 max-w-[180px]">{costPreview.file_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Size</span>
                        <span className="text-gray-200 font-mono">{(costPreview.file_size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Duration</span>
                        <span className="text-gray-200 font-mono">{storageDays} days</span>
                      </div>

                      {!costPreview.anonymous && (
                        <>
                          <div className="border-t border-cw-border/50 pt-1.5 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-500">Storage Cost</span>
                              <span className="text-gray-200 font-mono">{(costPreview.invoice?.storage_cost / 1_000_000)?.toFixed(4) ?? '—'} CWC</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-500">Tx Fee</span>
                              <span className="text-gray-200 font-mono">{(costPreview.invoice?.tx_fee / 1_000_000)?.toFixed(4) ?? '—'} CWC</span>
                            </div>
                          </div>
                          <div className="border-t border-cw-border/50 pt-1.5 flex justify-between font-bold">
                            <span className="text-gray-300">Total</span>
                            <span className="text-amber-400 font-mono">{(costPreview.total_cost / 1_000_000)?.toFixed(4)} CWC</span>
                          </div>
                          <div className="flex justify-between pt-0.5">
                            <span className="text-gray-500">Your Balance</span>
                            <span className={clsx('font-mono', costPreview.can_afford ? 'text-emerald-400' : 'text-red-400')}>
                              {(costPreview.balance / 1_000_000)?.toFixed(4)} CWC
                            </span>
                          </div>
                        </>
                      )}

                      {costPreview.anonymous && (
                        <div className="pt-1.5 text-amber-300 border-t border-cw-border/50">
                          Anonymous upload — no CWC charged
                        </div>
                      )}
                    </div>

                    {!costPreview.anonymous && !costPreview.can_afford && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-300 space-y-1">
                        <p className="font-semibold">Insufficient Balance</p>
                        <p>You need <strong>{(costPreview.shortfall / 1_000_000)?.toFixed(4)} more CWC</strong> to store this file.</p>
                        <p className="text-red-400/70">Use the Faucet on the Economy page to receive free testnet CWC.</p>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <button onClick={handleCancelUpload} className="btn-secondary flex-1">Cancel</button>
                      <button
                        onClick={handleConfirmUpload}
                        disabled={!costPreview.anonymous && !costPreview.can_afford}
                        className="btn-primary flex-1 disabled:opacity-40"
                      >
                        {costPreview.anonymous
                          ? 'Upload Free'
                          : costPreview.can_afford
                            ? `Confirm & Pay ${(costPreview.total_cost / 1_000_000)?.toFixed(4)} CWC`
                            : 'Insufficient Balance'
                        }
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Upload result */}
            {lastUpload && (
              <div className="card p-4 border border-emerald-500/30 animate-bounce-in space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{lastUpload.name}</p>
                  <span className="text-xs text-emerald-400">Upload complete</span>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300">
                  Key automatically saved to vault
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-gray-500 uppercase tracking-wider">File CID</p>
                      <button
                        onClick={() => { navigator.clipboard?.writeText(lastUpload.cid); toast('CID copied.', 'success') }}
                        className="text-gray-600 hover:text-gray-300 text-xs"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="font-mono text-cw-accent break-all bg-cw-bg rounded-lg p-2 border border-cw-border select-all">
                      {lastUpload.cid}
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-gray-500 uppercase tracking-wider">Encryption Key</p>
                      <button
                        onClick={() => { navigator.clipboard?.writeText(lastUpload.key); toast('Key copied.', 'success') }}
                        className="text-gray-600 hover:text-gray-300 text-xs"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="font-mono text-amber-400 break-all bg-cw-bg rounded-lg p-2 border border-amber-500/20 select-all">
                      {lastUpload.key}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { setDlCid(lastUpload.cid); setDlKey(lastUpload.key) }}
                    className="btn-secondary text-xs"
                  >
                    Auto-fill Download
                  </button>
                  <button
                    onClick={() => handleDownload(lastUpload.cid, lastUpload.key)}
                    disabled={downloading}
                    className="btn-primary text-xs"
                  >
                    {downloading ? 'Downloading…' : 'Download Now'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Download panel */}
          <div className="card p-5 space-y-4">
            <div>
              <h3 className="font-semibold tracking-tight">Download File</h3>
              <p className="text-xs text-gray-500 mt-0.5">Decrypt and download a stored file</p>
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">File CID</label>
              <input
                value={dlCid}
                onChange={e => setDlCid(e.target.value)}
                placeholder="cid_..."
                className="input font-mono"
              />
              <p className="text-gray-600 text-xs mt-1">Exact CID from upload result (case-sensitive)</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-gray-400 text-xs uppercase tracking-wider">Encryption Key</label>
                <button
                  onClick={() => setShowKey(v => !v)}
                  className="text-gray-600 hover:text-gray-300 text-xs"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                value={dlKey}
                onChange={e => setDlKey(e.target.value)}
                placeholder="64-char hex key…"
                type={showKey ? 'text' : 'password'}
                className="input font-mono"
              />
            </div>

            {dlCid.trim() && keyVault.get(dlCid.trim()) && (
              <button
                onClick={() => {
                  const saved = keyVault.get(dlCid.trim())
                  if (saved) { setDlKey(saved.key); toast('Key loaded from vault.', 'success') }
                }}
                className="w-full py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl text-sm text-emerald-300 font-medium transition-all"
              >
                Load Key from Vault
              </button>
            )}

            <button
              onClick={() => handleDownload(dlCid, dlKey)}
              disabled={downloading || !dlCid.trim() || !dlKey.trim()}
              className={clsx(
                'w-full py-3.5 rounded-xl font-semibold text-sm transition-all',
                downloading || !dlCid.trim() || !dlKey.trim()
                  ? 'bg-cw-muted text-gray-600 cursor-not-allowed'
                  : 'btn-primary active:scale-95'
              )}
            >
              {downloading ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="sm" /> Decrypting and downloading…
                </span>
              ) : 'Download & Decrypt'}
            </button>

            <div className="bg-cw-bg rounded-xl p-3 border border-cw-border text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-400 mb-1 uppercase tracking-wider">Tip</p>
              <p>
                If you uploaded on this browser, your key is already in the Key Vault tab.
                Click <strong className="text-gray-300">Use</strong> on any file there to auto-fill the form.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Key Vault tab */}
      {activeTab === 'vault' && (
        <KeyVaultPanel
          vault={keyVault.vault}
          onUse={(cid, key) => { setDlCid(cid); setDlKey(key); setActiveTab('upload') }}
          onDelete={cid => { keyVault.remove(cid); toast('Key removed from vault', 'info') }}
          toast={toast}
        />
      )}

      {/* File Manager */}
      <div className="card">
        <div className="px-5 py-4 border-b border-cw-border flex items-center gap-3">
          <h3 className="font-semibold flex-1">File Manager</h3>
          <input
            value={filterOwner}
            onChange={e => setFilterOwner(e.target.value)}
            placeholder="Filter by owner…"
            className="input w-52 text-xs py-2"
          />
          <Badge color="cyan">{filtered.length} files</Badge>
        </div>

        {filtered.length === 0 ? (
          <Empty title="No files yet" sub="Upload your first file above." />
        ) : (
          <div className="divide-y divide-cw-border/50">
            {filtered.map((f, i) => {
              const hasSavedKey = !!keyVault.get(f.cid)
              return (
                <div key={i} className="px-5 py-4 flex items-center justify-between hover:bg-cw-muted/20 transition-colors">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-cw-muted border border-cw-border flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-gray-400 font-mono uppercase">
                        {f.name.split('.').pop()?.slice(0, 3) ?? 'bin'}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{f.name}</p>
                        {hasSavedKey && (
                          <span
                            className="flex-shrink-0 w-2 h-2 rounded-full bg-emerald-400"
                            title="Encryption key saved in vault"
                          />
                        )}
                      </div>
                      <p className="text-gray-500 text-xs">
                        {fmtBytes(f.size)} · {f.chunks} chunks · {timeAgo(f.stored_at)}
                      </p>
                      <p
                        className="font-mono text-xs text-cw-accent/70 truncate mt-0.5 cursor-pointer hover:text-cw-accent transition-colors"
                        title={`Click to copy CID:\n${f.cid}`}
                        onClick={() => { navigator.clipboard?.writeText(f.cid); toast('CID copied.', 'success') }}
                      >
                        {f.cid}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                    <button
                      onClick={() => handleQuickDownload(f)}
                      disabled={downloading}
                      className={clsx(
                        'btn-ghost text-xs',
                        hasSavedKey ? 'text-emerald-400 hover:text-emerald-300' : 'text-cw-accent'
                      )}
                    >
                      Download
                    </button>
                    <button
                      onClick={() => handleDelete(f.cid, f.name)}
                      className="btn-ghost text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}