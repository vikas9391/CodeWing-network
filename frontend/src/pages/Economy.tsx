import React, { useState, useEffect, useCallback } from 'react'
import { Badge, SectionHeader, StatCard, Empty, Toast } from '../components/ui'
import { useToast, useInterval, useSessionWallet } from '../hooks'
import { getFeeSchedule, getInvoice, getLeaderboard, faucetDrip, getAllHistory } from '../api/client'
import { fmtCWC, fmtBytes, truncAddr, txTypeBg, timeAgo, clsx } from '../utils'
import type { FeeSchedule, StorageInvoice, LeaderboardEntry, TxRecord } from '../types'

export default function EconomyPage() {
  const [fees,    setFees]    = useState<FeeSchedule | null>(null)
  const [board,   setBoard]   = useState<LeaderboardEntry[]>([])
  const [history, setHistory] = useState<TxRecord[]>([])
  const [invoice, setInvoice] = useState<StorageInvoice | null>(null)
  const [faucetAddr,     setFaucetAddr]     = useState('')
  const [faucetResult,   setFaucetResult]   = useState<{ success: boolean; error?: string } | null>(null)
  const [faucetLoading,  setFaucetLoading]  = useState(false)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const { toasts, toast } = useToast()
  const { wallet }        = useSessionWallet()
  const [invForm, setInvForm] = useState({ file_name: 'document.pdf', size_bytes: 10_485_760, days: 30 })

  useEffect(() => {
    if (wallet?.address && !faucetAddr) setFaucetAddr(wallet.address)
  }, [wallet?.address])

  const loadData = useCallback(async () => {
    try {
      const [f, b, h] = await Promise.all([getFeeSchedule(), getLeaderboard(), getAllHistory()])
      setFees(f)
      setBoard(b.leaderboard ?? [])
      setHistory(h.transactions ?? [])
    } catch {}
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useInterval(loadData, 10000)

  const calcInvoice = async () => {
    setInvoiceLoading(true)
    try { setInvoice(await getInvoice(invForm.file_name, invForm.size_bytes, invForm.days)) }
    catch { toast('Failed to calculate invoice', 'error') }
    setInvoiceLoading(false)
  }

  const drip = async () => {
    if (!faucetAddr.trim()) { toast('Enter a wallet address', 'error'); return }
    setFaucetLoading(true); setFaucetResult(null)
    try {
      const r = await faucetDrip(faucetAddr.trim())
      setFaucetResult(r)
      if (r.success) toast('100 CWC queued. Mine a block to confirm.', 'success')
      else toast(r.error ?? 'Faucet failed', 'error')
    } catch { toast('Faucet request failed', 'error') }
    setFaucetLoading(false)
  }

  const MINING_FEE_CWC = fees?.mining_fee_cwc ?? 5

  return (
    <div className="space-y-6 animate-slide-up">
      <Toast toasts={toasts} />
      <SectionHeader
        title="Token Economy"
        sub={`CWC fee schedule · invoices · leaderboard · ${history.length} transactions`}
      />

      {/* Fee schedule */}
      {fees && (
        <div className="card p-5">
          <h3 className="font-semibold mb-4 tracking-tight">Fee Schedule</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: 'Block Reward',   value: `${fees.block_reward_cwc} CWC`,                            color: 'text-amber-400'  },
              { label: 'Mining Fee',     value: `${MINING_FEE_CWC} CWC`,                                   color: 'text-red-400'    },
              { label: 'Net Gain',       value: `${(fees.block_reward_cwc - MINING_FEE_CWC).toFixed(2)} CWC`, color: 'text-emerald-400' },
              { label: 'Storage/MB/Day', value: `${fees.storage_price_per_mb_day} CWC`,                    color: 'text-cyan-400'   },
              { label: 'Tx Fee',         value: `${fees.tx_fee_cwc} CWC`,                                  color: 'text-blue-400'   },
              { label: 'Node Share',     value: `${fees.node_share_pct}%`,                                 color: 'text-purple-400' },
              { label: 'Miner Share',    value: `${fees.miner_share_pct}%`,                                color: 'text-blue-400'   },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-cw-bg border border-cw-border rounded-xl p-3">
                <p className="text-gray-500 text-xs uppercase tracking-wider">{label}</p>
                <p className={clsx('font-bold mt-1.5 text-sm font-mono', color)}>{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-2.5 text-xs text-amber-300/80">
            Mining fee of <strong>{MINING_FEE_CWC} CWC</strong> is charged per block and routed to the protocol treasury.
            Net gain equals block reward minus mining fee. Fee is waived for miners with zero balance.
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Invoice calculator */}
        <div className="card p-5 space-y-4">
          <div>
            <h3 className="font-semibold tracking-tight">Storage Invoice Calculator</h3>
            <p className="text-xs text-gray-500 mt-0.5">Estimate cost before uploading</p>
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">File Name</label>
            <input
              value={invForm.file_name}
              onChange={e => setInvForm(f => ({ ...f, file_name: e.target.value }))}
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">
                File Size — {fmtBytes(invForm.size_bytes)}
              </label>
              <input
                type="number"
                value={invForm.size_bytes}
                onChange={e => setInvForm(f => ({ ...f, size_bytes: Number(e.target.value) }))}
                className="input font-mono"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">Duration (days)</label>
              <input
                type="number"
                value={invForm.days}
                onChange={e => setInvForm(f => ({ ...f, days: Number(e.target.value) }))}
                className="input font-mono"
              />
            </div>
          </div>

          <button onClick={calcInvoice} disabled={invoiceLoading} className="btn-primary w-full">
            {invoiceLoading ? 'Calculating…' : 'Calculate Cost'}
          </button>

          {invoice && (
            <div className="bg-cw-bg border border-cw-border rounded-xl p-4 space-y-2 animate-bounce-in">
              <p className="font-semibold text-sm text-cw-accent">{invoice.file_name}</p>
              <div className="space-y-1.5 text-xs divide-y divide-cw-border/50">
                {[
                  ['Size',         fmtBytes(invoice.file_size_bytes)],
                  ['Duration',     `${invoice.storage_days} days`],
                  ['Storage Cost', fmtCWC(invoice.storage_cost)],
                  ['Tx Fee',       fmtCWC(invoice.tx_fee)],
                  ['Node Share',   fmtCWC(invoice.node_share)],
                  ['Miner Share',  fmtCWC(invoice.miner_share)],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between pt-1.5">
                    <span className="text-gray-500">{k}</span>
                    <span className="text-gray-200 font-mono">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 font-bold">
                  <span className="text-gray-300">Total</span>
                  <span className="text-amber-400 text-sm font-mono">{fmtCWC(invoice.total_cost)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Faucet */}
          <div className="card p-5 space-y-4">
            <div>
              <h3 className="font-semibold tracking-tight">Testnet Faucet</h3>
              <p className="text-gray-500 text-sm mt-0.5">Receive 100 CWC to test the network</p>
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">Wallet Address</label>
              <input
                value={faucetAddr}
                onChange={e => setFaucetAddr(e.target.value)}
                placeholder="CW..."
                className="input font-mono"
              />
              {wallet && faucetAddr === wallet.address && (
                <p className="text-emerald-400/70 text-xs mt-1">Connected wallet selected</p>
              )}
            </div>

            <button
              onClick={drip}
              disabled={faucetLoading || !faucetAddr.trim()}
              className="w-full py-3 bg-gradient-to-r from-amber-600 to-orange-600
                hover:from-amber-500 hover:to-orange-500 rounded-xl font-semibold text-sm
                transition-all active:scale-95 disabled:opacity-40"
            >
              {faucetLoading ? 'Sending…' : 'Request 100 CWC'}
            </button>

            {faucetResult && (
              <div className={clsx(
                'rounded-xl p-3 text-xs animate-fade-in border',
                faucetResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/20 text-red-300'
              )}>
                {faucetResult.success
                  ? '100 CWC queued. Mine a block to confirm.'
                  : faucetResult.error
                }
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div className="card">
            <div className="px-5 py-4 border-b border-cw-border flex items-center justify-between">
              <h3 className="font-semibold">CWC Leaderboard</h3>
              <button
                onClick={loadData}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-cw-muted"
              >
                Refresh
              </button>
            </div>

            {board.length === 0
              ? <Empty title="No balances yet" sub="Mine blocks to earn CWC." />
              : (
                <div className="divide-y divide-cw-border/50">
                  {board.map((e, i) => (
                    <div
                      key={i}
                      className={clsx(
                        'px-5 py-3 flex items-center justify-between',
                        wallet && e.address === wallet.address ? 'bg-cw-accent/5' : ''
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className={clsx(
                          'font-mono text-xs font-bold w-6',
                          i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-600'
                        )}>
                          #{i + 1}
                        </span>
                        <div>
                          <span className="font-mono text-xs text-gray-300">{truncAddr(e.address, 16)}</span>
                          {wallet && e.address === wallet.address && (
                            <span className="text-cw-accent text-xs ml-1.5 font-medium">(you)</span>
                          )}
                        </div>
                      </div>
                      <span className="text-amber-400 font-bold text-sm font-mono">
                        {e.balance_cwc.toFixed(4)} CWC
                      </span>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>
      </div>

      {/* Transaction history */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-cw-border flex items-center gap-3">
          <h3 className="font-semibold flex-1">Recent Transactions</h3>
          <Badge color="blue">{history.length}</Badge>
          <button
            onClick={loadData}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-cw-muted"
          >
            Refresh
          </button>
        </div>

        {history.length === 0
          ? <Empty title="No transactions yet" />
          : (
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
                  {history.slice(0, 50).map((tx, i) => (
                    <tr key={i} className="hover:bg-cw-muted/20 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={clsx('badge', txTypeBg(tx.type))}>{tx.type}</span>
                      </td>
                      <td className="py-3 px-4 text-gray-500 whitespace-nowrap font-mono">#{tx.block_index}</td>
                      <td className="py-3 px-4 font-mono text-gray-400 whitespace-nowrap">{truncAddr(tx.from)}</td>
                      <td className="py-3 px-4 font-mono text-gray-400 whitespace-nowrap">{truncAddr(tx.to)}</td>
                      <td className="py-3 px-4 text-amber-400 font-medium whitespace-nowrap font-mono">{fmtCWC(tx.amount)}</td>
                      <td className="py-3 px-4 text-gray-500 whitespace-nowrap font-mono">{fmtCWC(tx.fee)}</td>
                      <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{timeAgo(tx.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
    </div>
  )
}