# --------------------------
# Stage 1 — Builder
# --------------------------
FROM rust:1.82 as builder

ENV DEBIAN_FRONTEND=noninteractive

# Install minimal dependencies required for Substrate builds
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        pkg-config \
        cmake \
        clang \
        libclang-dev \
        libssl-dev \
        protobuf-compiler && \
    rustup target add wasm32-unknown-unknown && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create work directory
WORKDIR /codewing

# Copy source
COPY . .

# Build optimized release binary
RUN cargo build --release --locked -p solochain-template-node

# --------------------------
# Stage 2 — Runtime Image
# --------------------------
FROM debian:stable-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    update-ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy node binary from builder
COPY --from=builder /codewing/target/release/solochain-template-node /app/node

EXPOSE 30333 9933 9944 9615

ENTRYPOINT ["/app/node"]
