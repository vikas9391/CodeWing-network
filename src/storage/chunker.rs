#![allow(dead_code)]

use anyhow::Result;
use aes_gcm::{Aes256Gcm, Key, Nonce, KeyInit};
use aes_gcm::aead::Aead;
use rand::RngCore;
use serde::{Deserialize, Serialize};

pub const CHUNK_SIZE: usize = 1024 * 1024; // 1MB

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub index:    usize,
    pub cid:      String,   // blake3 hash of encrypted data
    pub file_cid: String,   // parent file CID
    pub data:     Vec<u8>,  // encrypted bytes
    pub nonce:    Vec<u8>,  // 12-byte AES nonce
    pub size:     usize,    // original (pre-encryption) size
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileManifest {
    pub cid:         String,
    pub name:        String,
    pub size:        u64,
    pub chunk_cids:  Vec<String>,
    pub chunk_count: usize,
    pub mime_type:   String,
    pub encrypted:   bool,
}

pub struct Chunker;

impl Chunker {
    /// Split + encrypt a file. Returns (manifest, chunks, encryption_key_hex)
    pub fn chunk_and_encrypt(
        data:      &[u8],
        filename:  &str,
        mime_type: &str,
    ) -> Result<(FileManifest, Vec<Chunk>, String)> {
        // Random 256-bit key
        let mut key_bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key_bytes);
        let key    = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);

        // File CID = blake3 of raw data
        let file_cid = Self::compute_cid(data);

        let mut chunks     = Vec::new();
        let mut chunk_cids = Vec::new();

        for (i, raw_chunk) in data.chunks(CHUNK_SIZE).enumerate() {
            let mut nonce_bytes = [0u8; 12];
            rand::thread_rng().fill_bytes(&mut nonce_bytes);
            let nonce = Nonce::from_slice(&nonce_bytes);

            let encrypted = cipher
                .encrypt(nonce, raw_chunk)
                .map_err(|e| anyhow::anyhow!("Encryption failed: {:?}", e))?;

            let chunk_cid = Self::compute_cid(&encrypted);
            chunk_cids.push(chunk_cid.clone());

            chunks.push(Chunk {
                index:    i,
                cid:      chunk_cid,
                file_cid: file_cid.clone(),
                data:     encrypted,
                nonce:    nonce_bytes.to_vec(),
                size:     raw_chunk.len(),
            });
        }

        let manifest = FileManifest {
            cid:         file_cid,
            name:        filename.to_string(),
            size:        data.len() as u64,
            chunk_cids,
            chunk_count: chunks.len(),
            mime_type:   mime_type.to_string(),
            encrypted:   true,
        };

        Ok((manifest, chunks, hex::encode(key_bytes)))
    }

    /// Decrypt + reassemble chunks back into original bytes
    pub fn decrypt_and_reassemble(
        chunks:         &[Chunk],
        encryption_key: &str,
    ) -> Result<Vec<u8>> {
        let key_bytes = hex::decode(encryption_key)
            .map_err(|_| anyhow::anyhow!("Invalid key hex"))?;
        let key    = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);

        let mut sorted = chunks.to_vec();
        sorted.sort_by_key(|c| c.index);

        let mut result = Vec::new();
        for chunk in &sorted {
            let nonce     = Nonce::from_slice(&chunk.nonce);
            let decrypted = cipher
                .decrypt(nonce, chunk.data.as_ref())
                .map_err(|e| anyhow::anyhow!("Decryption failed: {:?}", e))?;
            result.extend_from_slice(&decrypted);
        }
        Ok(result)
    }

    pub fn compute_cid(data: &[u8]) -> String {
        format!("CW{}", hex::encode(blake3::hash(data).as_bytes()))
    }
}