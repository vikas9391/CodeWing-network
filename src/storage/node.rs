use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use crate::storage::chunker::Chunk;

#[derive(Debug, Serialize, Deserialize)]
pub struct StorageNode {
    pub id: String,
    pub address: String,
    pub capacity_bytes: u64,
    pub used_bytes: u64,
    pub chunks: HashMap<String, Chunk>, // chunk CID -> Chunk
    pub reputation: u64,
}

impl StorageNode {
    pub fn new(id: String, address: String, capacity_bytes: u64) -> Self {
        StorageNode {
            id,
            address,
            capacity_bytes,
            used_bytes: 0,
            chunks: HashMap::new(),
            reputation: 100,
        }
    }

    pub fn store_chunk(&mut self, chunk: Chunk) -> bool {
        let size = chunk.size as u64;
        if self.used_bytes + size > self.capacity_bytes {
            return false;
        }
        self.used_bytes += size;
        self.chunks.insert(chunk.cid.clone(), chunk);
        true
    }

    pub fn retrieve_chunk(&self, cid: &str) -> Option<&Chunk> {
        self.chunks.get(cid)
    }

    pub fn available_bytes(&self) -> u64 {
        self.capacity_bytes - self.used_bytes
    }
}