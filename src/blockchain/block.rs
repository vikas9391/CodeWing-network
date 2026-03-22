use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use chrono::Utc;
use crate::blockchain::transaction::Transaction;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub index: u64,
    pub timestamp: i64,
    pub prev_hash: String,
    pub hash: String,
    pub nonce: u64,
    pub transactions: Vec<Transaction>,
    pub merkle_root: String,
    pub difficulty: u32,
    pub miner: String,
    pub reward: u64,
}

impl Block {
    pub fn new(
        index: u64,
        prev_hash: String,
        transactions: Vec<Transaction>,
        difficulty: u32,
        miner: String,
    ) -> Self {
        let timestamp = Utc::now().timestamp();
        let merkle_root = Self::compute_merkle_root(&transactions);
        let mut block = Block {
            index,
            timestamp,
            prev_hash,
            hash: String::new(),
            nonce: 0,
            transactions,
            merkle_root,
            difficulty,
            miner,
            reward: 50_000_000, // 50 CWC tokens (in smallest unit)
        };
        block.hash = block.compute_hash();
        block
    }

    pub fn genesis() -> Self {
        let mut block = Block {
            index: 0,
            timestamp: 1_700_000_000,
            prev_hash: "0000000000000000000000000000000000000000000000000000000000000000"
                .to_string(),
            hash: String::new(),
            nonce: 0,
            transactions: vec![],
            merkle_root: "0000000000000000000000000000000000000000000000000000000000000000"
                .to_string(),
            difficulty: 4,
            miner: "genesis".to_string(),
            reward: 0,
        };
        block.hash = block.compute_hash();
        block
    }

    pub fn compute_hash(&self) -> String {
        let data = format!(
            "{}{}{}{}{}{}",
            self.index,
            self.timestamp,
            self.prev_hash,
            self.merkle_root,
            self.nonce,
            self.difficulty
        );
        let mut hasher = Sha256::new();
        hasher.update(data.as_bytes());
        hex::encode(hasher.finalize())
    }

    pub fn mine(&mut self) {
        let target = "0".repeat(self.difficulty as usize);
        println!(
            "⛏️  Mining block #{} with difficulty {}...",
            self.index, self.difficulty
        );
        loop {
            self.hash = self.compute_hash();
            if self.hash.starts_with(&target) {
                println!(
                    "✅ Block #{} mined! Hash: {}",
                    self.index,
                    &self.hash[..16]
                );
                break;
            }
            self.nonce += 1;
        }
    }

    pub fn is_valid(&self) -> bool {
        let target = "0".repeat(self.difficulty as usize);
        self.hash == self.compute_hash() && self.hash.starts_with(&target)
    }

    pub fn compute_merkle_root(transactions: &[Transaction]) -> String {
        if transactions.is_empty() {
            return "0".repeat(64);
        }

        let mut hashes: Vec<String> = transactions
            .iter()
            .map(|tx| tx.hash())
            .collect();

        while hashes.len() > 1 {
            if hashes.len() % 2 != 0 {
                hashes.push(hashes.last().unwrap().clone());
            }
            hashes = hashes
                .chunks(2)
                .map(|pair| {
                    let combined = format!("{}{}", pair[0], pair[1]);
                    let mut hasher = Sha256::new();
                    hasher.update(combined.as_bytes());
                    hex::encode(hasher.finalize())
                })
                .collect();
        }

        hashes[0].clone()
    }

    pub fn transaction_count(&self) -> usize {
        self.transactions.len()
    }

    pub fn size_bytes(&self) -> usize {
        // Approximate size: each tx ~250 bytes + block header ~200 bytes
        200 + self.transactions.len() * 250
    }

    pub fn contains_transaction(&self, tx_id: &str) -> bool {
        self.transactions.iter().any(|tx| tx.id == tx_id)
    }
}

impl std::fmt::Display for Block {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Block #{} | Hash: {}... | Txs: {} | Miner: {} | Nonce: {}",
            self.index,
            &self.hash[..16],
            self.transactions.len(),
            self.miner,
            self.nonce
        )
    }
}