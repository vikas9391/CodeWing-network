use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::time::Duration;

use anyhow::Result;
use futures::StreamExt;
use libp2p::{
    gossipsub, identify, mdns, noise, ping,
    swarm::{NetworkBehaviour, SwarmEvent},
    tcp, yamux, Multiaddr, PeerId, SwarmBuilder,
};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use tracing::{info, warn};

// ─── Message types sent over gossip ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NetworkMessage {
    NewBlock(String),        // JSON-serialized Block
    NewTransaction(String),  // JSON-serialized Transaction
    RequestChain,
    SendChain(String),       // JSON-serialized Vec<Block>
    RequestChunk(String),    // chunk CID
    SendChunk(String),       // JSON-serialized Chunk
    Ping,
    Pong { peer_id: String, chain_height: u64 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub peer_id: String,
    pub address: String,
    pub chain_height: u64,
    pub version: String,
}

// ─── Events emitted to the rest of the app ────────────────────────────────────

#[derive(Debug)]
pub enum P2PEvent {
    PeerConnected(PeerId),
    PeerDisconnected(PeerId),
    MessageReceived { from: PeerId, message: NetworkMessage },
    Error(String),
}

// ─── Commands sent into the p2p layer ─────────────────────────────────────────

#[derive(Debug)]
pub enum P2PCommand {
    Broadcast(NetworkMessage),
    Dial(Multiaddr),
    GetPeers,
    Shutdown,
}

// ─── Combined libp2p behaviour ────────────────────────────────────────────────

#[derive(NetworkBehaviour)]
pub struct CodeWingBehaviour {
    pub gossipsub: gossipsub::Behaviour,
    pub mdns:      mdns::tokio::Behaviour,
    pub identify:  identify::Behaviour,
    pub ping:      ping::Behaviour,
}

// ─── P2P Node ─────────────────────────────────────────────────────────────────

pub struct P2PNode {
    pub local_peer_id: PeerId,
    pub command_tx:    mpsc::Sender<P2PCommand>,
    pub event_rx:      mpsc::Receiver<P2PEvent>,
}

const CODEWING_TOPIC: &str = "codewing-mainnet-v1";

pub async fn start_p2p_node(
    listen_port: u16,
) -> Result<P2PNode> {
    let (cmd_tx, mut cmd_rx)     = mpsc::channel::<P2PCommand>(256);
    let (evt_tx, evt_rx)         = mpsc::channel::<P2PEvent>(256);

    // Build the swarm
    let mut swarm = SwarmBuilder::with_new_identity()
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )?
        .with_behaviour(|key| {
            // Gossipsub
            let msg_id_fn = |msg: &gossipsub::Message| {
                let mut s = DefaultHasher::new();
                msg.data.hash(&mut s);
                gossipsub::MessageId::from(s.finish().to_string())
            };
            let gossip_cfg = gossipsub::ConfigBuilder::default()
                .heartbeat_interval(Duration::from_secs(10))
                .validation_mode(gossipsub::ValidationMode::Strict)
                .message_id_fn(msg_id_fn)
                .build()
                .expect("valid gossipsub config");

            let gossipsub = gossipsub::Behaviour::new(
                gossipsub::MessageAuthenticity::Signed(key.clone()),
                gossip_cfg,
            ).expect("gossipsub init");

            // mDNS — auto peer discovery on local network
            let mdns = mdns::tokio::Behaviour::new(
                mdns::Config::default(),
                key.public().to_peer_id(),
            ).expect("mdns init");

            // Identify — share version + address info
            let identify = identify::Behaviour::new(
                identify::Config::new(
                    "/codewing/1.0.0".to_string(),
                    key.public(),
                )
            );

            // Ping — keepalive
            let ping = ping::Behaviour::new(ping::Config::new());

            CodeWingBehaviour { gossipsub, mdns, identify, ping }
        })?
        .build();

    let local_peer_id = *swarm.local_peer_id();

    // Subscribe to the main topic
    let topic = gossipsub::IdentTopic::new(CODEWING_TOPIC);
    swarm.behaviour_mut().gossipsub.subscribe(&topic)?;

    // Listen
    let listen_addr: Multiaddr = format!("/ip4/0.0.0.0/tcp/{}", listen_port).parse()?;
    swarm.listen_on(listen_addr)?;

    info!("🌐 P2P node started | PeerID: {}", local_peer_id);
    info!("📡 Listening on port {}", listen_port);

    let topic_clone = topic.clone();
    let evt_tx_clone = evt_tx.clone();

    // Spawn the swarm event loop
    tokio::spawn(async move {
        loop {
            tokio::select! {
                // Handle incoming swarm events
                event = swarm.select_next_some() => {
                    match event {
                        SwarmEvent::NewListenAddr { address, .. } => {
                            info!("📍 Listening on: {}", address);
                        }

                        SwarmEvent::Behaviour(CodeWingBehaviourEvent::Mdns(
                            mdns::Event::Discovered(peers)
                        )) => {
                            for (peer_id, addr) in peers {
                                info!("🔍 mDNS discovered peer: {} at {}", peer_id, addr);
                                swarm.behaviour_mut().gossipsub.add_explicit_peer(&peer_id);
                                let _ = evt_tx_clone.send(P2PEvent::PeerConnected(peer_id)).await;
                            }
                        }

                        SwarmEvent::Behaviour(CodeWingBehaviourEvent::Mdns(
                            mdns::Event::Expired(peers)
                        )) => {
                            for (peer_id, _) in peers {
                                warn!("⚠️  Peer expired: {}", peer_id);
                                swarm.behaviour_mut().gossipsub.remove_explicit_peer(&peer_id);
                                let _ = evt_tx_clone.send(P2PEvent::PeerDisconnected(peer_id)).await;
                            }
                        }

                        SwarmEvent::Behaviour(CodeWingBehaviourEvent::Gossipsub(
                            gossipsub::Event::Message { propagation_source, message, .. }
                        )) => {
                            if let Ok(msg) = serde_json::from_slice::<NetworkMessage>(&message.data) {
                                info!("📨 Message from {}: {:?}", propagation_source,
                                    std::mem::discriminant(&msg));
                                let _ = evt_tx_clone.send(P2PEvent::MessageReceived {
                                    from: propagation_source,
                                    message: msg,
                                }).await;
                            }
                        }

                        SwarmEvent::Behaviour(CodeWingBehaviourEvent::Identify(
                            identify::Event::Received { peer_id, info, .. }
                        )) => {
                            info!("🪪  Identified peer {} running {}", peer_id, info.protocol_version);
                        }

                        SwarmEvent::Behaviour(CodeWingBehaviourEvent::Ping(
                            ping::Event { peer, result, .. }
                        )) => {
                            if let Ok(rtt) = result {
                                info!("🏓 Ping {} — RTT: {:?}", peer, rtt);
                            }
                        }

                        SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                            info!("🤝 Connected to peer: {}", peer_id);
                        }

                        SwarmEvent::ConnectionClosed { peer_id, .. } => {
                            info!("👋 Disconnected from peer: {}", peer_id);
                        }

                        _ => {}
                    }
                }

                // Handle commands from the app layer
                Some(cmd) = cmd_rx.recv() => {
                    match cmd {
                        P2PCommand::Broadcast(msg) => {
                            if let Ok(data) = serde_json::to_vec(&msg) {
                                match swarm.behaviour_mut().gossipsub
                                    .publish(topic_clone.clone(), data)
                                {
                                    Ok(_)  => info!("📤 Broadcasted message"),
                                    Err(e) => warn!("❌ Broadcast failed: {:?}", e),
                                }
                            }
                        }

                        P2PCommand::Dial(addr) => {
                            info!("📞 Dialing: {}", addr);
                            if let Err(e) = swarm.dial(addr) {
                                warn!("❌ Dial failed: {:?}", e);
                            }
                        }

                        P2PCommand::GetPeers => {
                            let peers: Vec<String> = swarm
                                .behaviour()
                                .gossipsub
                                .all_peers()
                                .map(|(id, _)| id.to_string())
                                .collect();
                            info!("👥 Connected peers: {:?}", peers);
                        }

                        P2PCommand::Shutdown => {
                            info!("🛑 P2P node shutting down");
                            break;
                        }
                    }
                }
            }
        }
    });

    Ok(P2PNode {
        local_peer_id,
        command_tx: cmd_tx,
        event_rx: evt_rx,
    })
}

/// Broadcast a new block to the network
pub async fn broadcast_block(
    cmd_tx: &mpsc::Sender<P2PCommand>,
    block_json: String,
) {
    let _ = cmd_tx.send(P2PCommand::Broadcast(
        NetworkMessage::NewBlock(block_json)
    )).await;
}

/// Broadcast a new transaction to the network
pub async fn broadcast_transaction(
    cmd_tx: &mpsc::Sender<P2PCommand>,
    tx_json: String,
) {
    let _ = cmd_tx.send(P2PCommand::Broadcast(
        NetworkMessage::NewTransaction(tx_json)
    )).await;
}

/// Request full chain from peers (for initial sync)
pub async fn request_chain_sync(cmd_tx: &mpsc::Sender<P2PCommand>) {
    let _ = cmd_tx.send(P2PCommand::Broadcast(
        NetworkMessage::RequestChain
    )).await;
}