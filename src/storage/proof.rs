use sha2::{Digest, Sha256};

/// Proof of Storage challenge — verifies a node actually holds a chunk
pub struct StorageProof;

impl StorageProof {
    /// Generate a challenge for a specific chunk
    pub fn generate_challenge(chunk_cid: &str, block_hash: &str) -> String {
        let mut h = Sha256::new();
        h.update(format!("{}{}", chunk_cid, block_hash).as_bytes());
        hex::encode(h.finalize())
    }

    /// Node responds to challenge with proof
    pub fn respond(chunk_data: &[u8], challenge: &str) -> String {
        let mut h = Sha256::new();
        h.update(chunk_data);
        h.update(challenge.as_bytes());
        hex::encode(h.finalize())
    }

    /// Verify the response matches expected proof
    pub fn verify(chunk_data: &[u8], challenge: &str, response: &str) -> bool {
        Self::respond(chunk_data, challenge) == response
    }
}