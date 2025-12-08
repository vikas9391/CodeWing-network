FROM rust:1.82 as builder

RUN apt-get update && \
    apt-get install -y cmake pkg-config libssl-dev git clang libclang-dev protobuf-compiler && \
    rustup component add rust-src --toolchain 1.82.0-x86_64-unknown-linux-gnu && \
    rustup target add wasm32-unknown-unknown --toolchain 1.82.0-x86_64-unknown-linux-gnu

WORKDIR /codewing

COPY . .

RUN cargo build --release



FROM debian:stable-slim

RUN apt-get update && \
    apt-get install -y ca-certificates && \
    update-ca-certificates

WORKDIR /app

COPY --from=builder /codewing/target/release/solochain-template-node /app/node

EXPOSE 30333 9933 9944

ENTRYPOINT ["/app/node"]
