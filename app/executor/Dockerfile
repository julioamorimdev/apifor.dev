FROM rust:1 AS build
RUN apt-get update && apt-get install -y protobuf-compiler && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY Cargo.toml build.rs ./
COPY proto ./proto
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /var/lib/apifor /workspace
ENV APIFOR_HOME=/var/lib/apifor APIFOR_WORKDIR=/workspace
COPY --from=build /src/target/release/executor /usr/local/bin/executor
ENTRYPOINT ["executor"]
