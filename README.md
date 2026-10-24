# rBBS (hostbbs)

A bulletin board system in one dependency-free Python 3.9+ file: boards, mail, chat, games, multiplayer,
voting, ANSI art, and an operator console. Try it in your browser: **https://jgm240.github.io/rbbs/**

## Install as a service (Linux with systemd)

    curl -fsSL https://jgm240.github.io/rbbs/install.sh | sh

It downloads rBBS, opens the setup dialog, sets a sysop password (shown once), installs a systemd service and
starts it. As a normal user that is a user service in `~/.local/share/rbbs`; as root a system service in `/opt/rbbs`
running as the user `rbbs`. Afterwards: `rbbs config | status | logs | restart | op help`.

## By hand

    ./hostbbs            # setup dialog (raspi-config style); "Save and start" runs it
    ./hostbbs run        # start from the saved settings, then: telnet localhost 2323
    ./hostbbs op help    # kick, ban, mute, force (urgent message on every screen), polls, elections, reload...

Settings live in `~/hostbbs/hostbbs.json` (or `-c FILE`), data in `data/` next to it.

## What is in it
- **Boards and people:** threaded boards with a new-since-last-call scan, private mail, oneliner wall, profiles, last callers.
- **Chat:** rooms with topics/passwords, `/roll /8ball /ignore /afk /color /challenge`, paging the sysop into a private room.
- **Games, built in:** Chess (own engine), cave Adventure, Hangman, Robots, Snake, Sudoku, Minesweeper, Solitaire.
- **Multiplayer tables:** Tic-Tac-Toe, Connect Four, Battleship, Reversi, Hangman, Word Race.
- **Community:** polls, sysop elections (deputies), weekly trivia, quiz, caller of the month, statistics, 30 achievements, a Today screen.
- **Look:** generated ASCII banners, rotating ANSI art (`art/connect`, `art/rooms/<room>`, `art/boards/<board>`, `art/events/MM-DD_name.ans`), modem speeds, ANSI music, CP437.
- **Several sysops, settings inside the BBS:** `hostbbs op sysop add NAME` (or Sysop tools > Sysops) gives an account full sysop tools; sysops change name, art, features, rooms, boards, modem, forced-message look, timed messages and more from Sysop tools > Configure the BBS. It saves to the config file and applies at once.
- **Running it:** hot reload (saving the config, `kill -HUP`, `hostbbs op reload`), timed messages, rotated log, styled forced messages.
- **Web terminal:** set `"websocket": {"enabled": true, "origins": ["https://jgm240.github.io"]}` and put TLS in front (e.g. Caddy `reverse_proxy 127.0.0.1:8080`); then open the site with `?server=wss://your.host`.

`python3 tools/build_site.py` refreshes `docs/` (the GitHub Pages site, which runs this same file in the browser through Pyodide).

## License
GNU GPL v3 or later. The chess rules code and the BBS server grew out of [Kilobyte](https://github.com/jgm240/kilobyte).
xterm.js (MIT) is vendored in `docs/vendor/`.
