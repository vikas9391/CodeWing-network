import React, { useState, useEffect, useCallback } from 'react'
import { Badge, SectionHeader, StatCard, Empty, Toast } from '../components/ui'
import { useToast, useInterval } from '../hooks'
import { getPeers, getNodeInfo, connectPeer } from '../api/client'
import { clsx } from '../utils'

export function NetworkPage() {
  const [peers, setPeers]           = useState<any>(null)
  const [info, setInfo]             = useState<any>(null)
  const [peerAddr, setPeerAddr]     = useState('')
  const [connecting, setConnecting] = useState(false)
  const { toasts, toast }           = useToast()

  const loadData = useCallback(async () => {
    try {
      const [p, i] = await Promise.all([getPeers(), getNodeInfo()])
      setPeers(p); setInfo(i)
    } catch {}
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useInterval(loadData, 8000)

  const handleConnect = async () => {
    if (!peerAddr.trim()) { toast('Enter a multiaddr', 'error'); return }
    setConnecting(true)
    try {
      const r = await connectPeer(peerAddr.trim())
      if (r.success) toast(`Dialing ${peerAddr}`, 'success')
      else toast(r.error ?? 'Connect failed', 'error')
    } catch { toast('Connect failed', 'error') }
    setConnecting(false)
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <Toast toasts={toasts} />
      <SectionHeader title="P2P Network" sub="libp2p · Gossipsub · mDNS discovery" />

      {info && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Chain Height" value={info.chain_height} accent />
          <StatCard label="Difficulty"   value={info.difficulty}         />
          <StatCard label="P2P Port"     value={info.p2p_port}           />
          <StatCard label="API Port"     value={info.api_port}           />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Node identity */}
        <div className="card p-5 space-y-4">
          <div>
            <h3 className="font-semibold tracking-tight">Node Identity</h3>
            <p className="text-xs text-gray-500 mt-0.5">Local peer information and protocol version</p>
          </div>

          {info ? (
            <div className="space-y-3 text-sm">
              {[
                ['Name',     info.name],
                ['Version',  info.version],
                ['Protocol', info.protocol],
                ['Peer ID',  info.peer_id ?? 'N/A'],
                ['API Port', info.api_port],
                ['P2P Port', info.p2p_port],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-4 border-b border-cw-border/30 pb-2.5 last:border-0 last:pb-0">
                  <span className="text-gray-500 flex-shrink-0 text-xs uppercase tracking-wider">{k}</span>
                  <span className="font-mono text-xs text-gray-200 truncate text-right">{String(v ?? '—')}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Node Offline" sub="Start the Rust node first." />
          )}
        </div>

        {/* Peer connection */}
        <div className="card p-5 space-y-4">
          <div>
            <h3 className="font-semibold tracking-tight">Connect to Peer</h3>
            <p className="text-gray-500 text-sm mt-0.5">
              Enter a libp2p multiaddr to manually dial a peer node.
            </p>
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">Multiaddr</label>
            <input
              value={peerAddr}
              onChange={e => setPeerAddr(e.target.value)}
              placeholder="/ip4/192.168.1.x/tcp/4001/p2p/12D3Ko…"
              className="input font-mono"
            />
          </div>

          <button onClick={handleConnect} disabled={connecting} className="btn-primary w-full">
            {connecting ? 'Dialing…' : 'Connect'}
          </button>

          <div className="bg-cw-bg border border-cw-border rounded-xl p-4 space-y-3 text-sm">
            <p className="text-gray-400 font-medium text-xs uppercase tracking-wider">Peer Status</p>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Connected Peers</span>
              <span className="font-bold text-cw-accent font-mono">{peers?.peer_count ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500">My Peer ID</span>
              <span className="font-mono text-xs text-gray-300 truncate ml-4 max-w-[180px]">
                {peers?.peer_id ? `${peers.peer_id.slice(0, 24)}…` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Protocol info */}
      <div className="card p-5">
        <div className="mb-4">
          <h3 className="font-semibold tracking-tight">Protocol Details</h3>
          <p className="text-xs text-gray-500 mt-0.5">Active network protocols and peer discovery</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 text-sm">
          {[
            {
              title: 'Gossipsub',
              desc:  'Block and transaction broadcasting across all peers using pub/sub messaging protocol.'
            },
            {
              title: 'mDNS',
              desc:  'Automatic local network peer discovery — no bootstrap node required.'
            },
            {
              title: 'Identify',
              desc:  'Protocol version exchange and peer metadata sharing on connection establishment.'
            },
          ].map(({ title, desc }) => (
            <div key={title} className="bg-cw-bg border border-cw-border rounded-xl p-4">
              <p className="font-semibold text-sm mb-2 text-gray-100">{title}</p>
              <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 bg-cw-bg border border-cw-border rounded-xl p-4">
          <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-3">
            Multi-Node Testing
          </p>
          <pre className="font-mono text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{`# Terminal 1 — Node A
API_PORT=3000 P2P_PORT=4000 cargo run --bin codewing-node

# Terminal 2 — Node B
API_PORT=3001 P2P_PORT=4001 STORE_DIR=./store-b cargo run --bin codewing-node

# Nodes auto-discover via mDNS on local network`}</pre>
        </div>
      </div>
    </div>
  )
}

export default NetworkPage