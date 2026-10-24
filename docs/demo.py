"""The rBBS browser demo: the real hostbbs.py, running in Pyodide, one private BBS per browser.

worker.js loads Pyodide, writes hostbbs.py and the art folder into the virtual file system, mounts
IndexedDB at /data (so users, posts, scores and mail survive a reload) and then calls into this file.
"""
import asyncio
import copy
import importlib.util
import os
import random
import sys
import time
from pathlib import Path

hb = None          # the hostbbs module
bbs = None         # the one BBS of this browser
post = None        # JS callback: post(kind, payload)
reader = None


def load_module(path="/home/pyodide/hostbbs.py"):
    global hb
    spec = importlib.util.spec_from_file_location("hostbbs", path)
    hb = importlib.util.module_from_spec(spec)
    sys.modules["hostbbs"] = hb
    spec.loader.exec_module(hb)
    hb.PBKDF2_ITERATIONS = 2000      # (no OpenSSL here: the pure-Python hash is slow)
    return hb


def set_timezone(offset_minutes):
    """Python in the browser knows no time zone; give it the browser's current offset."""
    sign = "-" if offset_minutes >= 0 else "+"
    m = abs(offset_minutes)
    os.environ["TZ"] = "BRW%s%02d:%02d" % (sign, m // 60, m % 60)
    try:
        time.tzset()
    except AttributeError:
        pass


class DemoBot:
    """A friendly regular in a chat room. It quacks like a Session just enough for Room.say."""
    ignored = set()
    afk = ""

    def __init__(self, room, name, lines):
        self.room, self.name, self.lines, self.last = room, name, lines, 0
        room.members.add(self)

    def push(self, text):
        pass

    def fmt_chat(self, e):
        if e["kind"] == "msg" and e["who"] not in BOTS and time.time() - self.last > 4 and random.random() < 0.7:
            self.last = time.time()
            asyncio.ensure_future(self.reply(e))
        return ""

    async def reply(self, e):
        await asyncio.sleep(1.2 + random.random() * 1.5)
        text = e["text"].lower()
        if any(w in text for w in ("hello", "hi ", "hey", "howdy")) or text in ("hi", "yo"):
            line = random.choice(["Hello %s! Welcome to the rBBS demo." % e["who"], "Hey %s, good to see you on the board." % e["who"]])
        elif "?" in text:
            line = random.choice(["Good question. Try the Trivia & quiz from the main menu.",
                                  "No idea, but the Today screen has a fortune for you.",
                                  "Ask the sysop. In this demo that is you: log in as sysop / sysop."])
        else:
            line = random.choice(self.lines)
        self.room.say("msg", self.name, line)


BOTS = ("ada", "grace")


def demo_config(opts):
    cfg = copy.deepcopy(hb.DEFAULTS)
    hb.merge(cfg, {
        "name": "rBBS",
        "tagline": "Dial in, log on, hang out. Right here in your browser.",
        "color": True,
        "sysop": "sysop",
        "data_dir": "/data/bbs",
        "art_dir": "/art",
        "art_rotation": "random",
        "max_users": 4,
        "idle_timeout": 3600,
        "log": False,
        "motd": ["This is a private demo: nothing leaves your browser.",
                 "Log in as guest, register, or use sysop / sysop for the sysop tools."],
        "features": {"files": False, "apps": True, "games": True, "elections": True, "guests": True, "news": False},
        "apps": ["calculator", "calendar"],
        "games": ["adventure", "hangman", "robots", "snake", "sudoku", "chess", "minesweeper", "solitaire"],
        "modem": {"baud": int(opts.get("baud", 0)), "ask": False, "handshake": True},
        "music": {"enabled": bool(opts.get("music")), "ask": False,
                  "connect": "T200 O4 L8 C E G O5 L4 C", "achievement": "T240 O5 L16 E G O6 L8 C"},
        "election": {"days": 7, "seats": 1, "min_calls": 1},
        "websocket": {"enabled": False},
        "autoreload": False,
    })
    return hb.finalize(cfg, Path("/data"))


async def seed(b):
    """Sample users, messages, a poll and chat regulars, once per browser."""
    if b.meta.get("seeded"):
        return
    now = time.time()
    await b.make_user("sysop", "sysop")
    b.users["sysop"]["sysop"] = True
    for name, since in (("ada", 40), ("grace", 31), ("linus", 12), ("margaret", 5)):
        u = await b.make_user(name, "demo-%s" % name)
        u["calls"], u["created"], u["last"] = random.randint(8, 60), now - since * 86400, now - random.randint(1, 5) * 86400
        u["profile"] = {"computer": {"ada": "Amiga 500", "grace": "Commodore 64", "linus": "386 with 4MB RAM", "margaret": "Apple IIe"}[name],
                        "location": {"ada": "Vienna", "grace": "Arlington", "linus": "Helsinki", "margaret": "Boston"}[name],
                        "bio": ["Collects floppy disks.", "Keeps the modem warm."][:1 + (len(name) % 2)]}
    b.meta["calls"] = 137
    b.boards["General"] = [
        {"id": 1, "ts": now - 6 * 86400, "author": "ada", "subject": "Welcome to rBBS", "body": [
            "Glad you found the board. Say hello, play a game, post something.", "", "Tip: press ? in the editors, T toggles color."]},
        {"id": 2, "ts": now - 5 * 86400, "author": "linus", "subject": "Re: Welcome to rBBS", "reply": 1, "body": [
            "ada wrote:", "> Glad you found the board.", "", "Thanks! Anyone up for a Connect Four tournament?"]},
        {"id": 3, "ts": now - 2 * 86400, "author": "grace", "subject": "Best 8-bit machine?", "body": [
            "Settle it: C64, Spectrum, or Apple II? Vote in the booth (V)."]},
    ]
    b.boards["Announcements"] = [
        {"id": 1, "ts": now - 86400, "author": "sysop", "subject": "About this demo", "body": [
            "This BBS runs entirely in your browser (Python via Pyodide).", "Everything you post stays on your device.",
            "Chat, multiplayer and the web terminal for a real server need a live hostbbs: see the GitHub page."]}]
    b.meta["oneliners"] = [
        {"name": "ada", "ts": now - 7200, "text": "Just got CONNECT 2400 at last."},
        {"name": "linus", "ts": now - 3600, "text": "Hello world from the demo!"},
        {"name": "grace", "ts": now - 600, "text": "Anyone remember Zork?"}]
    p = b.poll_add("Best 8-bit machine?", ["Commodore 64", "ZX Spectrum", "Apple II", "Amstrad CPC"])
    for who, idx in (("ada", 0), ("grace", 0), ("linus", 1), ("margaret", 2)):
        p["votes"][who] = idx
    b.callers = None
    b.meta["callers"] = [{"name": n, "ts": now - random.randint(1, 20) * 3600, "secs": random.randint(120, 1500)} for n in ("grace", "ada", "linus")]
    b.meta["seeded"] = True
    b.save("users", b.users)
    b.save("boards", b.boards)
    b.save("polls", b.polls)
    b.save("meta", b.meta)


def add_bots(b):
    lobby = b.rooms.get("lobby")
    if lobby and not any(isinstance(m, DemoBot) for m in lobby.members):
        DemoBot(lobby, "ada", ["I am more of a command-line person.", "Have you tried /roll 2d6?", "Nice. Which computer are you on?"])
        DemoBot(lobby, "grace", ["Tell me more!", "That reminds me of my old C64.", "Try the quiz, it is fun."])
        if not lobby.history:
            lobby.say("msg", "ada", "Welcome! This lobby is quiet because it is your private demo.")
            lobby.say("msg", "grace", "Say something and we will answer. /help lists the chat commands.")


async def housekeeping():
    while True:
        await asyncio.sleep(6)
        try:
            bbs.run_schedule()
            bbs.elect_check()
        except Exception:
            pass


async def setup(opts, post_fn):
    """Build the BBS. Called once the files are in place."""
    global bbs, post
    post = post_fn
    set_timezone(int(opts.get("tz", 0)))
    cfg = demo_config(opts)
    Path(cfg["data_dir"]).mkdir(parents=True, exist_ok=True)
    bbs = hb.BBS(cfg)
    await seed(bbs)
    add_bots(bbs)
    asyncio.ensure_future(housekeeping())
    return True


class JSWriter:
    def __init__(self):
        self.closed = False

    def write(self, data):
        if not self.closed:
            post("out", bytes(data).decode("latin-1"))

    async def drain(self):
        await asyncio.sleep(0)

    def close(self):
        if not self.closed:
            self.closed = True
            post("closed", "")

    def is_closing(self):
        return self.closed

    def get_extra_info(self, *a):
        return ("browser", 0)


async def call(opts, rd):
    """One caller: build a Session on a fresh reader/writer pair and run it until the caller leaves."""
    cfg = bbs.cfg
    cfg["modem"]["baud"] = int(opts.get("baud", 0))
    cfg["music"]["enabled"] = bool(opts.get("music"))
    writer = JSWriter()
    try:
        await hb.Session(bbs, rd, writer).run()
    finally:
        writer.close()


def start_call(opts):
    global reader
    reader = asyncio.StreamReader()       # (made now, so keys typed before the task starts are kept)
    asyncio.ensure_future(call(opts, reader))


def feed(data):
    """Bytes from the terminal, as a latin-1 string."""
    if reader is not None:
        reader.feed_data(data.encode("latin-1"))


def reset_data():
    import shutil
    shutil.rmtree("/data/bbs", ignore_errors=True)
