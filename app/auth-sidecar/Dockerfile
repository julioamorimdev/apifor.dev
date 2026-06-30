# auth-sidecar — driver do `claude setup-token` (OAuth assinatura) num PTY.
# Precisa do node (o claude CLI é um app node) + python3 (driver PTY stdlib).
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @anthropic-ai/claude-code \
 && npm cache clean --force

ENV CONTAS_DIR=/data/contas PORT=8090
RUN mkdir -p /data/contas
WORKDIR /app
COPY server.py .

EXPOSE 8090
CMD ["python3", "server.py"]
