#![allow(dead_code)]

use serde::{Deserialize, Serialize};

// ── Token constants ────────────────────────────────────────────────────────────

/// 1 CWC = 1_000_000 micro-CWC (like satoshis)
pub const MICRO: u64 = 1_000_000;

/// Block mining reward: 50 CWC
pub const BLOCK_REWARD: u64 = 50 * MICRO;

/// Storage price: 0.1 CWC per MB per day
pub const STORAGE_PRICE_PER_MB_PER_DAY: u64 = 100_000; // 0.1 CWC in micro

/// Transaction fee: 0.001 CWC flat
pub const TX_FEE: u64 = 1_000;

/// Store-file fee: 0.002 CWC base + size-based
pub const STORE_FILE_BASE_FEE: u64 = 2_000;

/// Storage node share of storage fees: 70%
pub const NODE_SHARE_BPS: u64 = 7000; // basis points

/// Miner share of storage fees: 30%
pub const MINER_SHARE_BPS: u64 = 3000;

// ── Pricing calculations ───────────────────────────────────────────────────────

/// Calculate total storage cost for a file
pub fn storage_cost(size_bytes: u64, days: u64) -> u64 {
    let mb = (size_bytes + 1_048_575) / 1_048_576; // ceil to MB
    mb * STORAGE_PRICE_PER_MB_PER_DAY * days
}

/// Calculate storage cost per day only
pub fn storage_cost_per_day(size_bytes: u64) -> u64 {
    let mb = (size_bytes + 1_048_575) / 1_048_576;
    mb * STORAGE_PRICE_PER_MB_PER_DAY
}

/// Calculate tx fee for any transaction
pub fn tx_fee(amount: u64) -> u64 {
    // Flat fee + 0.1% of amount
    TX_FEE + amount / 1000
}

/// Node's share of a storage payment
pub fn node_share(total: u64) -> u64 {
    total * NODE_SHARE_BPS / 10_000
}

/// Miner's share of a storage payment
pub fn miner_share(total: u64) -> u64 {
    total * MINER_SHARE_BPS / 10_000
}

/// Format micro-CWC as human-readable string
pub fn fmt_cwc(micro: u64) -> String {
    let whole  = micro / MICRO;
    let frac   = micro % MICRO;
    if frac == 0 {
        format!("{} CWC", whole)
    } else {
        format!("{}.{:06} CWC", whole, frac)
            .trim_end_matches('0').trim_end_matches('.').to_string()
            + " CWC"
    }
}

// ── Invoice ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageInvoice {
    pub file_name:          String,
    pub file_size_bytes:    u64,
    pub file_size_mb:       u64,
    pub storage_days:       u64,
    pub price_per_mb_day:   u64,
    pub storage_cost:       u64,
    pub tx_fee:             u64,
    pub total_cost:         u64,
    pub node_share:         u64,
    pub miner_share:        u64,
    pub currency:           String,
}

impl StorageInvoice {
    pub fn calculate(file_name: &str, size_bytes: u64, days: u64) -> Self {
        let mb           = (size_bytes + 1_048_575) / 1_048_576;
        let store_cost   = storage_cost(size_bytes, days);
        let fee          = STORE_FILE_BASE_FEE;
        let total        = store_cost + fee;

        StorageInvoice {
            file_name:        file_name.to_string(),
            file_size_bytes:  size_bytes,
            file_size_mb:     mb,
            storage_days:     days,
            price_per_mb_day: STORAGE_PRICE_PER_MB_PER_DAY,
            storage_cost:     store_cost,
            tx_fee:           fee,
            total_cost:       total,
            node_share:       node_share(store_cost),
            miner_share:      miner_share(store_cost),
            currency:         "CWC".to_string(),
        }
    }
}

// ── Fee schedule summary ──────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct FeeSchedule {
    pub block_reward_cwc:         f64,
    pub storage_price_per_mb_day: f64,
    pub tx_fee_cwc:               f64,
    pub store_file_base_fee_cwc:  f64,
    pub node_share_pct:           f64,
    pub miner_share_pct:          f64,
    pub micro_per_cwc:            u64,
}

impl FeeSchedule {
    pub fn current() -> Self {
        FeeSchedule {
            block_reward_cwc:         BLOCK_REWARD as f64 / MICRO as f64,
            storage_price_per_mb_day: STORAGE_PRICE_PER_MB_PER_DAY as f64 / MICRO as f64,
            tx_fee_cwc:               TX_FEE as f64 / MICRO as f64,
            store_file_base_fee_cwc:  STORE_FILE_BASE_FEE as f64 / MICRO as f64,
            node_share_pct:           70.0,
            miner_share_pct:          30.0,
            micro_per_cwc:            MICRO,
        }
    }
}