use anyhow::Result;
use ed25519_dalek::{SigningKey, VerifyingKey};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Serialize, Deserialize)]
pub struct Wallet {
    pub address: String,
    pub public_key: String,
    #[serde(skip_serializing)]
    private_key: Option<Vec<u8>>,
}

impl Wallet {
    pub fn new() -> Self {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key: VerifyingKey = signing_key.verifying_key();

        let pub_bytes = verifying_key.to_bytes();
        let public_key = hex::encode(pub_bytes);
        let address = Self::pub_key_to_address(&pub_bytes);

        Wallet {
            address,
            public_key,
            private_key: Some(signing_key.to_bytes().to_vec()),
        }
    }

    pub fn from_private_key(private_key_hex: &str) -> Result<Self> {
        let bytes = hex::decode(private_key_hex)?;
        let key_bytes: [u8; 32] = bytes.try_into().map_err(|_| anyhow::anyhow!("Invalid key"))?;
        let signing_key = SigningKey::from_bytes(&key_bytes);
        let verifying_key = signing_key.verifying_key();

        let pub_bytes = verifying_key.to_bytes();
        let public_key = hex::encode(pub_bytes);
        let address = Self::pub_key_to_address(&pub_bytes);

        Ok(Wallet {
            address,
            public_key,
            private_key: Some(key_bytes.to_vec()),
        })
    }

    pub fn export_private_key(&self) -> Option<String> {
        self.private_key.as_ref().map(hex::encode)
    }

    fn pub_key_to_address(pub_bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(pub_bytes);
        let hash = hasher.finalize();
        format!("CW{}", hex::encode(&hash[..20]).to_uppercase())
    }
}   