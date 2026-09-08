# syntax=docker/dockerfile:1.4
# aibuddy CLI and Server Docker Image
# Multi-stage build for minimal final image size

# Build stage
FROM rust:1.82-bookworm AS builder

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    pkg-config \
    libssl-dev \
    libdbus-1-dev \
    libclang-dev \
    protobuf-compiler \
    libprotobuf-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /build

# Copy source code
COPY . .

# Build release binaries with optimizations
ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
ENV CARGO_PROFILE_RELEASE_LTO=true
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
ENV CARGO_PROFILE_RELEASE_OPT_LEVEL=z
ENV CARGO_PROFILE_RELEASE_STRIP=true
RUN cargo build --release --package aibuddy-cli

# Runtime stage - minimal Debian
FROM debian:bookworm-slim@sha256:b1a741487078b369e78119849663d7f1a5341ef2768798f7b7406c4240f86aef

# Install only runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    libdbus-1-3 \
    libgomp1 \
    libxcb1 \
    curl \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy binary from builder
COPY --from=builder /build/target/release/aibuddy /usr/local/bin/aibuddy

# Create non-root user
RUN useradd -m -u 1000 -s /bin/bash aibuddy && \
    mkdir -p /home/aibuddy/.config/aibuddy && \
    chown -R aibuddy:aibuddy /home/aibuddy

# Set up environment
ENV PATH="/usr/local/bin:${PATH}"
ENV HOME="/home/aibuddy"

# Switch to non-root user
USER aibuddy
WORKDIR /home/aibuddy

# Default to aibuddy CLI
ENTRYPOINT ["/usr/local/bin/aibuddy"]
CMD ["--help"]

# Labels for metadata
LABEL org.opencontainers.image.title="aibuddy"
LABEL org.opencontainers.image.description="aibuddy CLI"
LABEL org.opencontainers.image.vendor="AAIF"
LABEL org.opencontainers.image.source="https://github.com/aaif-goose/goose"
