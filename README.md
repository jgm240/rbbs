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
- **Pastebin and news:** share text by a short code (listed or unlisted, with expiry); read RSS/Atom channels (Hacker News, BBC, Ars Technica, Slashdot, LWN, The Register, NASA, xkcd by default; the sysop edits the list) and add your own feeds. Callers' feeds can only point at public addresses.
- **Chat:** rooms with topics/passwords, `/roll /8ball /ignore /afk /color /challenge`, paging the sysop into a private room.
- **Games, built in:** Chess (own engine), cave Adventure, Hangman, Robots, Snake, Sudoku, Minesweeper, Solitaire.
- **Multiplayer tables:** Tic-Tac-Toe, Connect Four, Battleship, Reversi, Hangman, Word Race.
- **Community:** polls, sysop elections (deputies), weekly trivia, quiz, caller of the month, statistics, 30 achievements, a Today screen.
- **Look:** generated ASCII banners, rotating ANSI art (`art/connect`, `art/rooms/<room>`, `art/boards/<board>`, `art/events/MM-DD_name.ans`), modem speeds, ANSI music, CP437.
- **Today screen:** 64 fortunes and 55 dated history lines (each checked against Wikipedia and the Computer History Museum). `hostbbs op sf` switches today's fortune and history line for everyone (`sf fortune`, `sf history`, `sf 5`, `sf show`, `sf reset`).
- **Several sysops, settings inside the BBS:** `hostbbs op sysop add NAME` (or Sysop tools > Sysops) gives an account full sysop tools; sysops change name, art, features, rooms, boards, modem, forced-message look, timed messages and more from Sysop tools > Configure the BBS. It saves to the config file and applies at once.
- **Running it:** hot reload (saving the config, `kill -HUP`, `hostbbs op reload`), timed messages, styled forced messages,
  `hostbbs op restart` (callers are told first), and `hostbbs op update` (or `hostbbs update`, or `op update` typed by a
  sysop in the BBS): the newest hostbbs from this repository, checked, the old one kept as `hostbbs.old`, then a restart.
- **Log:** `data/hostbbs.log` (rotated) and the console: logins, operator commands, and what callers do in public
  (`anna went into Message boards`, `anna [#random] hi`, posts). Private mail, private messages and pages to the sysop
  are never logged; callers are told at the door.
- **Kids mode and Parent mode:** callers say their age, and every feature has a youngest age; rooms and boards can be
  for kids, teens, under-18s or adults only; adults and under-18s can't write to each other privately or sit at the same
  table; kids under 13 are hidden from other adults; rude words are hidden from the young. Parents make their children's
  accounts (Family), may always write to them, approve who else may, or keep a child to family only. Ages are what
  callers say; they are not checked.
- **Web terminal:** set `"websocket": {"enabled": true, "origins": ["https://jgm240.github.io"]}` and put TLS in front (e.g. Caddy `reverse_proxy 127.0.0.1:8080`); then open the site with `?server=wss://your.host`.

`python3 tools/build_site.py` refreshes `docs/` (the GitHub Pages site, which runs this same file in the browser through Pyodide).

## License
GNU GPL v3 or later. The chess rules code and the BBS server grew out of [Kilobyte](https://github.com/jgm240/kilobyte).
xterm.js (MIT) is vendored in `docs/vendor/`.
