import React, { useState, useEffect, useCallback } from 'react'
import {
  Toast, Modal, Badge, PulseDot, Spinner, Empty, CopyButton, QRCodeDisplay
} from '../components/ui'
import {
  useToast, useInterval, useSessionWallet, useAccounts,
  upsertAccount, removeAccount, findBySeedPhrase, loadAccounts,
  privateKeyToSeedPhrase, type StoredAccount, type SessionWallet
} from '../hooks'
import {
  createWallet, importWallet, sendPayment, faucetDrip,
  getWalletFull, getPendingTxs, mineBlock
} from '../api/client'
import { fmtCWC, fmtCWCShort, fmtBytes, timeAgo, truncAddr, clsx } from '../utils'
import type { WalletFull, TxRecord } from '../types'

// ── TX Item ────────────────────────────────────────────────────────────────────
function TxItem({ tx, myAddress }: { tx: TxRecord; myAddress: string }) {
  const incoming = tx.to === myAddress || !!tx.is_incoming
  const typeLabel: Record<string, string> = {
    Payment: 'Payment', StoreFile: 'Store File',
    StorageReward: 'Storage Reward', Faucet: 'Faucet', DeleteFile: 'Delete File',
  }

  return (
    <div className="flex items-center justify-between py-3.5 border-b border-cw-border/50 last:border-0
      hover:bg-cw-muted/20 -mx-1 px-1 rounded-lg transition-colors animate-tx-slide">
      <div className="flex items-center gap-3 min-w-0">
        <div className={clsx(
          'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 border',
          incoming
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        )}>
          {incoming ? 'IN' : 'OUT'}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm">{typeLabel[tx.type] ?? tx.type}</p>
          <p className="text-gray-500 text-xs font-mono truncate">
            {incoming ? `from ${truncAddr(tx.from)}` : `to ${truncAddr(tx.to)}`}
          </p>
          {tx.memo && <p className="text-gray-600 text-xs">{tx.memo}</p>}
        </div>
      </div>
      <div className="text-right flex-shrink-0 ml-3">
        <p className={clsx('font-bold text-sm font-mono', incoming ? 'text-emerald-400' : 'text-red-400')}>
          {incoming ? '+' : '-'}{fmtCWCShort(tx.amount)}
        </p>
        <p className="text-gray-600 text-xs">{timeAgo(tx.timestamp)}</p>
        <p className="text-gray-700 text-xs font-mono">blk #{tx.block_index}</p>
      </div>
    </div>
  )
}

// ── Seed Phrase Display ────────────────────────────────────────────────────────
function SeedDisplay({ phrase, onCopy }: { phrase: string; onCopy: () => void }) {
  const words = phrase.split(' ')
  return (
    <div className="space-y-3">
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
        Write these 12 words in order and keep them safe. Anyone with these words can access your wallet.
      </div>
      <div className="grid grid-cols-3 gap-2">
        {words.map((w, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-cw-bg border border-cw-border rounded-lg px-2.5 py-2">
            <span className="text-gray-600 text-xs w-4 flex-shrink-0">{i + 1}.</span>
            <span className="font-mono text-sm text-gray-200 font-medium">{w}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onCopy}
        className="w-full py-2.5 bg-cw-muted hover:bg-cw-border border border-cw-border rounded-xl text-sm text-gray-300 font-medium transition-all"
      >
        Copy All 12 Words
      </button>
    </div>
  )
}

// ── Account Switcher ───────────────────────────────────────────────────────────
function AccountSwitcher({ accounts, activeAddress, onSwitch, onRemove, onClose }: {
  accounts: StoredAccount[]
  activeAddress: string
  onSwitch: (acc: StoredAccount) => void
  onRemove: (address: string) => void
  onClose: () => void
}) {
  return (
    <div className="space-y-3">
      {accounts.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-4">No saved accounts</p>
      )}
      {accounts.map(acc => (
        <div
          key={acc.address}
          className={clsx(
            'rounded-xl border p-4 transition-all',
            acc.address === activeAddress
              ? 'border-cw-accent/50 bg-cw-accent/5'
              : 'border-cw-border bg-cw-bg hover:border-cw-accent/30'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm truncate">{acc.label}</p>
                {acc.address === activeAddress && (
                  <span className="text-xs bg-cw-accent/20 text-cw-accent px-1.5 py-0.5 rounded-full">active</span>
                )}
              </div>
              <p className="font-mono text-xs text-gray-500 truncate mt-0.5">{acc.address}</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Last login: {new Date(acc.last_login * 1000).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              {acc.address !== activeAddress && (
                <button
                  onClick={() => { onSwitch(acc); onClose() }}
                  className="px-3 py-1.5 bg-cw-accent/15 hover:bg-cw-accent/25 border border-cw-accent/30 rounded-lg text-cw-accent text-xs font-medium transition-all"
                >
                  Switch
                </button>
              )}
              <button
                onClick={() => {
                  if (confirm(`Remove "${acc.label}" from saved accounts? This does not delete your wallet.`))
                    onRemove(acc.address)
                }}
                className="px-2 py-1.5 text-gray-600 hover:text-red-400 text-xs transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Landing / Login Screen ─────────────────────────────────────────────────────
function WalletLanding({ onLoggedIn, toast }: {
  onLoggedIn: (w: SessionWallet) => void
  toast: (msg: string, type: 'success' | 'error' | 'info') => void
}) {
  const { accounts, refresh } = useAccounts()
  const [tab, setTab]         = useState<'accounts' | 'create' | 'import' | 'seed'>('accounts')
  const [loading, setLoading] = useState(false)
  const [importKey, setImportKey]   = useState('')
  const [seedInput, setSeedInput]   = useState('')
  const [labelInput, setLabelInput] = useState('')

  const [newWallet,     setNewWallet]     = useState<SessionWallet | null>(null)
  const [seedPhrase,    setSeedPhrase]    = useState('')
  const [confirmed,     setConfirmed]     = useState(false)
  const [confirmWord,   setConfirmWord]   = useState('')
  const [checkIdx,      setCheckIdx]      = useState(0)

  const handleCreate = async () => {
    setLoading(true)
    try {
      const w = await createWallet()
      const wallet: SessionWallet = { address: w.address, public_key: w.public_key, private_key: w.private_key }
      const phrase = upsertAccount(wallet, labelInput.trim() || undefined)
      setNewWallet(wallet)
      setSeedPhrase(phrase)
      const idx = Math.floor(Math.random() * 12)
      setCheckIdx(idx)
      setConfirmWord('')
      setConfirmed(false)
      toast('Wallet created. Save your seed phrase.', 'success')
    } catch { toast('Failed to create wallet', 'error') }
    setLoading(false)
  }

  const handleImportKey = async () => {
    if (!importKey.trim()) return
    setLoading(true)
    try {
      const r = await importWallet(importKey.trim())
      if (r.success) {
        const wallet: SessionWallet = { address: r.address, public_key: r.public_key, private_key: importKey.trim() }
        upsertAccount(wallet, labelInput.trim() || undefined)
        toast('Wallet imported.', 'success')
        onLoggedIn(wallet)
      } else toast(r.error ?? 'Import failed', 'error')
    } catch { toast('Import failed', 'error') }
    setLoading(false)
  }

  const handleImportSeed = async () => {
    const phrase = seedInput.trim().toLowerCase().replace(/\s+/g, ' ')
    const acc    = findBySeedPhrase(phrase)
    if (!acc) {
      toast('Seed phrase not found in this browser. Use private key import instead.', 'error')
      return
    }
    const wallet: SessionWallet = { address: acc.address, public_key: acc.public_key, private_key: acc.private_key }
    upsertAccount(wallet)
    toast(`Welcome back, ${acc.label}.`, 'success')
    onLoggedIn(wallet)
  }

  const handleSwitchAccount = (acc: StoredAccount) => {
    const wallet: SessionWallet = { address: acc.address, public_key: acc.public_key, private_key: acc.private_key }
    upsertAccount(wallet)
    onLoggedIn(wallet)
  }

  const words        = seedPhrase.split(' ')
  const seedConfirmed = confirmWord.trim().toLowerCase() === words[checkIdx]

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center animate-fade-in px-4">
      <div className="max-w-md w-full space-y-6">

        {/* Logo */}
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-cw-accent to-cw-purple rounded-2xl flex items-center justify-center mx-auto mb-4 glow-blue">
            <span className="text-white font-bold text-2xl font-mono">CW</span>
          </div>
          <h1 className="text-3xl font-extrabold font-display gradient-text tracking-tight">CodeWing Wallet</h1>
          <p className="text-gray-500 mt-2 text-sm">Blockchain Cloud Storage Network</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-cw-surface border border-cw-border rounded-xl p-1 gap-1">
          {([
            { id: 'accounts', label: `Accounts${accounts.length > 0 ? ` (${accounts.length})` : ''}` },
            { id: 'create',   label: 'New Wallet' },
            { id: 'import',   label: 'Import Key' },
            { id: 'seed',     label: 'Seed Phrase' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'flex-1 py-2 rounded-lg text-xs font-medium transition-all',
                tab === t.id ? 'bg-cw-accent text-white' : 'text-gray-400 hover:text-white hover:bg-cw-muted'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="card p-5">

          {/* Saved accounts */}
          {tab === 'accounts' && (
            <div className="space-y-4">
              <h3 className="font-semibold">Saved Accounts</h3>
              {accounts.length === 0 ? (
                <div className="text-center py-6 space-y-3">
                  <p className="text-gray-400 text-sm">No saved wallets yet.</p>
                  <button onClick={() => setTab('create')} className="btn-primary text-sm px-6">
                    Create your first wallet
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {accounts.map(acc => (
                    <div
                      key={acc.address}
                      className="border border-cw-border hover:border-cw-accent/40 rounded-xl p-4 cursor-pointer transition-all group"
                      onClick={() => handleSwitchAccount(acc)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{acc.label}</p>
                          <p className="font-mono text-xs text-gray-500 truncate mt-0.5">{truncAddr(acc.address, 16)}</p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {new Date(acc.last_login * 1000).toLocaleDateString()}
                          </p>
                        </div>
                        <span className="text-cw-accent text-sm opacity-0 group-hover:opacity-100 transition-opacity">
                          Login
                        </span>
                      </div>
                    </div>
                  ))}
                  <p className="text-gray-600 text-xs text-center">Click an account to log in</p>
                </div>
              )}
            </div>
          )}

          {/* Create new */}
          {tab === 'create' && !newWallet && (
            <div className="space-y-4">
              <h3 className="font-semibold">Create New Wallet</h3>
              <div>
                <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">Wallet Label (optional)</label>
                <input
                  value={labelInput}
                  onChange={e => setLabelInput(e.target.value)}
                  placeholder="My Main Wallet"
                  className="input"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-cw-accent to-cw-purple hover:opacity-90 rounded-2xl font-bold text-lg transition-all active:scale-95 disabled:opacity-40 glow-blue"
              >
                {loading ? 'Creating…' : 'Create Wallet'}
              </button>
              <p className="text-gray-600 text-xs text-center">
                A new keypair will be generated. Your seed phrase will be shown next.
              </p>
            </div>
          )}

          {/* Seed phrase reveal + confirmation */}
          {tab === 'create' && newWallet && (
            <div className="space-y-4">
              {!confirmed ? (
                <>
                  <div>
                    <h3 className="font-semibold text-amber-300">Save Your Seed Phrase</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Write these 12 words down before continuing</p>
                  </div>
                  <SeedDisplay
                    phrase={seedPhrase}
                    onCopy={() => { navigator.clipboard?.writeText(seedPhrase); toast('Seed phrase copied.', 'success') }}
                  />
                  <div className="space-y-2">
                    <label className="text-gray-400 text-xs block uppercase tracking-wider">
                      Confirm word #{checkIdx + 1} to continue:
                    </label>
                    <input
                      value={confirmWord}
                      onChange={e => setConfirmWord(e.target.value)}
                      placeholder={`Enter word #${checkIdx + 1}…`}
                      className={clsx(
                        'input font-mono',
                        confirmWord && (seedConfirmed ? 'border-emerald-500/50' : 'border-red-500/50')
                      )}
                    />
                    {confirmWord && !seedConfirmed && (
                      <p className="text-red-400 text-xs">Incorrect — check word #{checkIdx + 1}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setConfirmed(true)}
                    disabled={!seedConfirmed}
                    className="w-full py-3 btn-primary disabled:opacity-40"
                  >
                    Confirm Seed Phrase
                  </button>
                </>
              ) : (
                <div className="space-y-4 text-center">
                  <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto">
                    <span className="text-emerald-400 font-bold">OK</span>
                  </div>
                  <div>
                    <p className="font-semibold text-lg">Wallet Ready</p>
                    <p className="font-mono text-xs text-gray-500 mt-1 break-all">{newWallet.address}</p>
                  </div>
                  <div className="bg-cw-bg border border-cw-border rounded-xl p-3 text-left">
                    <p className="text-gray-500 text-xs">Your seed phrase is saved in this browser.</p>
                    <p className="text-gray-500 text-xs mt-1">To log in from another device, use your private key.</p>
                  </div>
                  <button onClick={() => onLoggedIn(newWallet)} className="w-full py-3.5 btn-primary">
                    Enter Wallet
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Import by private key */}
          {tab === 'import' && (
            <div className="space-y-4">
              <h3 className="font-semibold">Import with Private Key</h3>
              <div>
                <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">Wallet Label (optional)</label>
                <input value={labelInput} onChange={e => setLabelInput(e.target.value)}
                  placeholder="My Imported Wallet" className="input" />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">Private Key (64-char hex)</label>
                <textarea
                  value={importKey}
                  onChange={e => setImportKey(e.target.value)}
                  rows={3}
                  placeholder="64-character hex private key…"
                  className="input font-mono resize-none"
                />
              </div>
              <button
                onClick={handleImportKey}
                disabled={loading || !importKey.trim()}
                className="btn-primary w-full"
              >
                {loading ? 'Importing…' : 'Import Wallet'}
              </button>
              <p className="text-gray-600 text-xs text-center">
                Your private key stays in your browser. A seed phrase will be generated for future logins.
              </p>
            </div>
          )}

          {/* Login with seed phrase */}
          {tab === 'seed' && (
            <div className="space-y-4">
              <h3 className="font-semibold">Login with Seed Phrase</h3>
              <p className="text-gray-500 text-sm">
                Enter your 12-word seed phrase to restore access. The wallet must have been created in this browser.
              </p>
              <textarea
                value={seedInput}
                onChange={e => setSeedInput(e.target.value)}
                rows={3}
                placeholder="word1 word2 word3 … word12"
                className="input font-mono resize-none text-sm"
              />
              <button
                onClick={handleImportSeed}
                disabled={seedInput.trim().split(/\s+/).length < 12}
                className="btn-primary w-full disabled:opacity-40"
              >
                Restore Wallet
              </button>
              <div className="bg-cw-bg border border-cw-border rounded-xl p-3 text-xs text-gray-500 space-y-1">
                <p>Seed phrase works in this browser only — matched against saved accounts.</p>
                <p>To restore on a new device, use your 64-char private key on the Import tab.</p>
              </div>
            </div>
          )}
        </div>

        <p className="text-gray-700 text-xs text-center">Your private keys never leave your device.</p>
      </div>
    </div>
  )
}

// ── Main Wallet Page ────────────────────────────────────────────────────────────
export default function WalletPage() {
  const { wallet, setWallet } = useSessionWallet()
  const { toasts, toast }     = useToast()
  const { accounts, refresh: refreshAccounts } = useAccounts()
  const [data, setData]       = useState<WalletFull | null>(null)
  const [dataError, setDataError] = useState<string | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [mining, setMining]   = useState(false)

  const [showReceive,   setShowReceive]   = useState(false)
  const [showSend,      setShowSend]      = useState(false)
  const [showSettings,  setShowSettings]  = useState(false)
  const [showAccounts,  setShowAccounts]  = useState(false)
  const [showSeedModal, setShowSeedModal] = useState(false)

  const [sendTo,   setSendTo]   = useState('')
  const [sendAmt,  setSendAmt]  = useState('')
  const [sendStep, setSendStep] = useState<'form' | 'confirm'>('form')
  const [sending,  setSending]  = useState(false)

  const [labelEdit, setLabelEdit] = useState('')

  const seedPhrase = wallet ? (() => {
    const acc = loadAccounts()[wallet.address]
    return acc?.seed_phrase ?? ''
  })() : ''

  const loadData = useCallback(async () => {
    if (!wallet) return
    try {
      setDataError(null)
      const [d, p] = await Promise.all([getWalletFull(wallet.address), getPendingTxs()])
      setData(d)
      const pending = p?.pending ?? p?.transactions ?? []
      setPendingCount(pending.filter((tx: any) => tx.from === wallet.address || tx.to === wallet.address).length)
    } catch (e: any) { setDataError(e?.message ?? 'Failed to load') }
  }, [wallet])

  useEffect(() => { loadData() }, [loadData])
  useInterval(loadData, 5000)

  const handleMine = async () => {
    if (!wallet) return
    setMining(true)
    try {
      const r = await mineBlock(wallet.address)
      if (r.success) {
        toast(`Block #${r.block_index} mined. Balance updated.`, 'success')
        setPendingCount(0); setTimeout(loadData, 600)
      } else toast(r.error ?? 'Mining failed', 'error')
    } catch { toast('Mining failed', 'error') }
    setMining(false)
  }

  const handleFaucet = async () => {
    if (!wallet) return
    try {
      const r = await faucetDrip(wallet.address)
      if (r.success) toast('100 CWC added. Mine a block to confirm.', 'success')
      else toast(r.error ?? 'Faucet failed', 'error')
      setTimeout(loadData, 500)
    } catch { toast('Faucet failed', 'error') }
  }

  const handleSend = async () => {
    if (!wallet || !sendTo || !sendAmt) return
    setSending(true)
    try {
      const r = await sendPayment(wallet.address, sendTo, Math.floor(parseFloat(sendAmt) * 1_000_000))
      if (r.success) {
        toast('Sent. Mine a block to confirm.', 'success')
        setSendTo(''); setSendAmt(''); setSendStep('form'); setShowSend(false)
        setTimeout(loadData, 500)
      } else toast(r.error ?? 'Send failed', 'error')
    } catch { toast('Send failed', 'error') }
    setSending(false)
  }

  const exportBackup = () => {
    if (!wallet) return
    const acc    = loadAccounts()[wallet.address]
    const backup = {
      codewing_wallet_backup: true, version: '1.0',
      address: wallet.address, public_key: wallet.public_key,
      private_key: wallet.private_key,
      seed_phrase: acc?.seed_phrase ?? '',
      label: acc?.label ?? '',
      exported_at: new Date().toISOString(), network: 'CodeWing Network',
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `cw-wallet-${wallet.address.slice(0, 12)}.json`; a.click()
    URL.revokeObjectURL(url)
    toast('Backup downloaded.', 'success')
  }

  const handleSwitchAccount = (acc: StoredAccount) => {
    const w: SessionWallet = { address: acc.address, public_key: acc.public_key, private_key: acc.private_key }
    setWallet(w); setData(null); setShowAccounts(false)
    toast(`Switched to ${acc.label}`, 'success')
  }

  const handleRemoveAccount = (address: string) => {
    removeAccount(address)
    refreshAccounts()
    if (address === wallet?.address) {
      setWallet(null); setData(null)
      toast('Account removed', 'info')
    } else toast('Account removed from browser', 'info')
  }

  const balance   = data?.balance ?? 0
  const history   = data?.history ?? []
  const files     = data?.files   ?? []
  const sendFee   = sendAmt ? Math.floor((parseFloat(sendAmt) || 0) * 1_000_000 / 1000) + 1000 : 0
  const sendTotal = sendAmt ? Math.floor((parseFloat(sendAmt) || 0) * 1_000_000) + sendFee : 0
  const accLabel  = loadAccounts()[wallet?.address ?? '']?.label ?? ''

  // Landing
  if (!wallet) return (
    <div className="animate-fade-in">
      <Toast toasts={toasts} />
      <WalletLanding onLoggedIn={w => { setWallet(w); refreshAccounts() }} toast={toast} />
    </div>
  )

  return (
    <div className="space-y-6 animate-slide-up">
      <Toast toasts={toasts} />

      {/* Error banner */}
      {dataError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-center justify-between text-sm">
          <span className="text-red-400">{dataError} — is your node running?</span>
          <button onClick={loadData} className="text-red-300 hover:text-white text-xs border border-red-500/30 rounded-lg px-2 py-1">
            Retry
          </button>
        </div>
      )}

      {/* Pending tx banner */}
      {pendingCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-amber-300 text-sm font-medium">
              {pendingCount} transaction{pendingCount > 1 ? 's' : ''} pending
            </p>
            <p className="text-amber-500/70 text-xs mt-0.5">Mine a block to confirm</p>
          </div>
          <button
            onClick={handleMine}
            disabled={mining}
            className="flex-shrink-0 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 rounded-xl text-amber-300 text-sm font-semibold transition-all disabled:opacity-50"
          >
            {mining
              ? <span className="flex items-center gap-1.5"><Spinner size="sm" />Mining…</span>
              : 'Mine Block'
            }
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-display tracking-tight">My Wallet</h1>
            {accLabel && (
              <span className="px-2.5 py-1 bg-cw-accent/15 border border-cw-accent/30 rounded-full text-xs text-cw-accent font-medium">
                {accLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <PulseDot active />
            <span className="font-mono text-xs text-gray-500">{truncAddr(wallet.address, 16)}</span>
            <CopyButton text={wallet.address} onCopy={() => toast('Address copied.', 'success')} />
          </div>
        </div>
        <div className="flex gap-2">
          {accounts.length > 1 && (
            <button onClick={() => setShowAccounts(true)} className="btn-ghost text-xs">
              {accounts.length} Accounts
            </button>
          )}
          <button onClick={() => setShowSettings(true)} className="btn-ghost text-xs">Settings</button>
          <button onClick={handleFaucet} className="btn-secondary text-xs">Faucet</button>
        </div>
      </div>

      {/* Wallet card */}
      <div className="wallet-gradient rounded-2xl p-6 relative overflow-hidden glow-blue">
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, white 0%, transparent 50%)' }} />
        <div className="relative z-10">
          <p className="text-blue-200 text-sm font-medium uppercase tracking-wider">Confirmed Balance</p>
          <p className="text-5xl font-extrabold font-display mt-1 font-mono">
            {(balance / 1_000_000).toFixed(4)}
          </p>
          <p className="text-blue-300 text-xl font-semibold mt-0.5">CWC</p>

          {pendingCount > 0 && (
            <div className="mt-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-xs text-amber-300">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {pendingCount} tx pending — mine to confirm
              </span>
            </div>
          )}

          {balance === 0 && pendingCount === 0 && (
            <p className="text-blue-300/60 text-sm mt-2">Use Faucet then Mine Block to get started</p>
          )}

          <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-white/20">
            <div>
              <p className="text-blue-200 text-xs uppercase tracking-wider">Files</p>
              <p className="font-bold mt-0.5 font-mono">{files.length}</p>
            </div>
            <div>
              <p className="text-blue-200 text-xs uppercase tracking-wider">Transactions</p>
              <p className="font-bold mt-0.5 font-mono">{history.length}</p>
            </div>
            <div>
              <p className="text-blue-200 text-xs uppercase tracking-wider">Chain Height</p>
              <p className="font-bold mt-0.5 font-mono">{data?.chain_height ?? '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Send',    action: () => setShowSend(true) },
          { label: 'Receive', action: () => setShowReceive(true) },
          { label: 'Faucet',  action: handleFaucet },
          { label: 'Mine',    action: handleMine, loading: mining },
          { label: 'Backup',  action: exportBackup },
        ].map(({ label, action, loading: l }) => (
          <button
            key={label}
            onClick={action}
            className="card-hover flex flex-col items-center gap-2 py-5 transition-all active:scale-95 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-cw-muted border border-cw-border flex items-center justify-center">
              <span className="text-xs font-bold text-gray-400">{l ? '…' : label.slice(0, 2).toUpperCase()}</span>
            </div>
            <span className="text-xs text-gray-400 font-medium">{label}</span>
          </button>
        ))}
      </div>

      {/* Get coins guide */}
      {balance === 0 && !dataError && (
        <div className="card p-5 border-cw-accent/20">
          <h3 className="font-semibold text-sm mb-3 text-cw-accent tracking-tight">Getting Started</h3>
          <ol className="space-y-2 text-sm text-gray-400">
            {[
              ['Faucet',     'Adds 100 CWC to the pending pool'],
              ['Mine Block', 'Mines a block and confirms the transaction'],
              ['Done',       'Balance shows 150 CWC (100 faucet + 50 block reward)'],
            ].map(([step, desc], i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-cw-accent/20 text-cw-accent text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span>
                  <strong className="text-white">{step}</strong> — {desc}
                </span>
              </li>
            ))}
          </ol>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <button onClick={handleFaucet} className="btn-secondary text-sm py-2.5">Step 1: Faucet</button>
            <button
              onClick={handleMine}
              disabled={mining}
              className="py-2.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 rounded-xl text-amber-300 text-sm font-semibold transition-all disabled:opacity-50"
            >
              {mining ? 'Mining…' : 'Step 2: Mine'}
            </button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Transaction history */}
        <div className="card">
          <div className="px-5 py-4 border-b border-cw-border flex items-center justify-between">
            <h3 className="font-semibold">Transaction History</h3>
            <Badge color="blue">{history.length}</Badge>
          </div>
          <div className="px-5 pb-4 max-h-96 overflow-y-auto">
            {history.length === 0 ? (
              <Empty
                title="No confirmed transactions"
                sub="Transactions appear here after a block is mined."
                action={<button onClick={handleFaucet} className="btn-secondary text-xs">Request Faucet</button>}
              />
            ) : history.map((tx, i) => (
              <TxItem key={i} tx={tx} myAddress={wallet.address} />
            ))}
          </div>
        </div>

        {/* Files */}
        <div className="card">
          <div className="px-5 py-4 border-b border-cw-border flex items-center justify-between">
            <h3 className="font-semibold">My Files</h3>
            <Badge color="cyan">{files.length}</Badge>
          </div>
          <div className="px-5 pb-4 max-h-96 overflow-y-auto divide-y divide-cw-border/50">
            {files.length === 0
              ? <Empty title="No files stored yet" />
              : files.map((f, i) => (
                <div key={i} className="py-3 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{f.name}</p>
                    <p className="text-gray-500 text-xs">{fmtBytes(f.size)}</p>
                    <p className="font-mono text-xs text-cw-accent/70 truncate">{f.cid}</p>
                  </div>
                  <div className="text-right ml-3 flex-shrink-0">
                    <p className="text-amber-400 text-xs font-mono">{fmtCWC(f.cost_paid)}</p>
                    <p className="text-gray-600 text-xs">{timeAgo(f.timestamp)}</p>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Modals */}

      <Modal open={showAccounts} onClose={() => setShowAccounts(false)} title="Switch Account">
        <AccountSwitcher
          accounts={accounts}
          activeAddress={wallet.address}
          onSwitch={handleSwitchAccount}
          onRemove={handleRemoveAccount}
          onClose={() => setShowAccounts(false)}
        />
      </Modal>

      <Modal open={showReceive} onClose={() => setShowReceive(false)} title="Receive CWC">
        <div className="text-center space-y-4">
          <p className="text-gray-400 text-sm">Share this address to receive CWC</p>
          <div className="flex justify-center">
            <QRCodeDisplay value={wallet.address} size={200} />
          </div>
          <div className="bg-cw-bg rounded-xl p-3 flex items-center gap-2 border border-cw-border">
            <p className="font-mono text-xs text-cw-accent flex-1 break-all">{wallet.address}</p>
            <CopyButton text={wallet.address} onCopy={() => toast('Copied.', 'success')} />
          </div>
        </div>
      </Modal>

      <Modal open={showSend} onClose={() => { setShowSend(false); setSendStep('form') }} title="Send CWC">
        {sendStep === 'form' ? (
          <div className="space-y-4">
            <div>
              <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">Recipient Address</label>
              <input value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="CW..." className="input font-mono" />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">Amount (CWC)</label>
              <div className="relative">
                <input
                  type="number" value={sendAmt} onChange={e => setSendAmt(e.target.value)}
                  placeholder="0.00" className="input text-2xl font-bold pr-16 font-mono"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-cw-accent font-semibold text-sm">CWC</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1.5">
                <span>Available: {fmtCWCShort(balance)}</span>
                <button onClick={() => setSendAmt(((balance - 2000) / 1_000_000).toFixed(6))} className="text-cw-accent hover:text-blue-300">
                  Max
                </button>
              </div>
            </div>
            {sendAmt && parseFloat(sendAmt) > 0 && (
              <div className="bg-cw-bg rounded-xl p-3 space-y-1.5 text-sm border border-cw-border">
                {[['Amount', `${sendAmt} CWC`], ['Network Fee', fmtCWC(sendFee)], ['Total', fmtCWC(sendTotal)]].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-gray-400">{k}</span>
                    <span className={clsx('font-mono', k === 'Total' ? 'text-amber-400 font-bold' : 'text-gray-200')}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setSendStep('confirm')}
              disabled={!sendTo || !sendAmt || parseFloat(sendAmt) <= 0 || sendTotal > balance}
              className="btn-primary w-full py-3.5"
            >
              Review Transaction
            </button>
            {sendTotal > balance && sendAmt && (
              <p className="text-red-400 text-xs text-center">Insufficient balance</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center py-2">
              <p className="font-semibold text-lg">Confirm Transaction</p>
              <p className="text-gray-500 text-sm mt-1">Review before sending</p>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ['From',   truncAddr(wallet.address, 14)],
                ['To',     truncAddr(sendTo, 14)],
                ['Amount', `${sendAmt} CWC`],
                ['Fee',    fmtCWC(sendFee)],
                ['Total',  fmtCWC(sendTotal)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-cw-border/50">
                  <span className="text-gray-400">{k}</span>
                  <span className={clsx('font-mono text-xs', k === 'Total' ? 'text-amber-400 font-bold' : 'text-gray-200')}>{v}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={() => setSendStep('form')} className="btn-secondary">Back</button>
              <button onClick={handleSend} disabled={sending} className="btn-primary">
                {sending ? 'Sending…' : 'Confirm Send'}
              </button>
            </div>
            <p className="text-gray-600 text-xs text-center">Mine a block after sending to confirm on-chain</p>
          </div>
        )}
      </Modal>

      <Modal open={showSeedModal} onClose={() => setShowSeedModal(false)} title="Seed Phrase">
        {seedPhrase ? (
          <SeedDisplay
            phrase={seedPhrase}
            onCopy={() => { navigator.clipboard?.writeText(seedPhrase); toast('Seed phrase copied.', 'success') }}
          />
        ) : (
          <p className="text-gray-500 text-sm">No seed phrase found for this wallet.</p>
        )}
      </Modal>

      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Wallet Settings">
        <div className="space-y-3">
          <div className="bg-cw-bg rounded-xl p-4 border border-cw-border">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">Wallet Label</p>
            <div className="flex gap-2">
              <input
                value={labelEdit || accLabel}
                onChange={e => setLabelEdit(e.target.value)}
                className="input flex-1 text-sm"
                placeholder="My Wallet"
              />
              <button onClick={() => {
                if (!labelEdit) return
                const accs = loadAccounts()
                if (accs[wallet.address]) {
                  accs[wallet.address].label = labelEdit
                  localStorage.setItem('cw_accounts', JSON.stringify(accs))
                }
                refreshAccounts(); toast('Label updated.', 'success')
              }} className="btn-secondary text-xs px-3">Save</button>
            </div>
          </div>

          <div className="bg-cw-bg rounded-xl p-4 border border-cw-border">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Address</p>
            <p className="font-mono text-xs break-all text-gray-200">{wallet.address}</p>
          </div>

          <div className="bg-cw-bg rounded-xl p-4 border border-cw-border">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Public Key</p>
            <p className="font-mono text-xs break-all text-gray-200">{wallet.public_key}</p>
          </div>

          <button
            onClick={() => setShowSeedModal(true)}
            className="w-full py-2.5 bg-cw-accent/10 hover:bg-cw-accent/20 border border-cw-accent/20 rounded-xl font-medium text-sm text-cw-accent transition-all"
          >
            View Seed Phrase (12 words)
          </button>

          <button onClick={exportBackup} className="btn-primary w-full">Export Wallet Backup</button>

          <button
            onClick={() => { navigator.clipboard?.writeText(wallet.private_key); toast('Private key copied — keep it safe.', 'info') }}
            className="w-full py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-xl font-medium text-sm text-amber-400 transition-all"
          >
            Copy Private Key
          </button>

          <button
            onClick={() => { setWallet(null); setData(null); setShowSettings(false); toast('Logged out', 'info') }}
            className="btn-danger w-full"
          >
            Log Out
          </button>

          <p className="text-gray-600 text-xs text-center">Never share your private key or seed phrase</p>
        </div>
      </Modal>
    </div>
  )
}