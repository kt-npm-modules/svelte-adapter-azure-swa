#!/usr/bin/env bash
set -euo pipefail

func_pid=''
swa_pid=''

cleanup() {
  trap - EXIT
  if [[ -n "$swa_pid" ]]; then
    kill "$swa_pid" 2>/dev/null || true
  fi
  if [[ -n "$func_pid" ]]; then
    kill "$func_pid" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Start Functions separately so the SWA CLI never downloads its own Core Tools.
(
  cd "$(dirname "$0")/../func"
  exec func start --port 7071 --cors '*'
) &
func_pid=$!

ready=false
for ((attempt = 0; attempt < 90; attempt++)); do
  if ! kill -0 "$func_pid" 2>/dev/null; then
    echo "Azure Functions exited before becoming ready." >&2
    wait "$func_pid" || true
    exit 1
  fi
  # Any HTTP status indicates that the Functions host is listening.
  if curl --silent --max-time 2 --output /dev/null http://127.0.0.1:7071/; then
    ready=true
    break
  fi
  sleep 1
done

if [[ "$ready" != true ]]; then
  echo "Timed out waiting for Azure Functions on port 7071." >&2
  exit 1
fi

./node_modules/.bin/swa start --api-devserver-url http://127.0.0.1:7071 &
swa_pid=$!

if wait -n "$func_pid" "$swa_pid"; then
  echo "A local server exited unexpectedly." >&2
else
  echo "A local server failed." >&2
fi
exit 1
