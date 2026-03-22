use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use chrono::Utc;
use crate::blockchain::economy::{tx_fee, STORE_FILE_BASE_FEE, storage_cost};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TxType {
    StoreFile,
    DeleteFile,
    Payment,
    StorageReward,
    Register,
    Faucet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id:        String,
    pub tx_type:   TxType,
    pub from:      String,
    pub to:        String,
    pub amount:    u64,
    pub file_cid:  Option<String>,
    pub file_size: Option<u64>,
    pub file_name: Option<String>,
    pub timestamp: i64,
    pub signature: String,
    pub fee:       u64,
    pub memo:      Option<String>,
}

impl Transaction {
    pub fn new_payment(from: String, to: String, amount: u64) -> Self {
        let timestamp = Utc::now().timestamp();
        let fee       = tx_fee(amount);
        let id        = Self::gen_id(&from, &to, amount, timestamp);
        Transaction {
            id, tx_type: TxType::Payment,
            from, to, amount,
            file_cid: None, file_size: None, file_name: None,
            timestamp, signature: String::new(),
            fee, memo: None,
        }
    }

    pub fn new_store_file(
        from: String, file_cid: String,
        file_name: String, file_size: u64, _price: u64,
    ) -> Self {
        let timestamp = Utc::now().timestamp();
        // Price = 30 days storage + base fee
        let cost  = storage_cost(file_size, 30);
        let fee   = STORE_FILE_BASE_FEE;
        let id    = Self::gen_id(&from, &file_cid, cost, timestamp);
        Transaction {
            id, tx_type: TxType::StoreFile,
            from: from.clone(), to: from,
            amount: cost,
            file_cid: Some(file_cid),
            file_size: Some(file_size),
            file_name: Some(file_name),
            timestamp, signature: String::new(),
            fee, memo: Some("30-day storage".to_string()),
        }
    }

    pub fn new_delete_file(from: String, file_cid: String) -> Self {
        let timestamp = Utc::now().timestamp();
        let id        = Self::gen_id(&from, &file_cid, 0, timestamp);
        Transaction {
            id, tx_type: TxType::DeleteFile,
            from: from.clone(), to: from,
            amount: 0,
            file_cid: Some(file_cid),
            file_size: None, file_name: None,
            timestamp, signature: String::new(),
            fee: 500, memo: None,
        }
    }

    pub fn new_storage_reward(node_addr: String, amount: u64) -> Self {
        let timestamp = Utc::now().timestamp();
        let id        = Self::gen_id("NETWORK", &node_addr, amount, timestamp);
        Transaction {
            id, tx_type: TxType::StorageReward,
            from: "CODEWING_NETWORK".to_string(),
            to: node_addr,
            amount,
            file_cid: None, file_size: None, file_name: None,
            timestamp, signature: "network".to_string(),
            fee: 0, memo: Some("Storage node reward".to_string()),
        }
    }

    pub fn new_faucet(to: String) -> Self {
        let timestamp = Utc::now().timestamp();
        let amount    = 100 * 1_000_000; // 100 CWC
        let id        = Self::gen_id("FAUCET", &to, amount, timestamp);
        Transaction {
            id, tx_type: TxType::Faucet,
            from: "CODEWING_FAUCET".to_string(),
            to, amount,
            file_cid: None, file_size: None, file_name: None,
            timestamp, signature: "faucet".to_string(),
            fee: 0, memo: Some("Faucet drip — testnet only".to_string()),
        }
    }

    pub fn hash(&self) -> String {
        let data = format!(
            "{}{}{}{}{}{}",
            self.id, self.from, self.to, self.amount,
            self.timestamp,
            self.file_cid.as_deref().unwrap_or("")
        );
        let mut h = Sha256::new();
        h.update(data.as_bytes());
        hex::encode(h.finalize())
    }

    pub fn total_cost(&self) -> u64 {
        self.amount + self.fee
    }

    fn gen_id(from: &str, to: &str, amount: u64, ts: i64) -> String {
        let data = format!("{}{}{}{}", from, to, amount, ts);
        let mut h = Sha256::new();
        h.update(data.as_bytes());
        hex::encode(h.finalize())
    }
}