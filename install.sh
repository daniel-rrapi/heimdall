#!/usr/bin/env bash
#
# Heimdall installer — builds the project and links the `heimdall` CLI into a
# user-local bin directory (~/.local/bin), no sudo required. macOS and Linux.
#
# Two ways to run it:
#   • From a clone:  ./install.sh            (or: npm run install:cli)
#   • One-liner:     curl -fsSL https://raw.githubusercontent.com/daniel-rrapi/heimdall/main/install.sh | bash
#
# Piped via curl|bash it clones the repo into ~/.heimdall (override HEIMDALL_HOME)
# and builds there; re-run to update. Uninstall: install.sh --uninstall
#
set -euo pipefail

# ── pretty output (plain when not a TTY) ─────────────────────────────────────
if [ -t 1 ]; then
  BOLD=$(printf '\033[1m'); RED=$(printf '\033[31m'); GRN=$(printf '\033[32m')
  YEL=$(printf '\033[33m'); DIM=$(printf '\033[2m'); RST=$(printf '\033[0m')
else
  BOLD=""; RED=""; GRN=""; YEL=""; DIM=""; RST=""
fi
info() { printf '%s %s\n' "${GRN}==>${RST}" "$*"; }
warn() { printf '%s %s\n' "${YEL}warning:${RST}" "$*" >&2; }
err()  { printf '%s %s\n' "${RED}error:${RST}" "$*" >&2; }

# ── config (override via env) ────────────────────────────────────────────────
REPO_URL="${HEIMDALL_REPO:-https://github.com/daniel-rrapi/heimdall.git}"
REF="${HEIMDALL_REF:-main}"
HEIMDALL_HOME="${HEIMDALL_HOME:-${HOME}/.heimdall}"
TARBALL_URL="https://github.com/daniel-rrapi/heimdall/archive/refs/heads/${REF}.tar.gz"

BIN_DIR="${HOME}/.local/bin"
LINK="${BIN_DIR}/heimdall"

# ── uninstall (no source needed) ─────────────────────────────────────────────
if [ "${1:-}" = "--uninstall" ] || [ "${1:-}" = "-u" ]; then
  if [ -L "$LINK" ] || [ -e "$LINK" ]; then
    rm -f "$LINK"; info "Removed ${LINK}"
  else
    info "Nothing to remove at ${LINK}"
  fi
  if [ -d "$HEIMDALL_HOME" ]; then
    info "Source clone left at ${HEIMDALL_HOME} (remove with: rm -rf \"${HEIMDALL_HOME}\")"
  fi
  exit 0
fi

# ── OS check ─────────────────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin | Linux) ;;
  *) err "Unsupported OS: ${OS}. This installer supports macOS and Linux."; exit 1 ;;
esac

# ── prerequisites ────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { err "Node.js not found. Install Node 18+ from https://nodejs.org"; exit 1; }
command -v npm  >/dev/null 2>&1 || { err "npm not found (it ships with Node.js)."; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node 18+ required (found $(node -v)). Please upgrade."; exit 1
fi

# ── resolve source: local checkout vs bootstrap (curl|bash) ──────────────────
SRC="${BASH_SOURCE[0]:-}"
SCRIPT_DIR=""
if [ -n "$SRC" ] && [ -f "$SRC" ]; then
  SCRIPT_DIR="$(cd "$(dirname "$SRC")" && pwd)"
fi

if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/package.json" ] && grep -q '"heimdall-cli"' "$SCRIPT_DIR/package.json" 2>/dev/null; then
  # Local mode — running from inside a clone.
  REPO_DIR="$SCRIPT_DIR"
  info "Installing from local checkout: ${REPO_DIR}"
else
  # Bootstrap mode — fetch the source into HEIMDALL_HOME.
  REPO_DIR="$HEIMDALL_HOME"
  if [ -d "$REPO_DIR/.git" ]; then
    info "Updating existing checkout in ${REPO_DIR} (ref: ${REF})..."
    git -C "$REPO_DIR" fetch --depth 1 origin "$REF"
    git -C "$REPO_DIR" reset --hard "origin/${REF}"
  elif command -v git >/dev/null 2>&1; then
    info "Cloning ${REPO_URL} (ref: ${REF}) into ${REPO_DIR}..."
    [ -e "$REPO_DIR" ] && rm -rf "$REPO_DIR"
    git clone --depth 1 --branch "$REF" "$REPO_URL" "$REPO_DIR"
  elif command -v curl >/dev/null 2>&1; then
    info "git not found — downloading tarball (${REF})..."
    [ -e "$REPO_DIR" ] && rm -rf "$REPO_DIR"
    mkdir -p "$REPO_DIR"
    curl -fsSL "$TARBALL_URL" | tar -xz -C "$REPO_DIR" --strip-components=1
  else
    err "Need either git or curl to fetch the source."; exit 1
  fi
fi

# ── install deps + build (compiles src/ and web/, copies index.html) ─────────
cd "$REPO_DIR"
TARGET="${REPO_DIR}/dist/index.js"

info "Installing dependencies..."
if [ -f package-lock.json ]; then
  npm ci || { warn "npm ci failed; falling back to npm install"; npm install; }
else
  npm install
fi

info "Building (TypeScript + web dashboard)..."
npm run build

[ -f "$TARGET" ] || { err "Build did not produce ${TARGET}"; exit 1; }
chmod +x "$TARGET"

# ── link into ~/.local/bin ───────────────────────────────────────────────────
mkdir -p "$BIN_DIR"
ln -sf "$TARGET" "$LINK"
info "Linked ${LINK} -> ${TARGET}"

# ── ensure ~/.local/bin is on PATH ───────────────────────────────────────────
case ":${PATH}:" in
  *":${BIN_DIR}:"*) PATH_OK=1 ;;
  *) PATH_OK=0 ;;
esac

if [ "$PATH_OK" -eq 0 ]; then
  SHELL_NAME="$(basename "${SHELL:-}")"
  case "$SHELL_NAME" in
    zsh)  PROFILE="${HOME}/.zshrc" ;;
    bash) [ "$OS" = "Darwin" ] && PROFILE="${HOME}/.bash_profile" || PROFILE="${HOME}/.bashrc" ;;
    *)    PROFILE="${HOME}/.profile" ;;
  esac
  LINE='export PATH="$HOME/.local/bin:$PATH"'
  touch "$PROFILE"
  if ! grep -qsF "$LINE" "$PROFILE"; then
    printf '\n# Added by heimdall installer\n%s\n' "$LINE" >>"$PROFILE"
    info "Added ${BIN_DIR} to PATH in ${PROFILE}"
  fi
  warn "${BIN_DIR} was not on your PATH. Open a new terminal or run: ${BOLD}source ${PROFILE}${RST}"
fi

# ── helpful hints ────────────────────────────────────────────────────────────
HAS_BACKEND=0
for b in claude gemini qwen codex opencode; do
  if command -v "$b" >/dev/null 2>&1; then HAS_BACKEND=1; break; fi
done
if [ "$HAS_BACKEND" -eq 0 ]; then
  warn "No AI backend CLI found on PATH (claude / gemini / qwen / codex / opencode)."
  warn "heimdall needs at least one installed & authenticated to run real scans."
fi

RESOLVED="$(command -v heimdall 2>/dev/null || true)"
if [ -n "$RESOLVED" ] && [ "$RESOLVED" != "$LINK" ]; then
  warn "Another 'heimdall' is earlier on PATH: ${RESOLVED} (it may shadow this install)."
fi

# ── done ─────────────────────────────────────────────────────────────────────
info "Done — heimdall is installed."
cat <<EOF

  ${BOLD}Try it:${RST}
    heimdall --help
    heimdall --dry-run --path .          ${DIM}# list files, no AI calls${RST}
    heimdall --path . --backends codex   ${DIM}# full scan${RST}
    heimdall web                         ${DIM}# dashboard at http://localhost:4040${RST}

  ${DIM}Source: ${REPO_DIR}
  Update: re-run the installer  ·  Uninstall: ${REPO_DIR}/install.sh --uninstall${RST}
EOF
