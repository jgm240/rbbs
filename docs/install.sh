#!/bin/sh
# rBBS installer: downloads rBBS, opens the setup dialog, sets the sysop password,
# installs a systemd service and starts it.
#
#   curl -fsSL https://jgm240.github.io/rbbs/install.sh | sh
#
# As a normal user it installs a user service (~/.local/share/rbbs, systemctl --user).
# As root it installs a system service (/opt/rbbs, runs as the user "rbbs").
# Environment: RBBS_DIR (install folder), RBBS_REF (branch, default main), RBBS_NO_DIALOG=1 (skip the
# setup dialog and keep the default settings), RBBS_SRC (use this local checkout instead of downloading).
set -eu

REPO="jgm240/rbbs"
REF="${RBBS_REF:-main}"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null 2>&1 || die "python3 is needed (3.9 or newer)"
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' || die "python3 3.9 or newer is needed"
command -v systemctl >/dev/null 2>&1 || die "systemd (systemctl) was not found; run it by hand with: ./hostbbs"

PY="$(command -v python3)"
if [ "$(id -u)" -eq 0 ]; then
    MODE=system
    DIR="${RBBS_DIR:-/opt/rbbs}"
    SVC_USER=rbbs
    UNIT_DIR=/etc/systemd/system
    SYSTEMCTL="systemctl"
    JOURNAL="journalctl"
    BIN=/usr/local/bin
    WANTED=multi-user.target
else
    MODE=user
    DIR="${RBBS_DIR:-$HOME/.local/share/rbbs}"
    SVC_USER="$(id -un)"
    UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
    SYSTEMCTL="systemctl --user"
    JOURNAL="journalctl --user"
    BIN="$HOME/.local/bin"
    WANTED=default.target
fi

say "Installing rBBS into $DIR ($MODE service)"
mkdir -p "$DIR" "$BIN"
if [ "$MODE" = system ] && ! id "$SVC_USER" >/dev/null 2>&1; then
    useradd --system --home-dir "$DIR" --shell /usr/sbin/nologin "$SVC_USER" 2>/dev/null \
        || die "could not create the user $SVC_USER"
fi

# ---- the files: hostbbs, the art, the license
if [ -n "${RBBS_SRC:-}" ]; then
    cp "$RBBS_SRC/hostbbs" "$RBBS_SRC/LICENSE" "$DIR/"
    rm -rf "$DIR/art" && cp -R "$RBBS_SRC/art" "$DIR/art"
else
    command -v curl >/dev/null 2>&1 || die "curl is needed"
    command -v tar >/dev/null 2>&1 || die "tar is needed"
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    curl -fsSL "https://github.com/$REPO/archive/refs/heads/$REF.tar.gz" -o "$TMP/rbbs.tar.gz" || die "download failed"
    tar -xzf "$TMP/rbbs.tar.gz" -C "$TMP"
    SRC="$(find "$TMP" -maxdepth 1 -type d -name 'rbbs-*' | head -n 1)"
    [ -f "$SRC/hostbbs" ] || die "the download has no hostbbs file"
    cp "$SRC/hostbbs" "$SRC/LICENSE" "$DIR/"
    rm -rf "$DIR/art" && cp -R "$SRC/art" "$DIR/art"
fi
chmod 755 "$DIR/hostbbs"
export HOSTBBS_HOME="$DIR"

# ---- first settings: rotating art on
cd "$DIR"
[ -f hostbbs.json ] || "$PY" -c 'import json; json.dump({"art_dir": "art"}, open("hostbbs.json", "w"), indent=2)'

# ---- the setup dialog (needs a terminal; the pipe from curl is not one)
if [ -z "${RBBS_NO_DIALOG:-}" ]; then
    if [ -r /dev/tty ]; then
        say "Opening the setup dialog. Choose \"Save and restart the BBS\" when you are done."
        set +e
        HOSTBBS_SERVICE=1 "$PY" "$DIR/hostbbs" setup </dev/tty >/dev/tty 2>&1
        rc=$?
        set -e
        [ "$rc" -eq 10 ] || [ "$rc" -eq 0 ] || die "the setup dialog failed (status $rc)"
        [ "$rc" -eq 10 ] || say "You left the dialog without choosing Save and restart; the saved settings are used."
    else
        say "No terminal for the setup dialog; using the default settings (run: rbbs config)."
    fi
fi

# ---- permissions for the service user
[ "$MODE" = system ] && chown -R "$SVC_USER" "$DIR"

# ---- sysop password
SYSOP="$("$PY" -c 'import json; print(json.load(open("hostbbs.json")).get("sysop", "sysop"))')"
PW="$("$PY" -c 'import secrets; print(secrets.token_urlsafe(9))')"
if [ "$MODE" = system ]; then
    printf '%s\n' "$PW" | su -s /bin/sh "$SVC_USER" -c "HOSTBBS_HOME='$DIR' '$PY' '$DIR/hostbbs' passwd" >/dev/null
else
    printf '%s\n' "$PW" | "$PY" "$DIR/hostbbs" passwd >/dev/null
fi

# ---- the service
mkdir -p "$UNIT_DIR"
{
    echo "[Unit]"
    echo "Description=rBBS bulletin board"
    echo "After=network.target"
    echo
    echo "[Service]"
    [ "$MODE" = system ] && echo "User=$SVC_USER"
    echo "Environment=HOSTBBS_HOME=$DIR"
    echo "WorkingDirectory=$DIR"
    echo "ExecStart=$PY $DIR/hostbbs run"
    echo "Restart=on-failure"
    echo "RestartSec=3"
    echo
    echo "[Install]"
    echo "WantedBy=$WANTED"
} > "$UNIT_DIR/rbbs.service"

# ---- the "rbbs" command: config, logs, op, status
cat > "$BIN/rbbs" <<WRAP
#!/bin/sh
# rbbs config | status | logs | restart | op ... | (anything else goes to hostbbs)
export HOSTBBS_HOME="$DIR"
SC="$SYSTEMCTL"
JC="$JOURNAL"
case "\${1:-}" in
    config)  HOSTBBS_SERVICE=1 "$PY" "$DIR/hostbbs" setup; [ \$? -eq 10 ] && \$SC restart rbbs; exit 0 ;;
    status)  exec \$SC status rbbs ;;
    restart) exec \$SC restart rbbs ;;
    logs)    exec \$JC -u rbbs -n 50 --no-pager ;;
    *)       exec "$PY" "$DIR/hostbbs" "\$@" ;;
esac
WRAP
chmod 755 "$BIN/rbbs"

say "Starting the service"
$SYSTEMCTL daemon-reload
$SYSTEMCTL enable --now rbbs
if [ "$MODE" = user ] && command -v loginctl >/dev/null 2>&1; then
    loginctl enable-linger "$(id -un)" 2>/dev/null \
        || say "To keep it running after you log out: sudo loginctl enable-linger $(id -un)"
fi

PORT="$("$PY" -c 'import json; print(json.load(open("hostbbs.json")).get("port", 2323))')"
echo
say "rBBS is running."
echo "    connect:   telnet localhost $PORT"
echo "    sysop:     $SYSOP  /  $PW        (shown once; change it with: rbbs passwd)"
echo "    manage:    rbbs config | status | logs | restart | op help    (in $BIN)"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "    note:      add $BIN to your PATH to use the rbbs command" ;; esac
