# Tracent hosted agent: hello-world
# Satisfies the Tracent Hosted Agent Contract (docs/hosting-architecture.md):
#   - listens on $PORT (default 8080) on 0.0.0.0
#   - GET /health returns 200
#   - POST /mcp speaks minimal MCP JSON-RPC (initialize, tools/list, tools/call)
#
# Build:  docker build -t tracent-agent-hello-world agents/hello-world
# Run:    docker run -p 8080:8080 tracent-agent-hello-world
FROM python:3.12-slim

WORKDIR /agent

RUN pip install --no-cache-dir "fastapi>=0.111.0" "uvicorn[standard]>=0.29.0"

COPY app.py .

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
