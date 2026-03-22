use sha2::{Digest, Sha256};

pub fn compute_merkle_root(hashes: &[String]) -> String {
    if hashes.is_empty() {
        return "0".repeat(64);
    }
    let mut current = hashes.to_vec();
    while current.len() > 1 {
        if current.len() % 2 != 0 {
            current.push(current.last().unwrap().clone());
        }
        current = current.chunks(2).map(|pair| {
            let combined = format!("{}{}", pair[0], pair[1]);
            let mut h = Sha256::new();
            h.update(combined.as_bytes());
            hex::encode(h.finalize())
        }).collect();
    }
    current[0].clone()
}