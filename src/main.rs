#![allow(dead_code, unused_imports, unused_variables)]

mod blockchain;
mod crypto;
mod storage;
mod network;
mod api;

use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;
use tower_http::cors::{CorsLayer, Any};

use crate::api::routes::{AppData, create_router};
use crate::api::storage_routes::{storage_router, StoreState, StorageCombined};
use crate::blockchain::chain::Blockchain;
use crate::network::p2p::{start_p2p_node, P2PEvent, NetworkMessage};
use crate::storage::store::LocalStore;
use crate::storage::registry::NodeRegistry;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("codewing=info".parse().unwrap())
                .add_directive("libp2p=warn".parse().unwrap()),
        )
        .init();

    println!(r#"
   ___          _     __      __ _
  / __|___   __| |___/ / __ __(_) |_  ___ ___
 | (__/ _ \ / _` / -_) \\/ / / || ' \/ -_|_-
  \___\___/ \__,_\___|\_/\__/|_||_||_\___/__/
  N E T W O R K  v0.4.0 — Distributed Blockchain Storage
    "#);

    let api_port: u16 = std::env::var("API_PORT")
        .unwrap_or_else(|_| "3000".into()).parse().unwrap_or(3000);
    let p2p_port: u16 = std::env::var("P2P_PORT")
        .unwrap_or_else(|_| "4000".into()).parse().unwrap_or(4000);
    let store_dir = std::env::var("STORE_DIR")
        .unwrap_or_else(|_| "./codewing-store".into());

    // ── Storage ───────────────────────────────────────────────────────────
    info!("💾 Initializing storage at {}", store_dir);
    let local_store  = LocalStore::new(&store_dir).await
        .expect("Failed to init storage");
    let store_state: StoreState = Arc::new(RwLock::new(local_store));

    // ── Node registry ─────────────────────────────────────────────────────
    let registry = Arc::new(RwLock::new(NodeRegistry::new()));

    // ── P2P ───────────────────────────────────────────────────────────────
    info!("🌐 Starting P2P node on port {}...", p2p_port);
    let p2p = match start_p2p_node(p2p_port).await {
        Ok(node) => { info!("✅ P2P node | PeerID: {}", node.local_peer_id); Some(node) }
        Err(e)   => { warn!("⚠️  P2P failed: {} — API-only mode", e); None }
    };

    // ── Blockchain ────────────────────────────────────────────────────────
    let blockchain = Blockchain::new();
    info!("🔗 Blockchain initialized | height: {}", blockchain.chain.len());

    let (peer_id, cmd_tx) = match &p2p {
        Some(n) => (Some(n.local_peer_id.to_string()), Some(n.command_tx.clone())),
        None    => (None, None),
    };

    let app_state = Arc::new(RwLock::new(AppData {
        blockchain,
        p2p_cmd_tx: cmd_tx,
        peer_id: peer_id.clone(),
        peer_count: 0,
        node_port: p2p_port,
    }));

    // ── P2P event loop ────────────────────────────────────────────────────
    if let Some(mut p2p_node) = p2p {
        let state_clone    = Arc::clone(&app_state);
        let registry_clone = Arc::clone(&registry);
        tokio::spawn(async move {
            while let Some(event) = p2p_node.event_rx.recv().await {
                match event {
                    P2PEvent::PeerConnected(_) => {
                        let mut d = state_clone.write().await;
                        d.peer_count += 1;
                        if let Some(tx) = &d.p2p_cmd_tx {
                            let _ = tx.try_send(
                                crate::network::p2p::P2PCommand::Broadcast(
                                    NetworkMessage::RequestChain,
                                ),
                            );
                        }
                    }
                    P2PEvent::PeerDisconnected(_) => {
                        let mut d = state_clone.write().await;
                        d.peer_count = d.peer_count.saturating_sub(1);
                    }
                    P2PEvent::MessageReceived { from, message } => {
                        let mut d = state_clone.write().await;
                        match message {
                            NetworkMessage::NewBlock(json) => {
                                if let Ok(block) = serde_json::from_str::<crate::blockchain::block::Block>(&json) {
                                    let expected = d.blockchain.latest_block().hash.clone();
                                    if block.prev_hash == expected && block.is_valid() {
                                        info!("📦 Accepted block #{} from {}", block.index, from);
                                        d.blockchain.chain.push(block);
                                    }
                                }
                            }
                            NetworkMessage::NewTransaction(json) => {
                                if let Ok(tx) = serde_json::from_str::<crate::blockchain::transaction::Transaction>(&json) {
                                    let _ = d.blockchain.add_transaction(tx);
                                }
                            }
                            NetworkMessage::RequestChain => {
                                if let Ok(j) = serde_json::to_string(&d.blockchain.chain) {
                                    if let Some(tx) = &d.p2p_cmd_tx {
                                        let _ = tx.try_send(
                                            crate::network::p2p::P2PCommand::Broadcast(
                                                NetworkMessage::SendChain(j),
                                            ),
                                        );
                                    }
                                }
                            }
                            NetworkMessage::SendChain(json) => {
                                if let Ok(their_chain) = serde_json::from_str::<Vec<crate::blockchain::block::Block>>(&json) {
                                    if their_chain.len() > d.blockchain.chain.len() {
                                        let valid = their_chain.windows(2).all(|p| {
                                            p[1].prev_hash == p[0].hash && p[1].is_valid()
                                        });
                                        if valid {
                                            info!("🔄 Chain sync: {} → {} blocks",
                                                d.blockchain.chain.len(), their_chain.len());
                                            d.blockchain.chain = their_chain;
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                    P2PEvent::Error(e) => warn!("P2P error: {}", e),
                }
            }
        });
    }

    // ── Heartbeat loop — ping all known nodes every 30s ───────────────────
    {
        let registry_clone = Arc::clone(&registry);
        tokio::spawn(async move {
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .unwrap();
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                let nodes: Vec<(String, String)> = {
                    let reg = registry_clone.read().await;
                    reg.nodes.values()
                        .map(|n| (n.node_id.clone(), n.api_addr.clone()))
                        .collect()
                };
                for (node_id, api_addr) in nodes {
                    let url = format!("{}/api/nodes/{}/heartbeat", api_addr, node_id);
                    let _ = client.post(&url).send().await;
                }
            }
        });
    }

    // ── Build combined router ─────────────────────────────────────────────
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let combined = StorageCombined {
        app:      Arc::clone(&app_state),
        store:    Arc::clone(&store_state),
        registry: Arc::clone(&registry),
    };

    let app = create_router(Arc::clone(&app_state))
        .merge(storage_router(combined))
        .layer(cors);

    let addr = format!("0.0.0.0:{}", api_port);

    println!("\n🚀 CodeWing Network Node v0.4.0");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("📡 API         → http://localhost:{}", api_port);
    println!("🌐 P2P         → port {}", p2p_port);
    println!("🔌 WebSocket   → ws://localhost:{}/ws", api_port);
    println!("💾 Storage     → {}", store_dir);
    println!("🗂️  Replication → 3 copies per file");
    if let Some(id) = &peer_id { println!("🪪  Peer ID     → {}", id); }
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("Node Registry:");
    println!("  POST /api/nodes/announce");
    println!("  GET  /api/nodes");
    println!("  GET  /api/nodes/stats");
    println!("  POST /api/nodes/:id/heartbeat");
    println!("Internal (node-to-node):");
    println!("  POST /internal/chunk/store");
    println!("  GET  /internal/chunk/:cid");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}