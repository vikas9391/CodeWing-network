┌─────────────────────────────────────────────┐
│              Frontend (Web + App)            │
│         React/Next.js or Tauri (Rust)        │
└────────────────┬────────────────────────────┘
                 │ REST / WebSocket / gRPC
┌────────────────▼────────────────────────────┐
│              API Layer (Rust)                │
│         Axum / Actix-web server              │
└────────────────┬────────────────────────────┘
        ┌────────┴────────┐
        ▼                 ▼
┌───────────────┐  ┌──────────────────────────┐
│  Blockchain   │  │   Distributed Storage     │
│  Node (Rust)  │  │  (IPFS-like / chunks)     │
└───────────────┘  └──────────────────────────┘

codewing-network/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── cli.rs
│   ├── blockchain/
│   │   ├── mod.rs
│   │   ├── block.rs
│   │   ├── chain.rs
│   │   ├── transaction.rs
│   │   └── mempool.rs
│   ├── crypto/
│   │   ├── mod.rs
│   │   ├── wallet.rs
│   │   └── merkle.rs
│   ├── storage/
│   │   ├── mod.rs
│   │   ├── chunker.rs
│   │   ├── node.rs
│   │   └── proof.rs
│   ├── network/
│   │   ├── mod.rs
│   │   └── p2p.rs
│   └── api/
│       ├── mod.rs
│       └── routes.rs


# 1. Clone / create the project
cargo new codewing-network && cd codewing-network
# Copy all files above into src/

# 2. Run the node (API server)
cargo run --bin codewing-node

# 3. Use the CLI
cargo run --bin codewing-cli -- new-wallet
cargo run --bin codewing-cli -- stats
cargo run --bin codewing-cli -- mine CW1234...ADDRESS
cargo run --bin codewing-cli -- chunk-file ./myfile.pdf

# 4. Hit the API
curl http://localhost:3000/api/chain/stats
curl -X POST http://localhost:3000/api/wallet/new
curl -X POST http://localhost:3000/api/mine/CW_YOUR_ADDRESS


test :

# Terminal 1 — Node A (port 3000)
$env:API_PORT="3000"
$env:P2P_PORT="4000"
cargo run --bin codewing-node
# Terminal 2 — Node B (port 3001)
$env:API_PORT="3001"
$env:P2P_PORT="4001"
$env:STORE_DIR="./store-b"
cargo run --bin codewing-node

# Announce Node B to Node A
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:3000/api/nodes/announce" `
  -ContentType "application/json" `
  -Body '{
    "node_id": "ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12",
    "peer_id": "peer_nodeB",
    "api_addr": "http://localhost:3001",
    "capacity_bytes": 10737418240,
    "used_bytes": 0,
    "reputation": 100,
    "last_seen": 0,
    "version": "0.4.0"
  }'

# Now upload a file — it distributes across both nodes!
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:3000/api/storage/upload" `
  -Form @{
      file = Get-Item "./test.txt"
      owner = "CWtest"
  }