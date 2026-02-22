#!/bin/bash

# Setup and Model Pull Script
# This script builds and starts the Docker containers, then pulls the ollama models

set -e  # Exit on any error

# ─── ANSI Colors & Styles ────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
CYAN="\033[0;36m"
MAGENTA="\033[0;35m"

# ─── Logging Helpers ─────────────────────────────────────────────────────────
log_info()    { echo -e "${BLUE}[INFO]${RESET}     $*"; }
log_ok()      { echo -e "${GREEN}[OK]${RESET}       $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${RESET}     $*"; }
log_error()   { echo -e "${RED}[ERROR]${RESET}    $*" >&2; }
log_step()    { echo -e "\n${BOLD}${CYAN}▶ $*${RESET}"; }
log_cmd()     { echo -e "  ${DIM}\$ $*${RESET}"; }
log_verbose() { echo -e "  ${DIM}[verbose] $*${RESET}"; }

separator() {
    echo -e "${DIM}$(printf '─%.0s' $(seq 1 62))${RESET}"
}

# ─── Spinner — for indeterminate waits ───────────────────────────────────────
_SPINNER_PID=
_SPINNER_FRAMES=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')

spinner_start() {
    local label="${1:-Please wait}"
    (
        local i=0
        while true; do
            printf "\r  ${CYAN}%s${RESET}  %s" "${_SPINNER_FRAMES[$i]}" "$label" >&2
            i=$(( (i + 1) % ${#_SPINNER_FRAMES[@]} ))
            sleep 0.1
        done
    ) &
    _SPINNER_PID=$!
}

spinner_stop() {
    if [ -n "$_SPINNER_PID" ]; then
        kill "$_SPINNER_PID" 2>/dev/null || true
        _SPINNER_PID=
        printf "\r\033[K" >&2
    fi
}

# ─── Progress Bar — for timed sleeps ─────────────────────────────────────────
progress_sleep() {
    local seconds="$1"
    local label="${2:-Waiting}"
    local bar_width=40
    local filled empty bar pct

    for ((i = 0; i <= seconds; i++)); do
        pct=$(( i * 100 / seconds ))
        filled=$(( i * bar_width / seconds ))
        empty=$(( bar_width - filled ))
        bar="$(printf "%${filled}s" | tr ' ' '█')$(printf "%${empty}s" | tr ' ' '░')"
        printf "\r  ${CYAN}%-18s${RESET}  [${GREEN}%s${RESET}] %3d%%  (%ds / %ds)" \
            "$label" "$bar" "$pct" "$i" "$seconds" >&2
        [ "$i" -lt "$seconds" ] && sleep 1
    done
    printf "\r\033[K" >&2
}

# ─── Elapsed Time ─────────────────────────────────────────────────────────────
_START_TIME=$(date +%s)
elapsed() {
    local secs=$(( $(date +%s) - _START_TIME ))
    printf "%02dm %02ds" $(( secs / 60 )) $(( secs % 60 ))
}

# ══════════════════════════════════════════════════════════════════════════════
#  Banner
# ══════════════════════════════════════════════════════════════════════════════
echo -e "${BOLD}${MAGENTA}"
cat <<'BANNER'
  ╔══════════════════════════════════════════════════════════╗
  ║       ControlTester 3000 — Docker Bootstrap v1.0        ║
  ╚══════════════════════════════════════════════════════════╝
BANNER
echo -e "${RESET}"

log_verbose "Script started at : $(date '+%Y-%m-%d %H:%M:%S')"
log_verbose "Working directory : $(pwd)"
log_verbose "User              : $(whoami)"
log_verbose "Docker version    : $(docker --version 2>/dev/null || echo 'not found')"
separator

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 1 — Build & start Docker containers
# ══════════════════════════════════════════════════════════════════════════════
log_step "STEP 1 — Building and starting Docker containers"
log_cmd  "docker compose up --build -d"
log_verbose "This may take a while on first run (image layers being pulled)..."
echo

docker compose up --build -d

log_ok "Docker Compose finished  [+$(elapsed)]"

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 2 — Initial container warm-up wait
# ══════════════════════════════════════════════════════════════════════════════
log_step "STEP 2 — Waiting for containers to initialise"
log_verbose "Giving internal processes time to start before health checks..."
echo
progress_sleep 10 "Container init"
echo
log_ok "Initial wait done  [+$(elapsed)]"

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 3 — Verify Ollama container is running
# ══════════════════════════════════════════════════════════════════════════════
log_step "STEP 3 — Verifying Ollama container health"
log_verbose "Running: docker ps --filter name=ollama --filter status=running"

if ! docker ps --filter "name=ollama" --filter "status=running" | grep -q ollama; then
    echo
    log_error "Ollama container is not running!"
    log_info  "Inspect logs with:  docker logs ollama"
    exit 1
fi

log_ok "Ollama container is running  [+$(elapsed)]"
log_verbose "Container info: $(docker ps --filter "name=ollama" --format "ID={{.ID}}  Name={{.Names}}  Status={{.Status}}" 2>/dev/null)"

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 4 — Wait for Ollama service to be fully ready
# ══════════════════════════════════════════════════════════════════════════════
log_step "STEP 4 — Waiting for Ollama service to be fully ready"
log_verbose "Ollama needs extra time to initialise its model server and GPU context..."
echo
progress_sleep 15 "Ollama svc init"
echo
log_ok "Ollama service warm-up done  [+$(elapsed)]"

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 5 — Probe Ollama API
# ══════════════════════════════════════════════════════════════════════════════
log_step "STEP 5 — Probing Ollama API  (max 12 attempts, 5 s apart)"
log_verbose "Endpoint: http://localhost:11434/api/version"
echo

max_retries=12
retry_count=0

while [ $retry_count -lt $max_retries ]; do
    log_verbose "Attempt $((retry_count + 1)) / $max_retries — sending request..."

    if curl -s http://localhost:11434/api/version > /dev/null 2>&1; then
        log_ok "Ollama API is responding  [+$(elapsed)]"
        log_verbose "API response: $(curl -s http://localhost:11434/api/version 2>/dev/null)"
        break
    else
        log_warn "No response on attempt $((retry_count + 1)) / $max_retries"
        spinner_start "Waiting 5 s before next retry..."
        sleep 5
        spinner_stop
        retry_count=$((retry_count + 1))
    fi
done

if [ $retry_count -eq $max_retries ]; then
    echo
    log_error "Ollama API did not respond after $max_retries attempts."
    log_info  "Inspect logs with:  docker logs ollama"
    exit 1
fi

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 6 — Pull Ollama models
# ══════════════════════════════════════════════════════════════════════════════
log_step "STEP 6 — Pulling Ollama models"
separator

log_info "Pulling  llama3:8b"
log_cmd  "docker exec ollama ollama pull llama3:8b"
log_verbose "Model will be streamed from the Ollama registry into the container..."
docker exec ollama ollama pull llama3:8b
log_ok "llama3:8b pulled successfully  [+$(elapsed)]"

# docker exec ollama ollama pull qwen3:8b

separator
log_info "Pulling  nomic-embed-text:latest"
log_cmd  "docker exec ollama ollama pull nomic-embed-text:latest"
log_verbose "Embedding model used for vector search and RAG pipelines..."
docker exec ollama ollama pull nomic-embed-text:latest
log_ok "nomic-embed-text:latest pulled successfully  [+$(elapsed)]"

# ══════════════════════════════════════════════════════════════════════════════
#  Done
# ══════════════════════════════════════════════════════════════════════════════
separator
echo -e "${BOLD}${GREEN}"
cat <<'DONE'
  ╔══════════════════════════════════════════════════════════╗
  ║                   Setup complete!                       ║
  ╚══════════════════════════════════════════════════════════╝
DONE
echo -e "${RESET}"

log_ok "Docker containers are running"
log_ok "llama3:8b model pulled"
log_ok "nomic-embed-text:latest model pulled"
log_verbose "Total elapsed time: $(elapsed)"
echo
log_info "Services available at:"
echo -e "  ${CYAN}Streamlit App${RESET}  →  http://localhost:8501"
echo -e "  ${CYAN}Ollama API${RESET}     →  http://localhost:11434"
echo
log_info "Useful commands:"
log_cmd "docker logs ollama"
log_cmd "docker logs streamlit_app"
log_cmd "docker compose down"
separator
