import React, { useState, useEffect } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { clsx } from './utils'
import { PulseDot } from './components/ui'
import { useSessionWallet, loadAccounts } from './hooks'
import { getStats } from './api/client'

import Dashboard        from './pages/Dashboard'
import BlocksPage       from './pages/Blocks'
import StoragePage      from './pages/Storage'
import NodesPage        from './pages/Nodes'
import EconomyPage      from './pages/Economy'
import NetworkPage      from './pages/Network'
import TransactionsPage from './pages/Transactions'
import WalletPage       from './pages/Wallet'

const NAV = [
  { to: '/',             icon: '⬡', label: 'Dashboard'    },
  { to: '/wallet',       icon: '💎', label: 'Wallet'       },
  { to: '/blocks',       icon: '⛓', label: 'Blocks'       },
  { to: '/storage',      icon: '💾', label: 'Storage'      },
  { to: '/transactions', icon: '↔', label: 'Transactions' },
  { to: '/nodes',        icon: '🖧', label: 'Nodes'        },
  { to: '/economy',      icon: '◎', label: 'Economy'      },
  { to: '/network',      icon: '⟳', label: 'Network'      },
]

export default function App() {
  const [collapsed, setCollapsed]   = useState(false)
  const [nodeOnline, setNodeOnline] = useState(false)
  const { wallet }                  = useSessionWallet()
  const accLabel = wallet ? (loadAccounts()[wallet.address]?.label ?? '') : ''

  useEffect(() => {
    const check = async () => {
      try { await getStats(); setNodeOnline(true) }
      catch { setNodeOnline(false) }
    }
    check()
    const id = setInterval(check, 8000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex h-screen bg-cw-bg overflow-hidden">

      {/* Sidebar */}
      <aside style={{ width: collapsed ? 60 : 224 }}
        className="flex flex-col bg-cw-surface border-r border-cw-border flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden">

        {/* Logo */}
        <div className="flex items-center border-b border-cw-border flex-shrink-0"
          style={{ height: 60, paddingLeft: collapsed ? 0 : 16, paddingRight: collapsed ? 0 : 16, justifyContent: collapsed ? 'center' : 'flex-start', gap: collapsed ? 0 : 12 }}>
          <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-cw-accent flex items-center justify-center font-bold text-lg glow-blue">⛓</div>
          {!collapsed && (
            <div>
              <p className="font-bold text-sm leading-none font-display">CodeWing</p>
              <p className="text-gray-600 text-xs mt-0.5">Network v0.4</p>
            </div>
          )}
        </div>

        {/* Wallet badge */}
        {!collapsed && wallet && (
          <div className="mx-3 mt-3 px-3 py-2 bg-cw-accent/10 border border-cw-accent/20 rounded-xl flex items-center gap-2">
            <span className="flex-shrink-0">💎</span>
            <div style={{ minWidth: 0 }}>
              <p className="text-cw-accent text-xs font-semibold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {accLabel || 'My Wallet'}
              </p>
              <p className="text-gray-500 text-xs font-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {wallet.address.slice(0, 16)}…
              </p>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto" style={{ overflowX: 'hidden' }}>
          {NAV.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => clsx(
                'group relative flex items-center rounded-xl text-sm font-medium mb-0.5',
                'transition-colors duration-150 cursor-pointer h-10',
                collapsed ? 'justify-center' : 'gap-3 px-3',
                isActive
                  ? 'bg-cw-accent/15 text-cw-accent'
                  : 'text-gray-500 hover:text-gray-200 hover:bg-cw-muted'
              )}>
              <span className="text-base flex-shrink-0">{icon}</span>
              {!collapsed && <span>{label}</span>}
              {collapsed && (
                <span className="absolute left-14 top-1/2 -translate-y-1/2 z-50 px-3 py-1.5 bg-cw-surface border border-cw-border rounded-lg text-sm text-white whitespace-nowrap shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-cw-border flex-shrink-0">
          <div className={clsx('flex items-center py-2.5', collapsed ? 'justify-center' : 'gap-2 px-4')}>
            <PulseDot active={nodeOnline} />
            {!collapsed && <span className="text-xs text-gray-500">{nodeOnline ? 'Node Online' : 'Node Offline'}</span>}
          </div>
          <button
            onClick={() => setCollapsed(c => !c)}
            className={clsx(
              'w-full flex items-center py-2.5 border-t border-cw-border/50',
              'text-gray-500 hover:text-gray-200 hover:bg-cw-muted transition-colors text-sm font-medium',
              collapsed ? 'justify-center' : 'gap-2 px-4'
            )}>
            <span>{collapsed ? '→' : '←'}</span>
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-7xl mx-auto p-6">
          <Routes>
            <Route path="/"             element={<Dashboard />}        />
            <Route path="/wallet"       element={<WalletPage />}       />
            <Route path="/blocks"       element={<BlocksPage />}       />
            <Route path="/storage"      element={<StoragePage />}      />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/nodes"        element={<NodesPage />}        />
            <Route path="/economy"      element={<EconomyPage />}      />
            <Route path="/network"      element={<NetworkPage />}      />
          </Routes>
        </div>
      </main>
    </div>
  )
}