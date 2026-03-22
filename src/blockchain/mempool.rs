use std::collections::HashMap;
use crate::blockchain::transaction::Transaction;

pub struct Mempool {
    pub transactions: HashMap<String, Transaction>,
    pub max_size: usize,
}

impl Mempool {
    pub fn new() -> Self {
        Mempool {
            transactions: HashMap::new(),
            max_size: 1000,
        }
    }

    pub fn add(&mut self, tx: Transaction) -> bool {
        if self.transactions.len() >= self.max_size {
            return false;
        }
        self.transactions.insert(tx.id.clone(), tx);
        true
    }

    pub fn drain(&mut self, limit: usize) -> Vec<Transaction> {
        let keys: Vec<String> = self.transactions.keys().take(limit).cloned().collect();
        keys.into_iter()
            .filter_map(|k| self.transactions.remove(&k))
            .collect()
    }

    pub fn size(&self) -> usize {
        self.transactions.len()
    }
}