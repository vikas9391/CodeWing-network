#  CodeWing Network

A **decentralized blockchain + distributed storage system** built in Rust.
Combines **P2P networking, blockchain, and IPFS-like storage** with a modern frontend.

---

##  Architecture

```text
┌─────────────────────────────────────────────┐
│              Frontend (Web + App)           │
│         React / Next.js / Tauri (Rust)      │
└────────────────┬────────────────────────────┘
                 │ REST / WebSocket / gRPC
┌────────────────▼────────────────────────────┐
│              API Layer (Rust)               │
│         Axum / Actix-web server             │
└────────────────┬────────────────────────────┘
        ┌────────┴────────┐
        ▼                 ▼
┌───────────────┐  ┌──────────────────────────┐
│  Blockchain   │  │   Distributed Storage     │
│  Node (Rust)  │  │  (IPFS-like / chunks)     │
└───────────────┘  └──────────────────────────┘
```

---

##  Project Structure

```bash
codewing-network/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── cli.rs
│   ├── blockchain/
│   │   ├── block.rs
│   │   ├── chain.rs
│   │   ├── transaction.rs
│   │   └── mempool.rs
│   ├── crypto/
│   │   ├── wallet.rs
│   │   └── merkle.rs
│   ├── storage/
│   │   ├── chunker.rs
│   │   ├── node.rs
│   │   └── proof.rs
│   ├── network/
│   │   └── p2p.rs
│   └── api/
│       └── routes.rs
```

---

## Getting Started

### 1️ Clone the repository

```bash
git clone https://github.com/vikas9391/CodeWing-network.git
cd CodeWing-network
```

---

### 2️ Run the Node (API Server)

```bash
cargo run --bin codewing-node
```

---

### 3️ Use the CLI

```bash
# Create wallet
cargo run --bin codewing-cli -- new-wallet

# View stats
cargo run --bin codewing-cli -- stats

# Mine block
cargo run --bin codewing-cli -- mine CW1234...ADDRESS

# Upload & chunk file
cargo run --bin codewing-cli -- chunk-file ./myfile.pdf
```

---

### 4️ API Usage

```bash
# Get blockchain stats
curl http://localhost:3000/api/chain/stats

# Create wallet
curl -X POST http://localhost:3000/api/wallet/new

# Mine block
curl -X POST http://localhost:3000/api/mine/CW_YOUR_ADDRESS
```

---

##  Multi-Node Testing

### ▶ Start Node A

```bash
$env:API_PORT="3000"
$env:P2P_PORT="4000"
cargo run --bin codewing-node
```

---

### ▶ Start Node B

```bash
$env:API_PORT="3001"
$env:P2P_PORT="4001"
$env:STORE_DIR="./store-b"
cargo run --bin codewing-node
```

---

###  Connect Node B to Node A

```powershell
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
```

---

### Upload File (Distributed Across Nodes)

```powershell
Invoke-RestMethod -Method POST `
  -Uri "http://localhost:3000/api/storage/upload" `
  -Form @{
      file = Get-Item "./test.txt"
      owner = "CWtest"
  }
```

---

##  Features

*  Custom Blockchain (Rust)
*  P2P Networking (libp2p)
*  Distributed Storage (Chunk-based, IPFS-like)
*  Wallet + Cryptography (Merkle Trees)
*  Fast API (Axum / Actix)
*  CLI + Frontend support

---

##  Future Improvements

* Smart Contracts
* Token Economy
* Node Reputation System
* Web Dashboard Enhancements
* File Retrieval & Proof Verification

---

##  Contributing

Pull requests are welcome!
Feel free to fork and improve 

---

##  License

MIT License

---
