import React, { useState, useEffect, useCallback } from 'react'
import { Badge, Empty, Spinner, SectionHeader, StatCard, Toast } from '../components/ui'
import { useInterval, useSessionWallet, useToast } from '../hooks'
import { getBlocks, mineBlock } from '../api/client'
import { timeAgo, fmtCWC, clsx } from '../utils'
import type { Block } from '../types'

export default function BlocksPage() {
  const [blocks,   setBlocks]   = useState<Block[]>([])
  const [selected, setSelected] = useState<Block | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [mining,   setMining]   = useState(false)
  const [miner,    setMiner]    = useState('')
  const { toasts, toast }       = useToast()
  const { wallet }              = useSessionWallet()

  useEffect(() => {
    if (wallet?.address) setMiner(wallet.address)
  }, [wallet?.address])

  const load = useCallback(async () => {
    try { const d = await getBlocks(); setBlocks(d.blocks ?? []) }
    catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useInterval(load, 5000)

  const handleMine = async () => {
    if (!miner.trim()) { toast('Enter a miner address', 'error'); return }
    setMining(true)
    try {
      const r = await mineBlock(miner.trim())
      if (r.success) {
        const net    = fmtCWC(r.net_reward ?? r.reward ?? 0)
        const fee    = fmtCWC(r.fee_charged ?? 0)
        const waived = r.fee_waived
        const msg    = waived
          ? `Block #${r.block_index} mined. Reward: ${fmtCWC(r.gross_reward ?? r.reward ?? 0)} — fee waived (zero balance)`
          : `Block #${r.block_index} mined. Net reward: ${net} (gross minus ${fee} fee)`
        toast(msg, 'success')
        load()
      } else toast(r.error ?? 'Mining failed', 'error')
    } catch { toast('Mining failed', 'error') }
    setMining(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  const totalTxs = blocks.reduce((a, b) => a + b.tx_count, 0)
  const avgTime  = blocks.length > 1
    ? Math.round((blocks[0].timestamp - blocks[blocks.length - 1].timestamp) / blocks.length)
    : null

  return (
    <div className="space-y-6 animate-slide-up">
      <Toast toasts={toasts} />
      <SectionHeader
        title="Block Explorer"
        sub={`${blocks.length} recent blocks · ${totalTxs} total transactions`}
      />

      {/* Stats */}
      {blocks[0] && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Latest Block"   value={`#${blocks[0].index}`}         icon={null} accent />
          <StatCard label="Difficulty"     value={blocks[0].difficulty}           icon={null} />
          <StatCard label="Avg Block Time" value={avgTime ? `${avgTime}s` : '—'} icon={null} />
          <StatCard label="Total Txs"      value={totalTxs}                       icon={null} />
        </div>
      )}

      {/* Mine panel */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="font-semibold text-gray-100 tracking-tight">Mine a Block</h3>
            <p className="text-xs text-gray-500 mt-0.5">Confirm pending transactions and earn block rewards</p>
          </div>
          <div className="text-right text-xs space-y-1">
            <div className="flex items-center justify-end gap-2">
              <span className="text-gray-500">Mining fee</span>
              <span className="font-mono font-semibold text-red-400">5 CWC</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <span className="text-gray-500">Block reward</span>
              <span className="font-mono text-gray-300">{blocks[0] ? fmtCWC(blocks[0].reward ?? 0) : '—'}</span>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-cw-border pt-1">
              <span className="text-gray-500">Net gain</span>
              <span className="font-mono font-semibold text-emerald-400">
                {blocks[0] ? fmtCWC(Math.max(0, (blocks[0].reward ?? 0) - 5_000_000)) : '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <input
            value={miner}
            onChange={e => setMiner(e.target.value)}
            placeholder="Miner address (CW...)"
            className="input flex-1 font-mono"
          />
          <button
            onClick={handleMine}
            disabled={mining || !miner.trim()}
            className="btn-primary px-6 flex-shrink-0 disabled:opacity-40"
          >
            {mining
              ? <span className="flex items-center gap-2"><Spinner size="sm" />Mining</span>
              : 'Mine Block'
            }
          </button>
        </div>

        {wallet && miner === wallet.address && (
          <p className="text-emerald-400/70 text-xs mt-2">Connected wallet selected as miner</p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
          <span>Fee deducted only if balance is 5 CWC or more — waived for new miners</span>
          <span>Mine a block to confirm all pending transactions</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Block list */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-5 py-4 border-b border-cw-border flex items-center justify-between">
            <h3 className="font-semibold">Recent Blocks</h3>
            <div className="flex items-center gap-2">
              <Badge color="blue">{blocks.length}</Badge>
              <button onClick={load} className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-cw-muted">
                Refresh
              </button>
            </div>
          </div>

          {blocks.length === 0
            ? <Empty icon={null} title="No blocks yet" sub="Mine the first block above." />
            : (
              <div className="divide-y divide-cw-border/50">
                {blocks.map(b => (
                  <div
                    key={b.index}
                    onClick={() => setSelected(s => s?.index === b.index ? null : b)}
                    className={clsx(
                      'px-5 py-4 cursor-pointer transition-all select-none',
                      selected?.index === b.index
                        ? 'bg-cw-accent/10 border-l-2 border-cw-accent'
                        : 'hover:bg-cw-muted/30'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-cw-accent/10 border border-cw-accent/20 flex items-center justify-center text-cw-accent font-bold text-sm flex-shrink-0 font-mono">
                          {b.index}
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-gray-300 truncate">{b.hash}</p>
                          <p className="text-gray-500 text-xs mt-0.5 truncate">
                            Miner: <span className="text-gray-400">{b.miner?.slice(0, 22)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <div className="flex gap-1.5 justify-end">
                          <Badge color="blue">{b.tx_count} txs</Badge>
                          <Badge color="purple">diff {b.difficulty}</Badge>
                        </div>
                        <p className="text-gray-600 text-xs mt-1">{timeAgo(b.timestamp)}</p>
                      </div>
                    </div>

                    {selected?.index === b.index && (
                      <div className="mt-4 pt-4 border-t border-cw-border grid grid-cols-2 gap-3 text-xs animate-fade-in">
                        {[
                          ['Full Hash',  b.full_hash],
                          ['Prev Hash',  b.prev_hash],
                          ['Nonce',      b.nonce?.toLocaleString()],
                          ['Reward',     fmtCWC(b.reward ?? 0)],
                          ['Timestamp',  new Date(b.timestamp * 1000).toLocaleString()],
                          ['Difficulty', b.difficulty],
                        ].map(([k, v]) => (
                          <div key={String(k)}>
                            <p className="text-gray-600 mb-0.5 uppercase tracking-wider text-[10px]">{k}</p>
                            <p className="font-mono text-gray-300 break-all">{String(v)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          }
        </div>

        {/* Stats sidebar */}
        <div className="space-y-4">
          {blocks[0] && (
            <>
              <div className="card p-4 space-y-3">
                <h4 className="font-semibold text-xs text-gray-400 uppercase tracking-wider">Latest Block</h4>
                {[
                  ['Height',     `#${blocks[0].index}`],
                  ['Difficulty', blocks[0].difficulty],
                  ['Txs',        blocks[0].tx_count],
                  ['Reward',     fmtCWC(blocks[0].reward ?? 0)],
                  ['Nonce',      blocks[0].nonce?.toLocaleString()],
                  ['Age',        timeAgo(blocks[0].timestamp)],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex justify-between text-sm border-b border-cw-border/30 pb-2 last:border-0 last:pb-0">
                    <span className="text-gray-500">{k}</span>
                    <span className="text-gray-200 font-medium font-mono text-xs">{v}</span>
                  </div>
                ))}
              </div>

              <div className="card p-4 space-y-2">
                <h4 className="font-semibold text-xs text-gray-400 uppercase tracking-wider">Chain Health</h4>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Est. blocks/hr</span>
                  <span className="text-emerald-400 font-mono">
                    {avgTime ? `~${Math.round(3600 / avgTime)}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Blocks</span>
                  <span className="text-gray-200 font-mono">{blocks.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total Txs</span>
                  <span className="text-gray-200 font-mono">{totalTxs}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}