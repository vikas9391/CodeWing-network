#![allow(dead_code)]

use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::Utc;
use tracing::info;

pub const REPLICATION_FACTOR: usize = 3;

/// A node that has announced itself to the network
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageNodeInfo {
    pub node_id:        String, // blake3 hash of peer_id → used for XOR distance
    pub peer_id:        String, // libp2p PeerId string
    pub api_addr:       String, // "http://192.168.x.x:3000"
    pub capacity_bytes: u64,
    pub used_bytes:     u64,
    pub reputation:     u64,    // 0-100, drops on failed proofs
    pub last_seen:      i64,    // unix timestamp
    pub version:        String,
}

impl StorageNodeInfo {
    pub fn available_bytes(&self) -> u64 {
        self.capacity_bytes.saturating_sub(self.used_bytes)
    }

    pub fn is_healthy(&self) -> bool {
        let age = Utc::now().timestamp() - self.last_seen;
        age < 120 && self.reputation >= 20 // seen in last 2 min, decent rep
    }

    /// XOR distance between this node_id and a chunk CID (Kademlia-style)
    /// Both are hex strings — we XOR the first 8 bytes
    pub fn xor_distance(&self, cid: &str) -> u64 {
        let node_bytes = hex_to_u64(&self.node_id);
        let cid_bytes  = hex_to_u64(cid);
        node_bytes ^ cid_bytes
    }
}

fn hex_to_u64(s: &str) -> u64 {
    // Take first 16 hex chars (8 bytes) of any CID/node_id
    let clean = s.trim_start_matches("CW"); // strip CW prefix if present
    let slice  = &clean[..clean.len().min(16)];
    u64::from_str_radix(slice, 16).unwrap_or(0)
}

/// Where a specific chunk is stored (which nodes hold it)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChunkLocation {
    pub chunk_cid: String,
    pub node_ids:  Vec<String>, // node_ids that hold this chunk
}

/// Global registry of all known storage nodes + chunk locations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeRegistry {
    pub nodes:           HashMap<String, StorageNodeInfo>, // node_id → info
    pub chunk_map:       HashMap<String, ChunkLocation>,   // chunk_cid → locations
    pub replication:     usize,
}

impl NodeRegistry {
    pub fn new() -> Self {
        NodeRegistry {
            nodes:       HashMap::new(),
            chunk_map:   HashMap::new(),
            replication: REPLICATION_FACTOR,
        }
    }

    // ── Node management ───────────────────────────────────────────────────

    pub fn announce_node(&mut self, info: StorageNodeInfo) {
        info!("📣 Node announced: {} at {}", &info.node_id[..12], info.api_addr);
        self.nodes.insert(info.node_id.clone(), info);
    }

    pub fn update_heartbeat(&mut self, node_id: &str) {
        if let Some(node) = self.nodes.get_mut(node_id) {
            node.last_seen = Utc::now().timestamp();
        }
    }

    pub fn remove_node(&mut self, node_id: &str) {
        self.nodes.remove(node_id);
    }

    pub fn healthy_nodes(&self) -> Vec<&StorageNodeInfo> {
        let mut nodes: Vec<&StorageNodeInfo> = self.nodes.values()
            .filter(|n| n.is_healthy())
            .collect();
        nodes.sort_by(|a, b| b.available_bytes().cmp(&a.available_bytes()));
        nodes
    }

    pub fn node_count(&self) -> usize { self.nodes.len() }

    pub fn healthy_count(&self) -> usize { self.healthy_nodes().len() }

    // ── Kademlia-style routing ─────────────────────────────────────────────

    /// Pick the `replication` closest nodes to a chunk CID by XOR distance
    /// Falls back to load-balanced if fewer healthy nodes than replication factor
    pub fn select_nodes_for_chunk(&self, chunk_cid: &str) -> Vec<&StorageNodeInfo> {
        let mut healthy = self.healthy_nodes();

        if healthy.is_empty() {
            return vec![];
        }

        // Sort by XOR distance to chunk CID (Kademlia routing)
        healthy.sort_by_key(|n| n.xor_distance(chunk_cid));

        // Take up to replication_factor nodes, but also ensure they have space
        healthy.into_iter()
            .filter(|n| n.available_bytes() > 0)
            .take(self.replication)
            .collect()
    }

    // ── Chunk map ──────────────────────────────────────────────────────────

    pub fn register_chunk(&mut self, chunk_cid: String, node_ids: Vec<String>) {
        self.chunk_map.insert(chunk_cid.clone(), ChunkLocation {
            chunk_cid,
            node_ids,
        });
    }

    pub fn locate_chunk(&self, chunk_cid: &str) -> Option<&ChunkLocation> {
        self.chunk_map.get(chunk_cid)
    }

    pub fn chunks_on_node(&self, node_id: &str) -> Vec<&ChunkLocation> {
        self.chunk_map.values()
            .filter(|loc| loc.node_ids.contains(&node_id.to_string()))
            .collect()
    }

    // ── Stats ──────────────────────────────────────────────────────────────

    pub fn stats(&self) -> RegistryStats {
        let healthy = self.healthy_count();
        let total_capacity: u64 = self.nodes.values()
            .map(|n| n.capacity_bytes).sum();
        let total_used: u64 = self.nodes.values()
            .map(|n| n.used_bytes).sum();
        RegistryStats {
            total_nodes:    self.nodes.len(),
            healthy_nodes:  healthy,
            total_chunks:   self.chunk_map.len(),
            total_capacity,
            total_used,
            replication:    self.replication,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryStats {
    pub total_nodes:   usize,
    pub healthy_nodes: usize,
    pub total_chunks:  usize,
    pub total_capacity: u64,
    pub total_used:    u64,
    pub replication:   usize,
}