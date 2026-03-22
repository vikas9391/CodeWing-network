import React, { useState, useEffect, useCallback } from 'react'
import { Badge, SectionHeader, StatCard, Empty, Spinner, Toast, ProgressBar } from '../components/ui'
import { useToast, useInterval } from '../hooks'
import { listNodes, getNodeStats, announceNode } from '../api/client'
import { fmtBytes, timeAgo, genNodeId, clsx } from '../utils'
import type { StorageNode, NodeStats } from '../types'

export default function NodesPage() {
  const [nodes, setNodes]           = useState<StorageNode[]>([])
  const [stats, setStats]           = useState<NodeStats | null>(null)
  const [loading, setLoading]       = useState(true)
  const [announcing, setAnnouncing] = useState(false)
  const [form, setForm] = useState({
    node_id: '', peer_id: '', api_addr: 'http://',
    capacity_bytes: 10_737_418_240,
  })
  const { toasts, toast } = useToast()

  const load = useCallback(async () => {
    try {
      const [n, s] = await Promise.all([listNodes(), getNodeStats()])
      setNodes(n.nodes ?? [])
      setStats(s)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  useInterval(load, 10000)

  const handleGenId = () => {
    const id = genNodeId()
    setForm(f => ({ ...f, node_id: id, peer_id: `peer_${id.slice(0, 8)}` }))
  }

  const handleAnnounce = async () => {
    if (!form.node_id || !form.api_addr) { toast('Fill in Node ID and API address', 'error'); return }
    setAnnouncing(true)
    try {
      const payload = {
        ...form,
        used_bytes: 0,
        reputation: 100,
        last_seen:  Math.floor(Date.now() / 1000),
        version:    '0.4.0',
      }
      const r = await announceNode(payload)
      if (r.success) {
        toast(`Node announced. Total nodes: ${r.total_nodes}`, 'success')
        load()
        setForm(f => ({ ...f, node_id: '', peer_id: '', api_addr: 'http://' }))
      } else toast(r.error ?? 'Failed', 'error')
    } catch { toast('Announce failed', 'error') }
    setAnnouncing(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  const healthyCount = nodes.filter(n => n.healthy).length

  return (
    <div className="space-y-6 animate-slide-up">
      <Toast toasts={toasts} />
      <SectionHeader title="Storage Node Registry" sub="Kademlia-style routing · 3× replication" />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Nodes"   value={stats.total_nodes}   />
          <StatCard label="Healthy Nodes" value={stats.healthy_nodes} accent />
          <StatCard label="Total Chunks"  value={stats.total_chunks}  />
          <StatCard label="Replication"   value={`${stats.replication}×`} />
        </div>
      )}

      {/* Announce form */}
      <div className="card p-5 space-y-4">
        <div>
          <h3 className="font-semibold tracking-tight">Announce Storage Node</h3>
          <p className="text-gray-500 text-sm mt-0.5">
            Register a node so the network can route chunks to it.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">Node ID (hex)</label>
            <div className="flex gap-2">
              <input
                value={form.node_id}
                onChange={e => setForm(f => ({ ...f, node_id: e.target.value }))}
                placeholder="64-char hex…"
                className="input font-mono text-xs flex-1"
              />
              <button onClick={handleGenId} className="btn-secondary flex-shrink-0 text-xs px-3">
                Generate
              </button>
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">API Address</label>
            <input
              value={form.api_addr}
              onChange={e => setForm(f => ({ ...f, api_addr: e.target.value }))}
              placeholder="http://192.168.x.x:3000"
              className="input font-mono"
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1.5 uppercase tracking-wider">
              Capacity — {fmtBytes(form.capacity_bytes)}
            </label>
            <input
              type="number"
              value={form.capacity_bytes}
              onChange={e => setForm(f => ({ ...f, capacity_bytes: Number(e.target.value) }))}
              className="input font-mono"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleAnnounce}
              disabled={announcing}
              className="btn-primary w-full py-3.5 disabled:opacity-40"
            >
              {announcing ? 'Announcing…' : 'Announce Node'}
            </button>
          </div>
        </div>
      </div>

      {/* Node list */}
      <div className="card">
        <div className="px-5 py-4 border-b border-cw-border flex items-center justify-between">
          <h3 className="font-semibold">Registered Nodes</h3>
          <div className="flex items-center gap-2">
            <Badge color={healthyCount > 0 ? 'green' : 'gray'}>{healthyCount} healthy</Badge>
            <Badge color="blue">{nodes.length} total</Badge>
            <button
              onClick={load}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-cw-muted"
            >
              Refresh
            </button>
          </div>
        </div>

        {nodes.length === 0 ? (
          <Empty title="No nodes registered" sub="Announce a node above to join the network." />
        ) : (
          <div className="divide-y divide-cw-border/50">
            {nodes.map((n, i) => (
              <div key={i} className="px-5 py-4 space-y-3 hover:bg-cw-muted/20 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={clsx(
                      'w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1',
                      n.healthy ? 'bg-emerald-400' : 'bg-red-500'
                    )} />
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-cw-accent truncate">{n.node_id}</p>
                      <p className="text-gray-500 text-xs mt-0.5">{n.api_addr}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Badge color={n.healthy ? 'green' : 'red'}>
                      {n.healthy ? 'Healthy' : 'Offline'}
                    </Badge>
                    <Badge color="blue">rep: {n.reputation}</Badge>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                    <span>Storage Utilization</span>
                    <span className="font-mono">{fmtBytes(n.used)} / {fmtBytes(n.capacity)}</span>
                  </div>
                  <ProgressBar value={n.used} max={n.capacity} color="blue" />
                  <p className="text-xs text-gray-600 mt-1 font-mono">{fmtBytes(n.available)} available</p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 font-mono">
                  <span>v{n.version}</span>
                  <span>{n.full_id?.slice(0, 10)}</span>
                  <span>{timeAgo(n.last_seen)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}