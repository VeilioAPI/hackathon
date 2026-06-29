#!/usr/bin/env bash
set -euo pipefail

mkdir -p /shared

# Canton uses in-memory storage; clear stale bootstrap artifacts from prior runs.
rm -f /shared/participants.json /shared/.canton-ready

echo "Starting Veilio Canton (5 participants @ 5011–5051)..."
# Default JVM cap when compose does not set JAVA_TOOL_OPTIONS (recommended VPS: 8 GB+ RAM).
if [ -z "${JAVA_TOOL_OPTIONS:-}" ]; then
  export JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=45.0 -XX:+ExitOnOutOfMemoryError"
fi
exec java -jar /opt/canton/canton.jar daemon \
  -c /app/canton/veilio-multinode.conf \
  --bootstrap /app/canton/bootstrap.canton \
  --no-tty
