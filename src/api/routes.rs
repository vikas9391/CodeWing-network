#![allow(dead_code, unused_imports)]
use tower_http::cors::{CorsLayer, Any};
use axum::http::Method;

use axum::{
    extract::{Path, State, WebSocketUpgrade, Multipart},
    extract::ws::{Message, WebSocket},
    response::{Json, IntoResponse},
    routing::{get, post, delete},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};
use futures::{sink::SinkExt, stream::StreamExt};

use crate::blockchain::{chain::Blockchain, transaction::Transaction};
use crate::crypto::wallet::Wallet;
use crate::network::p2p::{P2PCommand, NetworkMessage};

// ─── Fee constants (in micro-CWC, 1 CWC = 1_000_000) ────────────────────────
/// Fee charged to miner per block mined. Kept low so net reward is always positive.
const MINING_FEE: u64        = 5_000_000;   // 5 CWC
const MINING_FEE_ADDR: &str  = "CW_PROTOCOL_TREASURY";

// ─── Safe string slice helper ─────────────────────────────────────────────────
fn short(s: &str) -> &str {
    &s[..s.len().min(16)]
}

// ─── Shared app state ─────────────────────────────────────────────────────────

pub struct AppData {
    pub blockchain:  Blockchain,
    pub p2p_cmd_tx:  Option<mpsc::Sender<P2PCommand>>,
    pub peer_id:     Option<String>,
    pub peer_count:  usize,
    pub node_port:   u16,
}

pub type AppState = Arc<RwLock<AppData>>;

// ─── Router ───────────────────────────────────────────────────────────────────

pub fn create_router(state: AppState) -> Router {
    Router::new()
        // Chain
        .route("/api/chain/stats",   get(get_stats))
        .route("/api/chain/blocks",  get(get_blocks))
        .route("/api/chain/valid",   get(validate_chain))

        // Wallet
        .route("/api/wallet/new",                  post(create_wallet))
        .route("/api/wallet/:address/balance",     get(get_balance))
        .route("/api/wallet/:address/files",       get(get_files))
        .route("/api/wallet/:address/history",     get(get_tx_history))
        .route("/api/wallet/:address/full",        get(get_wallet_full))
        .route("/api/wallet/import",               post(import_wallet))
        .route("/api/wallet/export/:address",      get(export_wallet_info))

        // Transactions
        .route("/api/tx/send",       post(send_payment))
        .route("/api/tx/store-file", post(store_file_tx))
        .route("/api/tx/pending",    get(get_pending_txs))
        .route("/api/tx/history",    get(get_all_history))

        // Mining — charges MINING_FEE from miner's balance
        .route("/api/mine/:address", post(mine_block))

        // Economy
        .route("/api/economy/fees",               get(get_fee_schedule))
        .route("/api/economy/invoice",            post(get_invoice))
        .route("/api/economy/leaderboard",        get(get_leaderboard))
        .route("/api/faucet/:address",            post(faucet_drip))

        // Storage — only cost-check lives here; all other storage routes are
        // registered by storage_router() in storage.rs to avoid duplicate panics.
        .route("/api/storage/check-cost",         post(check_upload_cost))

        // Network
        .route("/api/network/peers",              get(get_peers))
        .route("/api/network/connect",            post(connect_peer))
        .route("/api/network/info",               get(get_node_info))
        .route("/api/network/broadcast-block",    post(broadcast_block_api))

        // WebSocket
        .route("/ws",                             get(ws_handler))

        .with_state(state)
}

// ─── Chain endpoints ──────────────────────────────────────────────────────────

async fn get_stats(State(state): State<AppState>) -> Json<serde_json::Value> {
    let data  = state.read().await;
    let stats = data.blockchain.get_stats();
    Json(serde_json::json!({
        "chain_height":          stats.height,
        "difficulty":            stats.difficulty,
        "total_transactions":    stats.total_transactions,
        "total_files":           stats.total_files,
        "total_storage_bytes":   stats.total_storage_bytes,
        "pending_transactions":  stats.pending_transactions,
        "total_supply":          stats.total_supply,
        "peer_count":            data.peer_count,
        "node_peer_id":          data.peer_id,
    }))
}

async fn get_blocks(State(state): State<AppState>) -> Json<serde_json::Value> {
    let data = state.read().await;
    let blocks: Vec<serde_json::Value> = data.blockchain.chain.iter().rev().take(20)
        .map(|b| serde_json::json!({
            "index":       b.index,
            "hash":        short(&b.hash),
            "full_hash":   b.hash,
            "prev_hash":   short(&b.prev_hash),
            "miner":       b.miner,
            "tx_count":    b.transactions.len(),
            "timestamp":   b.timestamp,
            "nonce":       b.nonce,
            "difficulty":  b.difficulty,
            "reward":      b.reward,
        }))
        .collect();
    Json(serde_json::json!({ "blocks": blocks, "total": data.blockchain.chain.len() }))
}

async fn validate_chain(State(state): State<AppState>) -> Json<serde_json::Value> {
    let data = state.read().await;
    Json(serde_json::json!({ "valid": data.blockchain.is_valid(), "height": data.blockchain.chain.len() }))
}

// ─── Wallet endpoints ─────────────────────────────────────────────────────────

async fn create_wallet() -> Json<serde_json::Value> {
    let wallet = Wallet::new();
    Json(serde_json::json!({
        "address":     wallet.address,
        "public_key":  wallet.public_key,
        "private_key": wallet.export_private_key(),
        "warning":     "Save your private key securely! It cannot be recovered."
    }))
}

async fn get_balance(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Json<serde_json::Value> {
    let data = state.read().await;
    let balance = data.blockchain.get_balance(&address);
    Json(serde_json::json!({
        "address":     address,
        "balance":     balance,
        "balance_cwc": balance as f64 / 1_000_000.0,
        "symbol":      "CWC"
    }))
}

async fn get_files(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Json<serde_json::Value> {
    let data  = state.read().await;
    let files = data.blockchain.get_files_for(&address);
    Json(serde_json::to_value(files).unwrap())
}

// ─── Transaction endpoints ────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PaymentReq { from: String, to: String, amount: u64 }

async fn send_payment(
    State(state): State<AppState>,
    Json(req): Json<PaymentReq>,
) -> Json<serde_json::Value> {
    let mut data = state.write().await;
    let tx = Transaction::new_payment(req.from, req.to, req.amount);
    let id = tx.id.clone();
    match data.blockchain.add_transaction(tx) {
        Ok(_) => Json(serde_json::json!({ "success": true, "tx_id": id })),
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

#[derive(Deserialize)]
struct StoreFileReq {
    owner: String, file_cid: String,
    file_name: String, file_size: u64, price: u64,
}

async fn store_file_tx(
    State(state): State<AppState>,
    Json(req): Json<StoreFileReq>,
) -> Json<serde_json::Value> {
    let mut data = state.write().await;
    let tx = Transaction::new_store_file(
        req.owner, req.file_cid, req.file_name, req.file_size, req.price,
    );
    let id = tx.id.clone();
    match data.blockchain.add_transaction(tx) {
        Ok(_) => Json(serde_json::json!({ "success": true, "tx_id": id })),
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

async fn get_pending_txs(State(state): State<AppState>) -> Json<serde_json::Value> {
    let data = state.read().await;
    let txs: Vec<serde_json::Value> = data.blockchain.pending_transactions.iter()
        .map(|tx| serde_json::json!({
            "id":        short(&tx.id),
            "type":      format!("{:?}", tx.tx_type),
            "from":      tx.from,
            "to":        tx.to,
            "amount":    tx.amount,
            "fee":       tx.fee,
            "timestamp": tx.timestamp,
        }))
        .collect();
    let count = txs.len();
    Json(serde_json::json!({ "pending": txs, "count": count }))
}

// ─── Mining endpoint — CHARGES MINING_FEE ────────────────────────────────────
//
// Rules:
//   • Always mine regardless of balance (graceful for new users)
//   • If miner has enough balance: deduct MINING_FEE as a Payment tx to treasury
//     before mining. Net reward = block_reward - fee.
//   • If miner has 0 / insufficient balance: mine anyway, skip fee deduction.
//   • Response includes fee_charged, net_reward fields for UI display.

async fn mine_block(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Json<serde_json::Value> {
    let mut data        = state.write().await;
    let balance_before  = data.blockchain.get_balance(&address);
    let fee             = MINING_FEE;
    let has_funds       = balance_before >= fee;

    // Deduct mining fee BEFORE mining if miner has sufficient funds
    let _fee_tx_id = if has_funds {
        let fee_tx = Transaction::new_payment(
            address.clone(),
            MINING_FEE_ADDR.to_string(),
            fee,
        );
        let fee_id = fee_tx.id.clone();
        let _ = data.blockchain.add_transaction(fee_tx);
        Some(fee_id)
    } else {
        None
    };

    match data.blockchain.mine_pending_transactions(address.clone()) {
        Ok(block) => {
            // Broadcast to peers
            if let Some(tx) = &data.p2p_cmd_tx {
                if let Ok(json) = serde_json::to_string(&block) {
                    let _ = tx.try_send(P2PCommand::Broadcast(
                        NetworkMessage::NewBlock(json)
                    ));
                }
            }

            let gross_reward    = block.reward;
            let fee_charged     = if has_funds { fee } else { 0 };
            let net_reward      = gross_reward.saturating_sub(fee_charged);
            let balance_after   = data.blockchain.get_balance(&address);

            Json(serde_json::json!({
                "success":        true,
                "block_index":    block.index,
                "hash":           block.hash,
                "transactions":   block.transactions.len(),
                "gross_reward":   gross_reward,
                "fee_charged":    fee_charged,
                "net_reward":     net_reward,
                "fee_waived":     !has_funds,
                "balance_before": balance_before,
                "balance_after":  balance_after,
                "miner":          address,
            }))
        }
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

// ─── Storage — cost preview only (no side effects) ───────────────────────────
//
// NOTE: /api/storage/upload, /api/storage/files, /api/storage/files/:owner,
//       /api/storage/info/:cid, /api/storage/stats, /api/storage/delete/:cid
//       are ALL handled by storage_router() in storage.rs.
//       Do NOT re-register them here — axum panics on overlapping method routes.

#[derive(Deserialize)]
struct CheckCostReq {
    owner:      String,
    file_name:  String,
    size_bytes: u64,
    days:       Option<u64>,
}

async fn check_upload_cost(
    State(state): State<AppState>,
    Json(req): Json<CheckCostReq>,
) -> Json<serde_json::Value> {
    let data     = state.read().await;
    let days     = req.days.unwrap_or(30);
    let invoice  = crate::blockchain::economy::StorageInvoice::calculate(
        &req.file_name, req.size_bytes, days,
    );
    let balance  = data.blockchain.get_balance(&req.owner);
    let can_afford = balance >= invoice.total_cost;

    Json(serde_json::json!({
        "invoice":       invoice,
        "balance":       balance,
        "balance_cwc":   balance as f64 / 1_000_000.0,
        "total_cost":    invoice.total_cost,
        "can_afford":    can_afford,
        "shortfall":     if can_afford { 0u64 } else { invoice.total_cost - balance },
        "shortfall_cwc": if can_afford { 0.0 } else { (invoice.total_cost - balance) as f64 / 1_000_000.0 },
    }))
}

// ─── Network / P2P endpoints ──────────────────────────────────────────────────

async fn get_peers(State(state): State<AppState>) -> Json<serde_json::Value> {
    let data = state.read().await;
    Json(serde_json::json!({
        "peer_id":    data.peer_id,
        "peer_count": data.peer_count,
        "node_port":  data.node_port,
    }))
}

#[derive(Deserialize)]
struct ConnectReq { address: String }

async fn connect_peer(
    State(state): State<AppState>,
    Json(req): Json<ConnectReq>,
) -> Json<serde_json::Value> {
    let data = state.read().await;
    if let Some(tx) = &data.p2p_cmd_tx {
        match req.address.parse() {
            Ok(addr) => {
                let _ = tx.try_send(P2PCommand::Dial(addr));
                Json(serde_json::json!({ "success": true, "dialing": req.address }))
            }
            Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
        }
    } else {
        Json(serde_json::json!({ "success": false, "error": "P2P not running" }))
    }
}

async fn get_node_info(State(state): State<AppState>) -> Json<serde_json::Value> {
    let data  = state.read().await;
    let stats = data.blockchain.get_stats();
    Json(serde_json::json!({
        "name":         "CodeWing Network",
        "version":      "0.4.0",
        "peer_id":      data.peer_id,
        "chain_height": stats.height,
        "difficulty":   stats.difficulty,
        "p2p_port":     data.node_port,
        "api_port":     3000,
        "protocol":     "/codewing/1.0.0"
    }))
}

#[derive(Deserialize)]
struct BroadcastBlockReq { block_json: String }

async fn broadcast_block_api(
    State(state): State<AppState>,
    Json(req): Json<BroadcastBlockReq>,
) -> Json<serde_json::Value> {
    let data = state.read().await;
    if let Some(tx) = &data.p2p_cmd_tx {
        let _ = tx.try_send(P2PCommand::Broadcast(
            NetworkMessage::NewBlock(req.block_json)
        ));
        Json(serde_json::json!({ "success": true }))
    } else {
        Json(serde_json::json!({ "success": false, "error": "P2P not running" }))
    }
}

// ─── WebSocket live feed ──────────────────────────────────────────────────────

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| ws_connection(socket, state))
}

async fn ws_connection(mut socket: WebSocket, state: AppState) {
    {
        let data  = state.read().await;
        let stats = data.blockchain.get_stats();
        let msg   = serde_json::json!({
            "type":       "snapshot",
            "stats":      stats,
            "peer_id":    data.peer_id,
            "peer_count": data.peer_count,
        });
        let _ = socket.send(Message::Text(msg.to_string().into())).await;
    }

    let mut interval = tokio::time::interval(std::time::Duration::from_secs(3));
    loop {
        tokio::select! {
            _ = interval.tick() => {
                let data  = state.read().await;
                let stats = data.blockchain.get_stats();
                let msg   = serde_json::json!({
                    "type":       "stats_update",
                    "height":     stats.height,
                    "difficulty": stats.difficulty,
                    "pending":    stats.pending_transactions,
                    "peers":      data.peer_count,
                    "files":      stats.total_files,
                });
                if socket.send(Message::Text(msg.to_string().into())).await.is_err() {
                    break;
                }
            }
            Some(Ok(msg)) = socket.recv() => {
                match msg {
                    Message::Close(_) => break,
                    _ => {}
                }
            }
        }
    }
}

// ─── TX history ───────────────────────────────────────────────────────────────

async fn get_tx_history(
    State(state): State<AppState>,
    Path(address): Path<String>,
) -> Json<serde_json::Value> {
    let data = state.read().await;
    let txs: Vec<serde_json::Value> = data.blockchain
        .get_tx_history(&address, 50)
        .iter()
        .map(|tx| serde_json::json!({
            "tx_id":       short(&tx.tx_id),
            "type":        tx.tx_type,
            "from":        tx.from,
            "to":          tx.to,
            "amount":      tx.amount,
            "fee":         tx.fee,
            "timestamp":   tx.timestamp,
            "block_index": tx.block_index,
            "memo":        tx.memo,
        }))
        .collect();
    let count = txs.len();
    Json(serde_json::json!({ "address": address, "transactions": txs, "count": count }))
}

async fn get_all_history(State(state): State<AppState>) -> Json<serde_json::Value> {
    let data = state.read().await;
    let txs: Vec<serde_json::Value> = data.blockchain
        .get_all_tx_history(100)
        .iter()
        .map(|tx| serde_json::json!({
            "tx_id":       short(&tx.tx_id),
            "type":        tx.tx_type,
            "from":        tx.from,
            "to":          tx.to,
            "amount":      tx.amount,
            "fee":         tx.fee,
            "timestamp":   tx.timestamp,
            "block_index": tx.block_index,
            "memo":        tx.memo,
        }))
        .collect();
    let count = txs.len();
    Json(serde_json::json!({ "transactions": txs, "count": count }))
}

// ─── Economy endpoints ────────────────────────────────────────────────────────

async fn get_fee_schedule() -> Json<serde_json::Value> {
    let schedule = crate::blockchain::economy::FeeSchedule::current();
    let mut value = serde_json::to_value(schedule).unwrap();
    if let Some(obj) = value.as_object_mut() {
        obj.insert("mining_fee_cwc".into(),  serde_json::json!(MINING_FEE as f64 / 1_000_000.0));
        obj.insert("mining_fee".into(),       serde_json::json!(MINING_FEE));
        obj.insert("mining_treasury".into(),  serde_json::json!(MINING_FEE_ADDR));
    }
    Json(value)
}

#[derive(Deserialize)]
struct InvoiceReq {
    file_name:  String,
    size_bytes: u64,
    days:       Option<u64>,
}

async fn get_invoice(Json(req): Json<InvoiceReq>) -> Json<serde_json::Value> {
    let days    = req.days.unwrap_or(30);
    let invoice = crate::blockchain::economy::StorageInvoice::calculate(
        &req.file_name, req.size_bytes, days,
    );
    Json(serde_json::to_value(invoice).unwrap())
}

async fn get_leaderboard(State(state): State<AppState>) -> Json<serde_json::Value> {
    let data    = state.read().await;
    let entries = data.blockchain.leaderboard(20);
    let board: Vec<serde_json::Value> = entries.iter().enumerate().map(|(i, (addr, bal))| {
        serde_json::json!({
            "rank":        i + 1,
            "address":     addr,
            "balance":     bal,
            "balance_cwc": *bal as f64 / 1_000_000.0,
        })
    }).collect();
    Json(serde_json::json!({ "leaderboard": board }))
}

// ─── Faucet ───────────────────────────────────────────────────────────────────

async fn faucet_drip(
    State(state):  State<AppState>,
    Path(address): Path<String>,
) -> Json<serde_json::Value> {
    let mut data = state.write().await;

    let recent = data.blockchain.tx_history.iter().rev().take(50).any(|tx| {
        tx.tx_type == "Faucet" && tx.to == address
    });

    if recent {
        return Json(serde_json::json!({
            "success": false,
            "error":   "Already dripped recently. Mine a block first!"
        }));
    }

    let tx = crate::blockchain::transaction::Transaction::new_faucet(address.clone());
    let id = tx.id.clone();
    match data.blockchain.add_transaction(tx) {
        Ok(_) => Json(serde_json::json!({
            "success": true,
            "tx_id":   id,
            "amount":  "100 CWC",
            "address": address,
            "note":    "Mine a block to confirm your faucet tx!"
        })),
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

// ─── Wallet full info ─────────────────────────────────────────────────────────

async fn get_wallet_full(
    State(state):  State<AppState>,
    Path(address): Path<String>,
) -> Json<serde_json::Value> {
    let data    = state.read().await;
    let balance = data.blockchain.get_balance(&address);
    let files   = data.blockchain.get_files_for(&address);
    let history = data.blockchain.get_tx_history(&address, 20);
    let stats   = data.blockchain.get_stats();

    let history_json: Vec<serde_json::Value> = history.iter().map(|tx| serde_json::json!({
        "tx_id":       short(&tx.tx_id),
        "type":        tx.tx_type,
        "from":        tx.from,
        "to":          tx.to,
        "amount":      tx.amount,
        "fee":         tx.fee,
        "timestamp":   tx.timestamp,
        "block_index": tx.block_index,
        "memo":        tx.memo,
        "is_incoming": tx.to == address,
    })).collect();

    let files_json: Vec<serde_json::Value> = files.iter().map(|f| serde_json::json!({
        "cid":       f.cid,
        "name":      f.name,
        "size":      f.size,
        "timestamp": f.timestamp,
        "cost_paid": f.cost_paid,
    })).collect();

    let file_count = files_json.len();

    Json(serde_json::json!({
        "address":      address,
        "balance":      balance,
        "balance_cwc":  balance as f64 / 1_000_000.0,
        "files":        files_json,
        "file_count":   file_count,
        "history":      history_json,
        "chain_height": stats.height,
        "symbol":       "CWC",
    }))
}

// ─── Import / Export wallet ───────────────────────────────────────────────────

#[derive(Deserialize)]
struct ImportWalletReq { private_key: String }

async fn import_wallet(
    Json(req): Json<ImportWalletReq>,
) -> Json<serde_json::Value> {
    match crate::crypto::wallet::Wallet::from_private_key(&req.private_key) {
        Ok(wallet) => Json(serde_json::json!({
            "success":    true,
            "address":    wallet.address,
            "public_key": wallet.public_key,
        })),
        Err(e) => Json(serde_json::json!({
            "success": false,
            "error":   format!("Invalid private key: {}", e)
        })),
    }
}

async fn export_wallet_info(
    State(state):  State<AppState>,
    Path(address): Path<String>,
) -> Json<serde_json::Value> {
    let data        = state.read().await;
    let balance     = data.blockchain.get_balance(&address);
    let files       = data.blockchain.get_files_for(&address);
    let total_spent: u64 = files.iter().map(|f| f.cost_paid).sum();

    Json(serde_json::json!({
        "address":         address,
        "balance":         balance,
        "balance_cwc":     balance as f64 / 1_000_000.0,
        "total_files":     files.len(),
        "total_spent_cwc": total_spent as f64 / 1_000_000.0,
        "exported_at":     chrono::Utc::now().timestamp(),
        "network":         "CodeWing Mainnet",
        "symbol":          "CWC",
    }))
}