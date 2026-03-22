#![allow(dead_code)]

use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::collections::HashMap;
use tokio::fs;
use tracing::info;

use crate::storage::chunker::{Chunk, Chunker, FileManifest};

/// Stored file record (saved alongside chunks)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredFile {
    pub manifest:       FileManifest,
    pub owner:          String,
    pub encryption_key: String,   // hex — in prod, encrypt this with owner's pubkey
    pub stored_at:      i64,
    pub node_id:        String,   // which node holds it (Phase 4: multiple nodes)
}

/// Local chunk storage — Phase 4 will swap this for distributed storage
pub struct LocalStore {
    pub base_dir: PathBuf,
}

impl LocalStore {
    pub async fn new(base_dir: impl AsRef<Path>) -> Result<Self> {
        let base_dir = base_dir.as_ref().to_path_buf();
        fs::create_dir_all(&base_dir).await?;
        fs::create_dir_all(base_dir.join("chunks")).await?;
        fs::create_dir_all(base_dir.join("manifests")).await?;
        info!("📦 LocalStore initialized at {:?}", base_dir);
        Ok(LocalStore { base_dir })
    }

    // ── Write ───────────────────────────────────────────────────────────────

    /// Store all chunks for a file to disk
    pub async fn store_chunks(&self, chunks: &[Chunk]) -> Result<()> {
        for chunk in chunks {
            let path = self.chunk_path(&chunk.cid);
            let data = serde_json::to_vec(chunk)
                .map_err(|e| anyhow!("Encode error: {}", e))?;
            fs::write(&path, data).await?;
        }
        Ok(())
    }

    /// Save a file manifest + metadata
    pub async fn store_manifest(&self, stored: &StoredFile) -> Result<()> {
        let path = self.manifest_path(&stored.manifest.cid);
        let json = serde_json::to_string_pretty(stored)?;
        fs::write(path, json).await?;
        Ok(())
    }

    // ── Read ────────────────────────────────────────────────────────────────

    /// Load a single chunk by CID
    pub async fn load_chunk(&self, cid: &str) -> Result<Chunk> {
        let path = self.chunk_path(cid);
        let data = fs::read(&path).await
            .map_err(|_| anyhow!("Chunk not found: {}", cid))?;
        let chunk = serde_json::from_slice::<Chunk>(&data)
        .map_err(|e| anyhow!("Decode error: {}", e))?;
        Ok(chunk)
    }

    /// Load all chunks for a file CID
    pub async fn load_all_chunks(&self, manifest: &FileManifest) -> Result<Vec<Chunk>> {
        let mut chunks = Vec::new();
        for cid in &manifest.chunk_cids {
            chunks.push(self.load_chunk(cid).await?);
        }
        Ok(chunks)
    }

    /// Load a file manifest by CID
    pub async fn load_manifest(&self, file_cid: &str) -> Result<StoredFile> {
        let path = self.manifest_path(file_cid);
        let json = fs::read_to_string(&path).await
            .map_err(|_| anyhow!("File not found: {}", file_cid))?;
        Ok(serde_json::from_str(&json)?)
    }

    /// List all stored files (manifests)
    pub async fn list_files(&self) -> Result<Vec<StoredFile>> {
        let mut files = Vec::new();
        let manifests_dir = self.base_dir.join("manifests");
        let mut entries = fs::read_dir(&manifests_dir).await?;
        while let Some(entry) = entries.next_entry().await? {
            if let Ok(json) = fs::read_to_string(entry.path()).await {
                if let Ok(stored) = serde_json::from_str::<StoredFile>(&json) {
                    files.push(stored);
                }
            }
        }
        files.sort_by(|a, b| b.stored_at.cmp(&a.stored_at));
        Ok(files)
    }

    /// List files for a specific owner
    pub async fn list_files_for(&self, owner: &str) -> Result<Vec<StoredFile>> {
        let all = self.list_files().await?;
        Ok(all.into_iter().filter(|f| f.owner == owner).collect())
    }

    // ── Delete ──────────────────────────────────────────────────────────────

    pub async fn delete_file(&self, file_cid: &str) -> Result<()> {
        let stored = self.load_manifest(file_cid).await?;
        // Delete each chunk
        for cid in &stored.manifest.chunk_cids {
            let path = self.chunk_path(cid);
            let _ = fs::remove_file(path).await;
        }
        // Delete manifest
        let _ = fs::remove_file(self.manifest_path(file_cid)).await;
        info!("🗑️  Deleted file {}", file_cid);
        Ok(())
    }

    // ── Stats ───────────────────────────────────────────────────────────────

    pub async fn storage_stats(&self) -> Result<StorageStats> {
        let files = self.list_files().await?;
        let total_size: u64 = files.iter().map(|f| f.manifest.size).sum();
        let chunks_dir = self.base_dir.join("chunks");
        let mut chunk_count = 0u64;
        let mut entries = fs::read_dir(&chunks_dir).await?;
        while entries.next_entry().await?.is_some() {
            chunk_count += 1;
        }
        Ok(StorageStats {
            total_files: files.len(),
            total_chunks: chunk_count,
            total_size_bytes: total_size,
            store_path: self.base_dir.to_string_lossy().to_string(),
        })
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    fn chunk_path(&self, cid: &str) -> PathBuf {
        self.base_dir.join("chunks").join(cid)
    }

    fn manifest_path(&self, cid: &str) -> PathBuf {
        self.base_dir.join("manifests").join(format!("{}.json", cid))
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct StorageStats {
    pub total_files:       usize,
    pub total_chunks:      u64,
    pub total_size_bytes:  u64,
    pub store_path:        String,
}