#!/bin/bash

# Setup and Model Pull Script
# This script builds and starts the Docker containers, then pulls the ollama models

set -e  # Exit on any error

# ─── Flags ───────────────────────────────────────────────────────────────────
VERBOSE=false
for arg in "$@"; do
    case "$arg" in
        --verbose|-v|--debug) VERBOSE=true ;;
    esac
done

# ─── ANSI Colors & Styles ────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
ITALIC="\033[3m"

# Sakura palette
PINK="\033[38;5;218m"       # light sakura pink
DEEP_PINK="\033[38;5;198m"  # deep cherry pink
PETAL="\033[38;5;225m"      # pale petal white-pink
BLOSSOM="\033[38;5;213m"    # magenta-pink blossom
STEM="\033[38;5;138m"       # warm brown-grey (branch / stem)
LEAF="\033[38;5;115m"       # soft green leaf
WHITE="\033[38;5;255m"      # bright white
DIM_PINK="\033[38;5;182m"   # muted pink for dim text

# ─── Logging Helpers ─────────────────────────────────────────────────────────
log_info()    { echo -e "${PETAL}  ✿  ${WHITE}$*${RESET}"; }
log_ok()      { echo -e "${LEAF}  ✔  ${WHITE}$*${RESET}"; }
log_warn()    { echo -e "${DEEP_PINK}  ⚠  ${WHITE}$*${RESET}"; }
log_error()   { echo -e "${DEEP_PINK}  ✖  ${WHITE}$*${RESET}" >&2; }
log_step()    { echo -e "\n${BOLD}${BLOSSOM}  🌸  $*${RESET}"; }
log_cmd()     { echo -e "  ${DIM_PINK}${ITALIC}\$ $*${RESET}"; }
log_verbose() { $VERBOSE && echo -e "  ${STEM}${DIM}❧ $*${RESET}" || true; }

separator() {
    echo -e "${DIM_PINK}$(printf '·❀·%.0s' $(seq 1 15))·${RESET}"
}

# ─── Spinner — for indeterminate waits ───────────────────────────────────────
_SPINNER_PID=
_SPINNER_FRAMES=('🌸' '🌺' '✿' '❀' '✾' '❁' '✽' '✼' '✻' '✸')

spinner_start() {
    local label="${1:-Please wait}"
    (
        local i=0
        while true; do
            printf "\r  ${PINK}%s${RESET}  %s" "${_SPINNER_FRAMES[$i]}" "$label" >&2
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
    local bar_width=30

    for ((i = 0; i <= seconds; i++)); do
        local pct=$(( i * 100 / seconds ))
        local filled=$(( i * bar_width / seconds ))
        local empty=$(( bar_width - filled ))

        local fill_str=""
        local empty_str=""
        [ "$filled" -gt 0 ] && fill_str="$(printf '✿%.0s' $(seq 1 $filled))"
        [ "$empty"  -gt 0 ] && empty_str="$(printf '·%.0s' $(seq 1 $empty))"

        printf "\r  ${PINK}%-20s${RESET}  ${DIM_PINK}❬${RESET}${DEEP_PINK}%s${DIM_PINK}%s❭${RESET}  ${PETAL}%3d%%${RESET}  ${STEM}(%ds/%ds)${RESET}" \
            "$label" "$fill_str" "$empty_str" "$pct" "$i" "$seconds" >&2
        [ "$i" -lt "$seconds" ] && sleep 1
    done
    printf "\r\033[K" >&2
}

# ─── Docker Build with Live Ticker ───────────────────────────────────────────
# Runs docker compose up --build -d in the background.
# Suppresses raw output; shows a live spinner + last build action + step counter.
# On failure, dumps the full log to stderr.
# Pass --verbose / -v to stream raw docker output instead.
docker_build() {
    if $VERBOSE; then
        docker compose up --build -d
        return $?
    fi

    local log_file
    log_file=$(mktemp /tmp/trace-docker-XXXXXX.log)

    # Run docker in the background, capture all output
    docker compose up --build -d >"$log_file" 2>&1 &
    local docker_pid=$!

    local frame=0
    local nframes=${#_SPINNER_FRAMES[@]}

    while kill -0 "$docker_pid" 2>/dev/null; do
        local spinner="${_SPINNER_FRAMES[$((frame % nframes))]}"
        frame=$(( frame + 1 ))

        # Extract the latest step counter, e.g. "(12/35)"
        local step
        step=$(grep -oE '\([0-9]+/[0-9]+\)' "$log_file" 2>/dev/null | tail -1)

        # Extract the latest action line (lines starting with "=>"), strip ANSI & leading arrows
        local action
        action=$(grep -E '^[[:space:]]*=>' "$log_file" 2>/dev/null | tail -1 \
            | sed 's/\x1b\[[0-9;]*[mJK]//g; s/^[[:space:]]*=>[[:space:]]*//' \
            | cut -c1-52)

        if [ -n "$step" ]; then
            printf "\r  ${PINK}%s${RESET}  ${DIM_PINK}Building${RESET} ${PETAL}%-8s${RESET}  ${STEM}%s${RESET}%-10s" \
                "$spinner" "$step" "$action" "" >&2
        else
            printf "\r  ${PINK}%s${RESET}  ${DIM_PINK}Starting containers...${RESET}  ${STEM}%s${RESET}%-10s" \
                "$spinner" "$action" "" >&2
        fi

        sleep 0.15
    done

    printf "\r\033[K" >&2
    wait "$docker_pid"
    local exit_code=$?

    if [ $exit_code -ne 0 ]; then
        echo
        log_error "Docker Compose failed. Full build log:"
        echo
        cat "$log_file" >&2
        rm -f "$log_file"
        exit $exit_code
    fi

    rm -f "$log_file"
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
echo -e "${BOLD}${DEEP_PINK}"
cat <<'BANNER'
  ╔═════════════════════════════════════════════════════════════════════════╗
  ║        🌸   Trace  ·  Trusted Risk and Controls Assessment   🌸         ║
  ║          ✿                        2026                      ✿           ║
  ╚═════════════════════════════════════════════════════════════════════════╝
BANNER
echo -e "${RESET}"
echo -e "${DIM_PINK}       ✿         ❀               ✿          ❀${RESET}"
echo -e "${PINK}            🌸         ✿      🌺        ✿${RESET}"
echo

log_verbose "Script started at : $(date '+%Y-%m-%d %H:%M:%S')"
log_verbose "Working directory : $(pwd)"
log_verbose "User              : $(whoami)"
log_verbose "Docker version    : $(docker --version 2>/dev/null || echo 'not found')"
$VERBOSE && separator || true

# ══════════════════════════════════════════════════════════════════════════════
#  STEP 1 — Build & start Docker containers
# ══════════════════════════════════════════════════════════════════════════════
log_step "STEP 1 — Building and starting Docker containers"
log_cmd  "docker compose up --build -d"
log_verbose "This may take a while on first run (image layers being pulled)..."
echo

docker_build

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

# # ══════════════════════════════════════════════════════════════════════════════
# #  STEP 3 — Verify Ollama container is running
# # ══════════════════════════════════════════════════════════════════════════════
# log_step "STEP 3 — Verifying Ollama container health"
# log_verbose "Running: docker ps --filter name=ollama --filter status=running"

# if ! docker ps --filter "name=ollama" --filter "status=running" | grep -q ollama; then
#     echo
#     log_error "Ollama container is not running!"
#     log_info  "Inspect logs with:  docker logs ollama"
#     exit 1
# fi

# log_ok "Ollama container is running  [+$(elapsed)]"
# log_verbose "Container info: $(docker ps --filter "name=ollama" --format "ID={{.ID}}  Name={{.Names}}  Status={{.Status}}" 2>/dev/null)"

# # ══════════════════════════════════════════════════════════════════════════════
# #  STEP 4 — Wait for Ollama service to be fully ready
# # ══════════════════════════════════════════════════════════════════════════════
# log_step "STEP 4 — Waiting for Ollama service to be fully ready"
# log_verbose "Ollama needs extra time to initialise its model server and GPU context..."
# echo
# progress_sleep 15 "Ollama svc init"
# echo
# log_ok "Ollama service warm-up done  [+$(elapsed)]"

# # ══════════════════════════════════════════════════════════════════════════════
# #  STEP 5 — Probe Ollama API
# # ══════════════════════════════════════════════════════════════════════════════
# log_step "STEP 5 — Probing Ollama API  (max 12 attempts, 5 s apart)"
# log_verbose "Endpoint: http://localhost:11434/api/version"
# echo

# max_retries=12
# retry_count=0

# while [ $retry_count -lt $max_retries ]; do
#     log_verbose "Attempt $((retry_count + 1)) / $max_retries — sending request..."

#     if curl -s http://localhost:11434/api/version > /dev/null 2>&1; then
#         log_ok "Ollama API is responding  [+$(elapsed)]"
#         log_verbose "API response: $(curl -s http://localhost:11434/api/version 2>/dev/null)"
#         break
#     else
#         log_warn "No response on attempt $((retry_count + 1)) / $max_retries"
#         spinner_start "Waiting 5 s before next retry..."
#         sleep 5
#         spinner_stop
#         retry_count=$((retry_count + 1))
#     fi
# done

# if [ $retry_count -eq $max_retries ]; then
#     echo
#     log_error "Ollama API did not respond after $max_retries attempts."
#     log_info  "Inspect logs with:  docker logs ollama"
#     exit 1
# fi

# # ══════════════════════════════════════════════════════════════════════════════
# #  STEP 6 — Pull Ollama models
# # ══════════════════════════════════════════════════════════════════════════════
# log_step "STEP 6 — Pulling Ollama models"
# separator
# log_info "Pulling  llama3:8b"
# log_cmd  "docker exec ollama ollama pull llama3:8b"
# log_verbose "Model will be streamed from the Ollama registry into the container..."
# docker exec ollama ollama pull llama3:8b
# log_ok "llama3:8b pulled successfully  [+$(elapsed)]"

# separator
# log_info "Pulling  qwen3.5:4b"
# log_cmd  "docker exec ollama ollama pull qwen3.5:4b"
# log_verbose "Model will be streamed from the Ollama registry into the container..."
# docker exec ollama ollama pull qwen3.5:4b
# log_ok "qwen3.5:4b pulled successfully  [+$(elapsed)]"

# separator
# log_info "Pulling  nomic-embed-text:latest"
# log_cmd  "docker exec ollama ollama pull nomic-embed-text:latest"
# log_verbose "Embedding model used for vector search and RAG pipelines..."
# docker exec ollama ollama pull nomic-embed-text:latest
# log_ok "nomic-embed-text:latest pulled successfully  [+$(elapsed)]"

# ══════════════════════════════════════════════════════════════════════════════
#  Done
# ══════════════════════════════════════════════════════════════════════════════
separator
echo -e "${BOLD}${DEEP_PINK}"
cat <<'DONE'
  ╔══════════════════════════════════════════════════════════╗
  ║       🌸   すべて完了  ·  Setup Complete!   🌸           ║
  ╚══════════════════════════════════════════════════════════╝
DONE
echo -e "${RESET}"

log_ok "Docker containers are running"
# log_ok "llama3:8b model pulled"
# log_ok "nomic-embed-text:latest model pulled"
log_verbose "Total elapsed time: $(elapsed)"
echo
log_info "Services available at:"
echo -e "  ${BLOSSOM}Login here${RESET}  →  ${PINK}http://localhost:5000/login${RESET}"
# echo -e "  ${BLOSSOM}Ollama API${RESET}     →  ${PINK}http://localhost:11434${RESET}"
echo
log_info "Useful commands:"
# log_cmd "docker logs ollama"
log_cmd "docker logs streamlit_app"
log_cmd "docker compose down"
echo
log_info "Tip: run ${ITALIC}./make.sh --verbose${RESET}${PETAL} to see full Docker build output"
separator
