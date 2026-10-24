#!/usr/bin/env python3
"""Refresh docs/ (the GitHub Pages site) from the sources.

    python3 tools/build_site.py

Copies hostbbs to docs/hostbbs.py (the browser demo runs that very file), copies art/ to docs/art/,
writes docs/art/manifest.json (what the demo loads) and docs/art/gallery.json (the connect and event
screens, rendered to HTML for the gallery).
"""
import html
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

VGA = ["#000000", "#0000aa", "#00aa00", "#00aaaa", "#aa0000", "#aa00aa", "#aa5500", "#aaaaaa",
       "#555555", "#5555ff", "#55ff55", "#55ffff", "#ff5555", "#ff55ff", "#ffff55", "#ffffff"]
SW = lambda i: (i & 8) | ((i & 1) << 2) | (i & 2) | ((i & 4) >> 2)     # ANSI color number <-> PC color number


def decode_ans(data, width=80):
    """Render a simple .ans file (SGR colors and text, CP437) to HTML."""
    data = data.split(b"\x1a")[0]
    fg, bg, bold, blink = 7, 0, False, False
    rows, row, x = [], [], 0
    i = 0
    while i < len(data):
        c = data[i]
        i += 1
        if c == 27 and i < len(data) and data[i] == 0x5B:
            j = i + 1
            while j < len(data) and not 0x40 <= data[j] <= 0x7E:
                j += 1
            params, final = data[i + 1:j].decode("ascii", "replace"), chr(data[j]) if j < len(data) else ""
            i = j + 1
            if final == "m":
                for p in [int(v) if v.isdigit() else 0 for v in params.split(";")] or [0]:
                    if p == 0:
                        fg, bg, bold, blink = 7, 0, False, False
                    elif p == 1:
                        bold = True
                    elif p in (5, 6):
                        blink = True
                    elif 30 <= p <= 37:
                        fg = SW(p - 30)
                    elif 40 <= p <= 47:
                        bg = SW(p - 40)
            continue
        if c == 13:
            continue
        if c == 10:
            rows.append(row)
            row, x = [], 0
            continue
        ch = bytes([c]).decode("cp437") if c >= 32 and c != 127 else " "
        row.append((ch, fg | (8 if bold else 0), bg | (8 if blink else 0)))
    if row:
        rows.append(row)
    while rows and not any(ch != " " or b for ch, f, b in rows[-1]):
        rows.pop()
    while rows and not any(ch != " " or b for ch, f, b in rows[0]):
        rows.pop(0)
    out = []
    for r in rows:
        while r and r[-1][0] == " " and r[-1][2] == 0:
            r.pop()
        spans, cur, buf = [], None, ""
        for ch, f, b in r:
            key = (f, b) if ch != " " or b else (7, 0)
            if key != cur and buf:
                spans.append((cur, buf))
                buf = ""
            cur = key
            buf += ch
        if buf:
            spans.append((cur, buf))
        line = ""
        for (f, b), text in spans:
            style = "color:%s" % VGA[f] + (";background:%s" % VGA[b] if b else "")
            line += '<span style="%s">%s</span>' % (style, html.escape(text)) if (f, b) != (7, 0) else html.escape(text)
        out.append(line)
    return "\n".join(out)


def main():
    shutil.copyfile(ROOT / "hostbbs", DOCS / "hostbbs.py")
    art_src, art_dst = ROOT / "art", DOCS / "art"
    if art_dst.exists():
        shutil.rmtree(art_dst)
    shutil.copytree(art_src, art_dst, ignore=shutil.ignore_patterns(".DS_Store", "*~"))
    files = sorted(str(p.relative_to(art_dst)) for p in art_dst.rglob("*") if p.is_file())
    (art_dst / "manifest.json").write_text(json.dumps(files))
    gallery = []
    for sub, label in (("connect", "connect screen"), ("events", "event screen")):
        for p in sorted((art_src / sub).glob("*.ans")):
            name = p.stem.split("_", 2)[-1] if sub == "events" and "_" in p.stem else p.stem
            gallery.append({"name": "%s %s" % (label, name), "html": decode_ans(p.read_bytes())})
    (art_dst / "gallery.json").write_text(json.dumps(gallery))
    print("docs/: hostbbs.py (%d bytes), %d art files, %d gallery screens" % (
        (DOCS / "hostbbs.py").stat().st_size, len(files), len(gallery)))


if __name__ == "__main__":
    main()
