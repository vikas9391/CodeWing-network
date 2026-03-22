import React, { useState, useEffect, useCallback } from 'react'
import { Badge, SectionHeader, Empty, Spinner, Toast } from '../components/ui'
import { useToast, useInterval, useSessionWallet } from '../hooks'
import { getPendingTxs, getAllHistory, sendPayment } from '../api/client'
import { fmtCWC, timeAgo, truncAddr, txTypeBg, clsx } from '../utils'
import type { PendingTx, TxRecord } from '../types'

export default function TransactionsPage() {
  const [pending, setPending] = useState<PendingTx[]>([])
  const [history, setHistory] = useState<TxRecord[]>([])
  const [loading, setLoading] = useState(true)
  const { toasts, toast }     = useToast()
  const { wallet }            = useSessionWallet()

  const [from,    setFrom]    = useState('')
  const [to,      setTo]      = useState('')
  const [amount,  setAmount]  = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (wallet?.address && !from) setFrom(wallet.address)
  }, [wallet])

  const load = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([getPendingTxs(), getAllHistory()])
      setPending(p.pending ?? [])
      setHistory(h.transactions ?? [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useInterval(load, 4000)

  const handleSend = async () => {
    if (!from || !to || !amount) { toast('Fill all fields', 'error'); return }
    setSending(true)
    try {
      const micro = Math.floor(parseFloat(amount) * 1_000_000)
      const r = await sendPayment(from, to, micro)
      if (r.success) {
        toast('Transaction added to mempool. Mine a block to confirm.', 'success')
        setTo(''); setAmount('')
        load()
      } else toast(r.error ?? 'Failed', 'error')
    } catch { toast('Failed', 'error') }
    setSending(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6 animate-slide-up">
      <Toast toasts={toasts} />
      <SectionHeader
        title="Transactions"
        sub={`${pending.length} pending · ${history.length} confirmed`}
      />

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Pending</p>
          <p className="font-bold text-lg text-amber-400 font-mono mt-1">{pending.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Confirmed</p>
          <p className="font-bold text-lg text-emerald-400 font-mono mt-1">{history.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider">Total Volume</p>
          <p className="font-bold text-sm text-gray-200 font-mono mt-1">
            {fmtCWC(history.reduce((a, tx) => a + tx.amount, 0))}
          </p>
        </div>
      </div>

      {/* Send form */}
      <div className="card p-5">
        <div className="mb-4">
          <h3 className="font-semibold tracking-tight">Send CWC Payment</h3>
          <p className="text-xs text-gray-500 mt-0.5">Transfer CWC to any address on the network</p>
        </div>
        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-1">
            <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">From</label>
            <input
              value={from}
              onChange={e => setFrom(e.target.value)}
              placeholder="CW..."
              className="input font-mono"
            />
            {wallet && from === wallet.address && (
              <p className="text-emerald-400/70 text-xs mt-1">Connected wallet</p>
            )}
          </div>
          <div className="md:col-span-1">
            <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">To</label>
            <input
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="CW..."
              className="input font-mono"
            />
          </div>
          <div>
            <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">Amount (CWC)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.00"
              className="input font-mono"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleSend}
              disabled={sending || !from || !to || !amount}
              className="btn-primary w-full disabled:opacity-40"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>

      {/* Pending mempool */}
      <div className="card">
        <div className="px-5 py-4 border-b border-cw-border flex items-center gap-3">
          <h3 className="font-semibold flex-1">Mempool</h3>
          <button
            onClick={load}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-cw-muted"
          >
            Refresh
          </button>
          <Badge color={pending.length > 0 ? 'amber' : 'gray'}>{pending.length} pending</Badge>
        </div>

        {pending.length === 0 ? (
          <Empty title="Mempool is empty" sub="All transactions confirmed" />
        ) : (
          <div className="divide-y divide-cw-border/50">
            {pending.map((tx, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between animate-tx-slide">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={clsx('badge flex-shrink-0', txTypeBg(tx.type))}>{tx.type}</span>
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-gray-400 truncate">{tx.id}</p>
                    <p className="text-gray-600 text-xs">
                      {truncAddr(tx.from)} → {truncAddr(tx.to)}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-amber-400 text-sm font-bold font-mono">{fmtCWC(tx.amount)}</p>
                  <p className="text-gray-600 text-xs font-mono">fee: {fmtCWC(tx.fee)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmed history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-cw-border flex items-center justify-between">
          <h3 className="font-semibold">Confirmed Transactions</h3>
          <Badge color="green">{history.length}</Badge>
        </div>

        {history.length === 0 ? (
          <Empty title="No confirmed transactions yet" sub="Mine a block to confirm pending transactions." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-cw-border bg-cw-bg/50">
                  {['Type', 'Block', 'From', 'To', 'Amount', 'Fee', 'Time'].map(h => (
                    <th key={h} className="py-3 px-4 font-medium text-left whitespace-nowrap uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cw-border/50">
                {history.map((tx, i) => (
                  <tr
                    key={i}
                    className={clsx(
                      'hover:bg-cw-muted/20 transition-colors animate-tx-slide',
                      wallet && (tx.from === wallet.address || tx.to === wallet.address) ? 'bg-cw-accent/5' : ''
                    )}
                  >
                    <td className="py-3 px-4">
                      <span className={clsx('badge whitespace-nowrap', txTypeBg(tx.type))}>{tx.type}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap font-mono">#{tx.block_index}</td>
                    <td className="py-3 px-4 font-mono text-gray-400 whitespace-nowrap">
                      <span className={clsx(wallet && tx.from === wallet.address ? 'text-cw-accent' : '')}>
                        {truncAddr(tx.from)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-gray-400 whitespace-nowrap">
                      <span className={clsx(wallet && tx.to === wallet.address ? 'text-emerald-400' : '')}>
                        {truncAddr(tx.to)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-amber-400 font-medium whitespace-nowrap font-mono">{fmtCWC(tx.amount)}</td>
                    <td className="py-3 px-4 text-gray-500 whitespace-nowrap font-mono">{fmtCWC(tx.fee)}</td>
                    <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{timeAgo(tx.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}