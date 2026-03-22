// ── Blockchain ─────────────────────────────────────────────────────────────────

export interface Block {
  index: number
  hash: string
  full_hash: string
  prev_hash: string
  miner: string
  tx_count: number
  timestamp: number
  nonce: number
  difficulty: number
  reward: number
}

export interface ChainStats {
  chain_height: number
  difficulty: number
  total_transactions: number
  total_files: number
  total_storage_bytes: number
  pending_transactions: number
  peer_count: number
  node_peer_id: string | null
  total_supply?: number
}

// ── Transactions ───────────────────────────────────────────────────────────────

export type TxType = 'Payment' | 'StoreFile' | 'StorageReward' | 'Faucet' | 'DeleteFile' | 'Register'

export interface TxRecord {
  tx_id: string
  type: TxType
  from: string
  to: string
  amount: number
  fee: number
  timestamp: number
  block_index: number
  memo: string | null
  is_incoming?: boolean
}

export interface PendingTx {
  id: string
  type: string
  from: string
  to: string
  amount: number
  fee: number
  timestamp: number
}

// ── Wallet ─────────────────────────────────────────────────────────────────────

export interface Wallet {
  address: string
  public_key: string
  private_key: string
}

export interface WalletFull {
  address: string
  balance: number
  balance_cwc: number
  files: StoredFileInfo[]
  file_count: number
  history: TxRecord[]
  chain_height: number
  symbol: string
}

// ── Storage ────────────────────────────────────────────────────────────────────

export interface StoredFileInfo {
  cid: string
  name: string
  size: number
  timestamp: number
  cost_paid: number
}

export interface FileListing {
  cid: string
  name: string
  size: number
  chunks: number
  mime_type: string
  owner: string
  stored_at: number
  node_id: string
}

export interface StorageStats {
  local: LocalStorageStats
  network: NetworkStats
}

export interface LocalStorageStats {
  total_files: number
  total_chunks: number
  total_bytes: number
  store_path: string
}

// ── Nodes ──────────────────────────────────────────────────────────────────────

export interface StorageNode {
  node_id: string
  full_id: string
  api_addr: string
  capacity: number
  used: number
  available: number
  reputation: number
  last_seen: number
  healthy: boolean
  version: string
}

export interface NodeStats {
  total_nodes: number
  healthy_nodes: number
  total_chunks: number
  total_capacity: number
  total_used: number
  replication: number
}

export interface NetworkStats {
  total_nodes: number
  healthy_nodes: number
  total_chunks: number
  total_capacity: number
  total_used: number
  replication: number
}

// ── Economy ────────────────────────────────────────────────────────────────────

export interface FeeSchedule {
  block_reward_cwc: number
  storage_price_per_mb_day: number
  tx_fee_cwc: number
  store_file_base_fee_cwc: number
  node_share_pct: number
  miner_share_pct: number
  micro_per_cwc: number
  mining_fee_cwc: number      // injected by routes.rs get_fee_schedule
  mining_fee: number
  mining_treasury: string
}

export interface StorageInvoice {
  file_name: string
  file_size_bytes: number
  file_size_mb: number
  storage_days: number
  price_per_mb_day: number
  storage_cost: number
  tx_fee: number
  total_cost: number
  node_share: number
  miner_share: number
  currency: string
}

export interface LeaderboardEntry {
  rank: number
  address: string
  balance: number
  balance_cwc: number
}

// ── Upload / Download ──────────────────────────────────────────────────────────

export interface UploadResult {
  success: boolean
  cid: string
  name: string
  size: number
  chunks: number
  mime_type: string
  encryption_key: string
  owner: string
  distributed: number
  local_fallback: number
  replication: number
  warning: string
  error?: string
}

// ── WebSocket ──────────────────────────────────────────────────────────────────

export interface WsStatsUpdate {
  type: 'stats_update' | 'snapshot'
  height?: number
  difficulty?: number
  pending?: number
  peers?: number
  files?: number
  stats?: ChainStats
}