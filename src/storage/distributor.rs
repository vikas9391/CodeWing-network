#![allow(dead_code)]

use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};

use crate::storage::{
    chunker::{Chunk, FileManifest, Chunker},
    registry::{NodeRegistry, StorageNodeInfo},
    store::{LocalStore, StoredFile},
};

pub type RegistryState = Arc<RwLock<NodeRegistry>>;

/// Result of distributing a file across nodes
#[derive(Debug, Serialize, Deserialize)]
pub struct DistributeResult {
    pub file_cid:        String,
    pub total_chunks:    usize,
    pub distributed:     usize,  // chunks sent to remote nodes
    pub local_fallback:  usize,  // chunks stored locally (no remote node)
    pub node_assignments: Vec<ChunkAssignment>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ChunkAssignment {
    pub chunk_cid: String,
    pub node_ids:  Vec<String>,
    pub stored_at: Vec<String>, // api_addr of nodes that confirmed storage
}

/// Distribute chunks across the network using Kademlia-style routing
pub async fn distribute_file(
    manifest:  &FileManifest,
    chunks:    &[Chunk],
    registry:  &RegistryState,
    local:     &LocalStore,
) -> Result<DistributeResult> {
    let reg = registry.read().await;
    let healthy = reg.healthy_count();

    info!("🌐 Distributing {} chunks | healthy nodes: {}", chunks.len(), healthy);

    let mut assignments     = Vec::new();
    let mut distributed     = 0usize;
    let mut local_fallback  = 0usize;

    for chunk in chunks {
        let target_nodes = reg.select_nodes_for_chunk(&chunk.cid);

        if target_nodes.is_empty() {
            // No remote nodes — store locally as fallback
            local.store_chunks(&[chunk.clone()]).await?;
            local_fallback += 1;
            assignments.push(ChunkAssignment {
                chunk_cid: chunk.cid.clone(),
                node_ids:  vec!["local".to_string()],
                stored_at: vec!["local".to_string()],
            });
            continue;
        }

        let mut stored_at = Vec::new();
        let mut node_ids  = Vec::new();

        for node in &target_nodes {
            match push_chunk_to_node(chunk, node).await {
                Ok(_) => {
                    info!("  ✅ Chunk {} → {}", &chunk.cid[..12], &node.api_addr);
                    stored_at.push(node.api_addr.clone());
                    node_ids.push(node.node_id.clone());
                }
                Err(e) => {
                    warn!("  ⚠️  Failed to push to {}: {} — using local", node.api_addr, e);
                    local.store_chunks(&[chunk.clone()]).await?;
                    stored_at.push("local".to_string());
                    node_ids.push("local".to_string());
                }
            }
        }

        distributed += 1;
        assignments.push(ChunkAssignment {
            chunk_cid: chunk.cid.clone(),
            node_ids,
            stored_at,
        });
    }

    // Register chunk locations in the registry
    drop(reg);
    let mut reg = registry.write().await;
    for assignment in &assignments {
        reg.register_chunk(
            assignment.chunk_cid.clone(),
            assignment.node_ids.clone(),
        );
    }

    info!("✅ Distribution complete: {}/{} remote, {} local fallback",
        distributed, chunks.len(), local_fallback);

    Ok(DistributeResult {
        file_cid:         manifest.cid.clone(),
        total_chunks:     chunks.len(),
        distributed,
        local_fallback,
        node_assignments: assignments,
    })
}

/// Fetch all chunks for a file — from remote nodes or local fallback
pub async fn fetch_file_chunks(
    manifest: &FileManifest,
    registry: &RegistryState,
    local:    &LocalStore,
) -> Result<Vec<Chunk>> {
    let reg = registry.read().await;
    let mut chunks = Vec::new();

    for chunk_cid in &manifest.chunk_cids {
        // Check registry for chunk location
        let chunk = match reg.locate_chunk(chunk_cid) {
            Some(loc) => {
                // Try each node that holds this chunk
                let mut fetched = None;
                for node_id in &loc.node_ids {
                    if node_id == "local" {
                        // Load from local store
                        if let Ok(c) = local.load_chunk(chunk_cid).await {
                            fetched = Some(c);
                            break;
                        }
                    } else if let Some(node) = reg.nodes.get(node_id) {
                        if let Ok(c) = fetch_chunk_from_node(chunk_cid, node).await {
                            fetched = Some(c);
                            break;
                        }
                    }
                }
                fetched.ok_or_else(|| anyhow!("Chunk unavailable: {}", chunk_cid))?
            }
            None => {
                // Not in registry — try local store directly
                local.load_chunk(chunk_cid).await
                    .map_err(|_| anyhow!("Chunk not found: {}", chunk_cid))?
            }
        };
        chunks.push(chunk);
    }

    Ok(chunks)
}

// ── HTTP chunk transfer ────────────────────────────────────────────────────────

/// Push a chunk to a remote storage node via HTTP
async fn push_chunk_to_node(
    chunk: &Chunk,
    node:  &StorageNodeInfo,
) -> Result<()> {
    let url    = format!("{}/internal/chunk/store", node.api_addr);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    let resp = client
        .post(&url)
        .json(chunk)
        .send()
        .await?;

    if resp.status().is_success() {
        Ok(())
    } else {
        Err(anyhow!("Node returned {}", resp.status()))
    }
}

/// Fetch a chunk from a remote storage node via HTTP
async fn fetch_chunk_from_node(
    chunk_cid: &str,
    node:      &StorageNodeInfo,
) -> Result<Chunk> {
    let url    = format!("{}/internal/chunk/{}", node.api_addr, chunk_cid);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()?;

    let resp = client.get(&url).send().await?;

    if resp.status().is_success() {
        let chunk = resp.json::<Chunk>().await?;
        Ok(chunk)
    } else {
        Err(anyhow!("Node returned {}", resp.status()))
    }
}