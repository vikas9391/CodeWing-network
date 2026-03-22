mod blockchain;
mod crypto;
mod storage;
mod network;
mod api;

use clap::{Parser, Subcommand};
use crate::blockchain::chain::Blockchain;
use crate::blockchain::transaction::Transaction;
use crate::crypto::wallet::Wallet;
use crate::storage::chunker::Chunker;

#[derive(Parser)]
#[command(name = "codewing-cli")]
#[command(about = "CodeWing Network CLI — Blockchain Cloud Storage", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Create a new wallet
    NewWallet,
    /// Show blockchain stats
    Stats,
    /// Mine a new block
    Mine { address: String },
    /// Send CWC tokens
    Send { from: String, to: String, amount: u64 },
    /// Chunk and encrypt a file (local demo)
    ChunkFile { path: String },
}

fn main() {
    let cli = Cli::parse();
    let mut chain = Blockchain::new();

    match cli.command {
        Commands::NewWallet => {
            let wallet = Wallet::new();
            println!("🔑 New Wallet Created");
            println!("   Address:     {}", wallet.address);
            println!("   Public Key:  {}", wallet.public_key);
            println!("   Private Key: {}", wallet.export_private_key().unwrap_or_default());
            println!("   ⚠️  Save your private key securely!");
        }
        Commands::Stats => {
            let stats = chain.get_stats();
            println!("📊 CodeWing Network Stats");
            println!("   Chain Height:        {}", stats.height);
            println!("   Difficulty:          {}", stats.difficulty);
            println!("   Total Transactions:  {}", stats.total_transactions);
            println!("   Files on Chain:      {}", stats.total_files);
            println!("   Storage Used:        {} bytes", stats.total_storage_bytes);
            println!("   Pending Txs:         {}", stats.pending_transactions);
        }
        Commands::Mine { address } => {
            println!("⛏️  Mining block for {}", address);
            match chain.mine_pending_transactions(address) {
                Ok(block) => {
                    println!("✅ Block #{} mined!", block.index);
                    println!("   Hash: {}", block.hash);
                    println!("   Reward: {} CWC", block.reward);
                }
                Err(e) => println!("❌ Mining failed: {}", e),
            }
        }
        Commands::Send { from, to, amount } => {
            let tx = Transaction::new_payment(from, to, amount);
            let id = tx.id.clone();
            chain.add_transaction(tx).unwrap();
            println!("✅ Transaction added to mempool: {}", &id[..16]);
        }
        Commands::ChunkFile { path } => {
            let data = std::fs::read(&path).expect("Failed to read file");
            let filename = std::path::Path::new(&path)
                .file_name().unwrap().to_str().unwrap();
            match Chunker::chunk_and_encrypt(&data, filename, "application/octet-stream") {
                Ok((manifest, chunks, key)) => {
                    println!("✅ File chunked and encrypted");
                    println!("   CID:        {}", manifest.cid);
                    println!("   Chunks:     {}", manifest.chunk_count);
                    println!("   Size:       {} bytes", manifest.size);
                    println!("   Enc Key:    {} (save this!)", hex::encode(&key));
                }
                Err(e) => println!("❌ Failed: {}", e),
            }
        }
    }
}