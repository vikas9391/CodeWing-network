use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::blockchain::{
    block::Block,
    transaction::{Transaction, TxType},
    economy::{BLOCK_REWARD, node_share, miner_share, fmt_cwc},
};

#[derive(Debug, Serialize, Deserialize)]
pub struct Blockchain {
    pub chain:                Vec<Block>,
    pub difficulty:           u32,
    pub pending_transactions: Vec<Transaction>,
    pub balances:             HashMap<String, u64>,
    pub file_registry:        HashMap<String, FileRecord>,
    pub tx_history:           Vec<TxRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
    pub cid:         String,
    pub owner:       String,
    pub name:        String,
    pub size:        u64,
    pub timestamp:   i64,
    pub block_index: u64,
    pub is_deleted:  bool,
    pub cost_paid:   u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TxRecord {
    pub tx_id:       String,
    pub tx_type:     String,
    pub from:        String,
    pub to:          String,
    pub amount:      u64,
    pub fee:         u64,
    pub timestamp:   i64,
    pub block_index: u64,
    pub memo:        Option<String>,
}

impl Blockchain {
    pub fn new() -> Self {
        Blockchain {
            chain:                vec![Block::genesis()],
            difficulty:           4,
            pending_transactions: vec![],
            balances:             HashMap::new(),
            file_registry:        HashMap::new(),
            tx_history:           vec![],
        }
    }

    pub fn latest_block(&self) -> &Block {
        self.chain.last().unwrap()
    }

    // ── Add transaction ────────────────────────────────────────────────────

    pub fn add_transaction(&mut self, tx: Transaction) -> Result<String> {
        if tx.from.is_empty() {
            return Err(anyhow!("Transaction must have a sender"));
        }

        // Balance check (skip for network/faucet sources)
        let free_sources = ["CODEWING_NETWORK", "CODEWING_FAUCET", "genesis"];
        if !free_sources.contains(&tx.from.as_str()) {
            let balance = self.get_balance(&tx.from);
            let needed  = tx.total_cost();
            if balance < needed {
                return Err(anyhow!(
                    "Insufficient balance: have {} need {} ({})",
                    fmt_cwc(balance), fmt_cwc(needed), tx.from
                ));
            }
        }

        let id = tx.id.clone();
        self.pending_transactions.push(tx);
        Ok(id)
    }

    // ── Mining ─────────────────────────────────────────────────────────────

    pub fn mine_pending_transactions(&mut self, miner_address: String) -> Result<Block> {
        // Collect all fees from pending txs
        let total_fees: u64 = self.pending_transactions.iter()
            .map(|tx| tx.fee)
            .sum();

        // Add miner reward tx (block reward + fees)
        let miner_reward = BLOCK_REWARD + total_fees;
        let reward_tx = Transaction {
            id:        format!("reward_{}", self.chain.len()),
            tx_type:   TxType::StorageReward,
            from:      "CODEWING_NETWORK".to_string(),
            to:        miner_address.clone(),
            amount:    miner_reward,
            file_cid:  None, file_size: None, file_name: None,
            timestamp: chrono::Utc::now().timestamp(),
            signature: "network_signed".to_string(),
            fee:       0,
            memo:      Some(format!("Block reward + {} fees", fmt_cwc(total_fees))),
        };

        let mut transactions = self.pending_transactions.drain(..).collect::<Vec<_>>();
        transactions.push(reward_tx);

        let mut block = Block::new(
            self.chain.len() as u64,
            self.latest_block().hash.clone(),
            transactions,
            self.difficulty,
            miner_address.clone(),
        );

        block.mine();
        self.process_block(&block);
        self.chain.push(block.clone());
        self.adjust_difficulty();

        Ok(block)
    }

    // ── Process confirmed block ────────────────────────────────────────────

    fn process_block(&mut self, block: &Block) {
        for tx in &block.transactions {
            // Deduct from sender
            if !["CODEWING_NETWORK", "CODEWING_FAUCET"].contains(&tx.from.as_str()) {
                let bal = self.balances.entry(tx.from.clone()).or_insert(0);
                *bal = bal.saturating_sub(tx.amount + tx.fee);
            }

            // Credit recipient
            let bal = self.balances.entry(tx.to.clone()).or_insert(0);
            *bal += tx.amount;

            // For StoreFile: distribute fee to miner
            if tx.tx_type == TxType::StoreFile {
                let m_share = miner_share(tx.amount);
                let miner_bal = self.balances.entry(block.miner.clone()).or_insert(0);
                *miner_bal += m_share;
            }

            // Update file registry
            match tx.tx_type {
                TxType::StoreFile => {
                    if let Some(cid) = &tx.file_cid {
                        self.file_registry.insert(cid.clone(), FileRecord {
                            cid:         cid.clone(),
                            owner:       tx.from.clone(),
                            name:        tx.file_name.clone().unwrap_or_default(),
                            size:        tx.file_size.unwrap_or(0),
                            timestamp:   tx.timestamp,
                            block_index: block.index,
                            is_deleted:  false,
                            cost_paid:   tx.amount,
                        });
                    }
                }
                TxType::DeleteFile => {
                    if let Some(cid) = &tx.file_cid {
                        if let Some(rec) = self.file_registry.get_mut(cid) {
                            rec.is_deleted = true;
                        }
                    }
                }
                _ => {}
            }

            // Record in tx history
            self.tx_history.push(TxRecord {
                tx_id:       tx.id.clone(),
                tx_type:     format!("{:?}", tx.tx_type),
                from:        tx.from.clone(),
                to:          tx.to.clone(),
                amount:      tx.amount,
                fee:         tx.fee,
                timestamp:   tx.timestamp,
                block_index: block.index,
                memo:        tx.memo.clone(),
            });
        }
    }

    // ── Queries ────────────────────────────────────────────────────────────

    pub fn is_valid(&self) -> bool {
        for i in 1..self.chain.len() {
            let cur  = &self.chain[i];
            let prev = &self.chain[i - 1];
            if !cur.is_valid()              { return false; }
            if cur.prev_hash != prev.hash   { return false; }
        }
        true
    }

    pub fn get_balance(&self, address: &str) -> u64 {
        *self.balances.get(address).unwrap_or(&0)
    }

    pub fn get_files_for(&self, owner: &str) -> Vec<&FileRecord> {
        self.file_registry.values()
            .filter(|f| f.owner == owner && !f.is_deleted)
            .collect()
    }

    pub fn get_tx_history(&self, address: &str, limit: usize) -> Vec<&TxRecord> {
        self.tx_history.iter()
            .filter(|tx| tx.from == address || tx.to == address)
            .rev()
            .take(limit)
            .collect()
    }

    pub fn get_all_tx_history(&self, limit: usize) -> Vec<&TxRecord> {
        self.tx_history.iter().rev().take(limit).collect()
    }

    /// Top N richest addresses
    pub fn leaderboard(&self, top: usize) -> Vec<(String, u64)> {
        let mut entries: Vec<(String, u64)> = self.balances
            .iter()
            .filter(|(addr, _)| !["CODEWING_NETWORK", "CODEWING_FAUCET"].contains(&addr.as_str()))
            .map(|(addr, bal)| (addr.clone(), *bal))
            .collect();
        entries.sort_by(|a, b| b.1.cmp(&a.1));
        entries.into_iter().take(top).collect()
    }

    pub fn get_stats(&self) -> ChainStats {
        let total_supply: u64 = self.balances.values().sum();
        ChainStats {
            height:               self.chain.len() as u64,
            difficulty:           self.difficulty,
            total_transactions:   self.chain.iter().map(|b| b.transactions.len()).sum(),
            total_files:          self.file_registry.values().filter(|f| !f.is_deleted).count(),
            total_storage_bytes:  self.file_registry.values()
                                    .filter(|f| !f.is_deleted).map(|f| f.size).sum(),
            pending_transactions: self.pending_transactions.len(),
            total_supply,
            circulating_supply:   total_supply,
        }
    }

    fn adjust_difficulty(&mut self) {
        let len = self.chain.len();
        if len % 10 == 0 && len > 0 {
            let last = &self.chain[len - 10..];
            let dt   = last.last().unwrap().timestamp - last.first().unwrap().timestamp;
            if dt < 100 { self.difficulty += 1; }
            else if dt > 300 && self.difficulty > 1 { self.difficulty -= 1; }
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChainStats {
    pub height:               u64,
    pub difficulty:           u32,
    pub total_transactions:   usize,
    pub total_files:          usize,
    pub total_storage_bytes:  u64,
    pub pending_transactions: usize,
    pub total_supply:         u64,
    pub circulating_supply:   u64,
}