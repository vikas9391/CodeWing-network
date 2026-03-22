#![allow(dead_code, unused_imports)]

use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post},
    Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

use crate::api::routes::AppState;
use crate::blockchain::transaction::Transaction;
use crate::storage::{
    chunker::Chunker,
    store::{LocalStore, StoredFile},
    registry::{NodeRegistry, StorageNodeInfo},
    distributor::{distribute_file, fetch_file_chunks, RegistryState},
};

pub type StoreState = Arc<RwLock<LocalStore>>;

// ── Combined state for storage routes ─────────────────────────────────────────

#[derive(Clone)]
pub struct StorageCombined {
    pub app:      AppState,
    pub store:    StoreState,
    pub registry: RegistryState,
}

// ── Router ────────────────────────────────────────────────────────────────────
//
// NOTE: Routes registered here must NOT overlap with routes in create_router()
// (routes.rs). The following routes are owned exclusively by storage_router:
//
//   POST   /api/storage/upload
//   GET    /api/storage/download/:cid
//   GET    /api/storage/files
//   GET    /api/storage/files/:owner
//   DELETE /api/storage/delete/:cid
//   GET    /api/storage/info/:cid
//   GET    /api/storage/stats
//   POST   /api/nodes/announce
//   GET    /api/nodes
//   GET    /api/nodes/stats
//   POST   /api/nodes/:node_id/heartbeat
//   POST   /internal/chunk/store
//   GET    /internal/chunk/:cid

pub fn storage_router(combined: StorageCombined) -> Router {
    Router::new()
        // File operations
        .route("/api/storage/upload",           post(upload_file))
        .route("/api/storage/download/:cid",    get(download_file))
        .route("/api/storage/files",            get(list_all_files))
        .route("/api/storage/files/:owner",     get(list_owner_files))
        .route("/api/storage/delete/:cid",      delete(delete_file))
        .route("/api/storage/info/:cid",        get(file_info))
        .route("/api/storage/stats",            get(storage_stats))

        // Node registry
        .route("/api/nodes/announce",           post(announce_node))
        .route("/api/nodes",                    get(list_nodes))
        .route("/api/nodes/stats",              get(node_stats))
        .route("/api/nodes/:node_id/heartbeat", post(heartbeat))

        // Internal node-to-node chunk transfer
        .route("/internal/chunk/store",         post(internal_store_chunk))
        .route("/internal/chunk/:cid",          get(internal_get_chunk))

        .with_state(combined)
}

// ── Upload (with CWC balance check) ──────────────────────────────────────────
//
// Rules (matching the original upload_file_charged logic from routes.rs):
//   • Parse owner, file, and optional days from multipart.
//   • Calculate storage cost via StorageInvoice.
//   • If owner is a real wallet (not "anonymous") AND balance < cost → reject
//     with INSUFFICIENT_BALANCE error (HTTP 200 with success:false).
//   • If sufficient balance: create store_file tx to deduct CWC, chunk +
//     encrypt file, distribute to nodes, save manifest.
//   • Returns encryption_key — caller must save it; required for download.

async fn upload_file(
    State(s): State<StorageCombined>,
    mut multipart: Multipart,
) -> Json<serde_json::Value> {

    let mut file_data: Option<Vec<u8>> = None;
    let mut file_name  = "unnamed".to_string();
    let mut mime_type  = "application/octet-stream".to_string();
    let mut owner      = "anonymous".to_string();
    let mut days: u64  = 30;

    while let Ok(Some(field)) = multipart.next_field().await {
        match field.name() {
            Some("file") => {
                file_name = field.file_name().unwrap_or("unnamed").to_string();
                mime_type = field.content_type()
                    .unwrap_or("application/octet-stream").to_string();
                match field.bytes().await {
                    Ok(b) => file_data = Some(b.to_vec()),
                    Err(e) => return Json(serde_json::json!({
                        "success": false, "error": format!("Read error: {}", e)
                    })),
                }
            }
            Some("owner") => { if let Ok(v) = field.text().await { owner = v; } }
            Some("days")  => {
                if let Ok(v) = field.text().await {
                    days = v.parse().unwrap_or(30);
                }
            }
            _ => {}
        }
    }

    let data = match file_data {
        Some(d) if !d.is_empty() => d,
        _ => return Json(serde_json::json!({
            "success": false, "error": "No file data received"
        })),
    };

    let size_bytes = data.len() as u64;

    // ── Balance check ──────────────────────────────────────────────────────────
    let invoice    = crate::blockchain::economy::StorageInvoice::calculate(&file_name, size_bytes, days);
    let total_cost = invoice.total_cost;

    if owner != "anonymous" && !owner.is_empty() {
        let app_read = s.app.read().await;
        let balance  = app_read.blockchain.get_balance(&owner);
        drop(app_read);

        if balance < total_cost {
            let shortfall = total_cost - balance;
            return Json(serde_json::json!({
                "success":       false,
                "error":         "Insufficient CWC balance for storage",
                "balance":       balance,
                "balance_cwc":   balance as f64 / 1_000_000.0,
                "required":      total_cost,
                "required_cwc":  total_cost as f64 / 1_000_000.0,
                "shortfall":     shortfall,
                "shortfall_cwc": shortfall as f64 / 1_000_000.0,
                "code":          "INSUFFICIENT_BALANCE",
            }));
        }
    }

    info!("📤 Upload: {} ({} bytes) owner={} days={}", file_name, size_bytes, owner, days);

    // ── Chunk + encrypt ────────────────────────────────────────────────────────
    let (manifest, chunks, enc_key) =
        match Chunker::chunk_and_encrypt(&data, &file_name, &mime_type) {
            Ok(r)  => r,
            Err(e) => return Json(serde_json::json!({
                "success": false, "error": format!("Chunking failed: {}", e)
            })),
        };

    let store = s.store.read().await;

    // ── Distribute across nodes (with local fallback) ──────────────────────────
    let dist_result = distribute_file(&manifest, &chunks, &s.registry, &store).await;

    let (distributed, local_fallback) = match &dist_result {
        Ok(r)  => (r.distributed, r.local_fallback),
        Err(_) => {
            if let Err(e2) = store.store_chunks(&chunks).await {
                return Json(serde_json::json!({
                    "success": false,
                    "error": format!("Storage failed: {}", e2)
                }));
            }
            (0, chunks.len())
        }
    };

    // ── Save manifest ──────────────────────────────────────────────────────────
    let stored = StoredFile {
        manifest:       manifest.clone(),
        owner:          owner.clone(),
        encryption_key: enc_key.clone(),
        stored_at:      Utc::now().timestamp(),
        node_id:        "local".to_string(),
    };
    if let Err(e) = store.store_manifest(&stored).await {
        return Json(serde_json::json!({
            "success": false,
            "error": format!("Manifest save failed: {}", e)
        }));
    }

    // ── Record on blockchain (store_file tx charges CWC from owner) ────────────
    {
        let mut app = s.app.write().await;
        let tx = Transaction::new_store_file(
            owner.clone(),
            manifest.cid.clone(),
            file_name.clone(),
            manifest.size,
            total_cost,   // pass actual cost so it deducts from balance
        );
        let _ = app.blockchain.add_transaction(tx);
    }

    info!("✅ Stored {} → CID: {} | remote={} local={} | cost={} µCWC",
        file_name, &manifest.cid[..20.min(manifest.cid.len())],
        distributed, local_fallback, total_cost);

    Json(serde_json::json!({
        "success":        true,
        "cid":            manifest.cid,
        "name":           manifest.name,
        "size":           manifest.size,
        "chunks":         manifest.chunk_count,
        "mime_type":      manifest.mime_type,
        "encryption_key": enc_key,
        "owner":          owner,
        "distributed":    distributed,
        "local_fallback": local_fallback,
        "replication":    3,
        "cost_charged":   total_cost,
        "cost_cwc":       total_cost as f64 / 1_000_000.0,
        "storage_days":   days,
        "warning":        "Save your encryption key! Required to download.",
        "note":           "Storage charge added to mempool — mine a block to confirm",
    }))
}

// ── Download ──────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct DownloadQuery { key: String }

async fn download_file(
    State(s):  State<StorageCombined>,
    Path(cid): Path<String>,
    Query(q):  Query<DownloadQuery>,
) -> Response {
    let store = s.store.read().await;

    let stored = match store.load_manifest(&cid).await {
        Ok(m)  => m,
        Err(e) => return err_resp(StatusCode::NOT_FOUND,
            &format!("File not found: {}", e)),
    };

    let chunks = match fetch_file_chunks(&stored.manifest, &s.registry, &store).await {
        Ok(c)  => c,
        Err(e) => return err_resp(StatusCode::INTERNAL_SERVER_ERROR,
            &format!("Chunk fetch failed: {}", e)),
    };

    let data = match Chunker::decrypt_and_reassemble(&chunks, &q.key) {
        Ok(d)  => d,
        Err(_) => return err_resp(StatusCode::UNAUTHORIZED,
            "Decryption failed — wrong key?"),
    };

    info!("📥 Download: {} ({} bytes)", stored.manifest.name, data.len());

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE,        stored.manifest.mime_type.clone())
        .header(header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", stored.manifest.name))
        .header(header::CONTENT_LENGTH, data.len())
        .body(Body::from(data))
        .unwrap()
}

// ── File listing ──────────────────────────────────────────────────────────────

async fn list_all_files(State(s): State<StorageCombined>) -> Json<serde_json::Value> {
    let store = s.store.read().await;
    match store.list_files().await {
        Ok(files) => {
            let summary: Vec<_> = files.iter().map(file_summary).collect();
            let count = summary.len();
            Json(serde_json::json!({ "success": true, "files": summary, "count": count }))
        }
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

async fn list_owner_files(
    State(s):    State<StorageCombined>,
    Path(owner): Path<String>,
) -> Json<serde_json::Value> {
    let store = s.store.read().await;
    match store.list_files_for(&owner).await {
        Ok(files) => {
            let summary: Vec<_> = files.iter().map(file_summary).collect();
            let count = summary.len();
            Json(serde_json::json!({ "success": true, "files": summary, "count": count }))
        }
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

// ── Delete ────────────────────────────────────────────────────────────────────

async fn delete_file(
    State(s):  State<StorageCombined>,
    Path(cid): Path<String>,
) -> Json<serde_json::Value> {
    let store = s.store.read().await;
    match store.delete_file(&cid).await {
        Ok(_) => {
            let mut app = s.app.write().await;
            let tx = Transaction::new_delete_file("system".to_string(), cid.clone());
            let _ = app.blockchain.add_transaction(tx);
            Json(serde_json::json!({ "success": true, "deleted": cid }))
        }
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

// ── File info / stats ─────────────────────────────────────────────────────────

async fn file_info(
    State(s):  State<StorageCombined>,
    Path(cid): Path<String>,
) -> Json<serde_json::Value> {
    let store = s.store.read().await;
    let reg   = s.registry.read().await;
    match store.load_manifest(&cid).await {
        Ok(stored) => {
            let locations: Vec<serde_json::Value> = stored.manifest.chunk_cids.iter()
                .map(|ccid| {
                    let loc = reg.locate_chunk(ccid);
                    serde_json::json!({
                        "cid":   &ccid[..20.min(ccid.len())],
                        "nodes": loc.map(|l| l.node_ids.clone()).unwrap_or_default(),
                    })
                })
                .collect();
            Json(serde_json::json!({
                "success":   true,
                "cid":       stored.manifest.cid,
                "name":      stored.manifest.name,
                "size":      stored.manifest.size,
                "chunks":    stored.manifest.chunk_count,
                "mime_type": stored.manifest.mime_type,
                "owner":     stored.owner,
                "stored_at": stored.stored_at,
                "locations": locations,
            }))
        }
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

async fn storage_stats(State(s): State<StorageCombined>) -> Json<serde_json::Value> {
    let store = s.store.read().await;
    let reg   = s.registry.read().await;
    let store_stats = store.storage_stats().await.unwrap_or_default();
    let reg_stats   = reg.stats();
    Json(serde_json::json!({
        "local":   store_stats,
        "network": reg_stats,
    }))
}

// ── Node registry endpoints ───────────────────────────────────────────────────

async fn announce_node(
    State(s):       State<StorageCombined>,
    Json(mut info): Json<StorageNodeInfo>,
) -> Json<serde_json::Value> {
    info.last_seen = Utc::now().timestamp();
    let node_id = info.node_id.clone();
    let addr    = info.api_addr.clone();
    let mut reg = s.registry.write().await;
    reg.announce_node(info);
    info!("📣 Node announced: {} at {}", &node_id[..12.min(node_id.len())], addr);
    Json(serde_json::json!({
        "success":     true,
        "node_id":     node_id,
        "total_nodes": reg.node_count(),
        "replication": reg.replication,
    }))
}

async fn list_nodes(State(s): State<StorageCombined>) -> Json<serde_json::Value> {
    let reg = s.registry.read().await;
    let nodes: Vec<serde_json::Value> = reg.nodes.values()
        .map(|n| serde_json::json!({
            "node_id":    &n.node_id[..12.min(n.node_id.len())],
            "full_id":    n.node_id,
            "api_addr":   n.api_addr,
            "capacity":   n.capacity_bytes,
            "used":       n.used_bytes,
            "available":  n.available_bytes(),
            "reputation": n.reputation,
            "last_seen":  n.last_seen,
            "healthy":    n.is_healthy(),
            "version":    n.version,
        }))
        .collect();
    Json(serde_json::json!({
        "nodes":   nodes,
        "total":   reg.node_count(),
        "healthy": reg.healthy_count(),
    }))
}

async fn node_stats(State(s): State<StorageCombined>) -> Json<serde_json::Value> {
    let reg   = s.registry.read().await;
    let stats = reg.stats();
    Json(serde_json::to_value(stats).unwrap())
}

async fn heartbeat(
    State(s):      State<StorageCombined>,
    Path(node_id): Path<String>,
) -> Json<serde_json::Value> {
    let mut reg = s.registry.write().await;
    reg.update_heartbeat(&node_id);
    Json(serde_json::json!({ "success": true, "ts": Utc::now().timestamp() }))
}

// ── Internal node-to-node chunk transfer ──────────────────────────────────────

async fn internal_store_chunk(
    State(s):    State<StorageCombined>,
    Json(chunk): Json<crate::storage::chunker::Chunk>,
) -> Json<serde_json::Value> {
    let store = s.store.read().await;
    match store.store_chunks(&[chunk]).await {
        Ok(_)  => Json(serde_json::json!({ "success": true })),
        Err(e) => Json(serde_json::json!({ "success": false, "error": e.to_string() })),
    }
}

async fn internal_get_chunk(
    State(s):  State<StorageCombined>,
    Path(cid): Path<String>,
) -> Response {
    let store = s.store.read().await;
    match store.load_chunk(&cid).await {
        Ok(chunk) => {
            let data = serde_json::to_vec(&chunk).unwrap_or_default();
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(data))
                .unwrap()
        }
        Err(_) => err_resp(StatusCode::NOT_FOUND, "Chunk not found"),
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn file_summary(f: &StoredFile) -> serde_json::Value {
    serde_json::json!({
        "cid":       f.manifest.cid,
        "name":      f.manifest.name,
        "size":      f.manifest.size,
        "chunks":    f.manifest.chunk_count,
        "mime_type": f.manifest.mime_type,
        "owner":     f.owner,
        "stored_at": f.stored_at,
        "node_id":   f.node_id,
    })
}

fn err_resp(status: StatusCode, msg: &str) -> Response {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(
            serde_json::json!({ "success": false, "error": msg }).to_string()
        ))
        .unwrap()
}