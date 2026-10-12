"""Builds the Components Map swimlane diagram (SVG) from the data below.

Outputs (next to this file):
  map.svg        - theme-aware (CSS variables), embedded in components-map.html
  map-light.svg  - literal light colours, for exporting a PNG
Run: python3 docs/components-map/build.py
"""
from pathlib import Path
import textwrap

COLS = ["TRIGGER", "INPUT", "CONTEXT", "PROCESSING", "OUTPUT"]
LANES = [
    ("aditya", "ADITYA", "(Host)"),
    ("cron", "VERCEL CRON", "(Scheduler)"),
    ("app", "RADAR APP", "(Next.js on Vercel)"),
    ("feeds", "PODCAST FEEDS", "(RSS + YouTube)"),
    ("gemini", "GEMINI FLASH", "(LLM)"),
    ("db", "SUPABASE", "(Database)"),
    ("resend", "RESEND", "(Email)"),
]

# id, lane, column, text, is_gemini
NODES = [
    ("A1", "aditya", "TRIGGER", "Edits shows, weights & deep-read cap in Settings", False),
    ("A2", "aditya", "OUTPUT", "Reads Monday brief: book · ride/counter · pitch", False),
    ("A3", "aditya", "OUTPUT", "Browses dashboard by date (As sent / Explore)", False),
    ("C1", "cron", "TRIGGER", "Daily 5:30 AM IST run; Monday run also sends the brief", False),
    ("P1", "app", "INPUT", "Run orchestrator: one job per show, 3 at a time", False),
    ("P2", "app", "PROCESSING", "score(): gates, weights, New / Rising / Repeat", False),
    ("P3", "app", "OUTPUT", "Dashboard, archive & run log on public URL", False),
    ("F1", "feeds", "INPUT", "10 India + 5 global shows: titles, show notes, links", False),
    ("F2", "feeds", "CONTEXT", "Public YouTube video matched to each India episode", False),
    ("G1", "gemini", "CONTEXT", "Episode extractor: guests, topics + stance, brands", True),
    ("G2", "gemini", "CONTEXT", "Sponsor deep-read: spoken reads + timestamps", True),
    ("G3", "gemini", "PROCESSING", "Entity resolver: merges name & theme variants", True),
    ("G4", "gemini", "PROCESSING", "Link finder: LinkedIn + site via Google Search", True),
    ("G5", "gemini", "PROCESSING", "Brief writer: why now + India angle, fact-checked", True),
    ("S1", "db", "INPUT", "Stores shows, weights & settings", False),
    ("S2", "db", "CONTEXT", "Stores episodes, people, topics, brands & mentions", False),
    ("S3", "db", "OUTPUT", "Stores every brief as sent + run log & spend", False),
    ("R1", "resend", "OUTPUT", "Emails the brief every Monday before 7:30 AM IST", False),
]

EDGES = [
    ("A1", "S1"), ("C1", "P1"), ("S1", "P1"), ("P1", "F1"), ("F1", "G1"), ("F1", "F2"),
    ("F2", "G2"), ("G1", "G3"), ("G2", "G3"), ("G3", "S2"), ("S2", "P2"), ("P2", "G4"),
    ("P2", "G5"), ("G4", "G5"), ("G5", "S3"), ("G5", "R1"), ("R1", "A2"), ("S3", "P3"), ("P3", "A3"),
]

# geometry
LABEL_W, COL_W, HEAD_H = 150, 250, 44
BOX_W, LINE_H, BOX_PAD, GAP, LANE_PAD = 184, 13, 9, 14, 18
W = LABEL_W + COL_W * len(COLS)

def wrap(t):
    return textwrap.wrap(t, 27)

def box_h(t):
    return len(wrap(t)) * LINE_H + BOX_PAD * 2

cells = {}
for n in NODES:
    cells.setdefault((n[1], n[2]), []).append(n)

lane_y, y = {}, HEAD_H
for key, *_ in LANES:
    tallest = max([sum(box_h(n[3]) for n in cells.get((key, c), [])) + GAP * (len(cells.get((key, c), [])) - 1) for c in COLS] + [0])
    h = max(78, tallest + LANE_PAD * 2)
    lane_y[key] = (y, h)
    y += h
H = y

pos = {}
for (lane, col), ns in cells.items():
    ly, lh = lane_y[lane]
    total = sum(box_h(n[3]) for n in ns) + GAP * (len(ns) - 1)
    cy = ly + (lh - total) / 2
    cx = LABEL_W + COLS.index(col) * COL_W + (COL_W - BOX_W) / 2
    for n in ns:
        h = box_h(n[3])
        pos[n[0]] = (cx, cy, BOX_W, h)
        cy += h + GAP

node_by = {n[0]: n for n in NODES}


def render(themed: bool) -> str:
    c = (lambda var, lit: f"var({var})") if themed else (lambda var, lit: lit)
    bg, panel, line, grid, ink, mute, gfill, gline = (
        c("--panel", "#ffffff"), c("--panel", "#ffffff"), c("--line", "#26302b"), c("--grid", "#cfd8d2"),
        c("--ink", "#18211c"), c("--mute", "#5b6a61"), c("--gfill", "#e4f1e8"), c("--accent", "#2f6b4f"),
    )
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H + 2}" width="{W}" height="{H + 2}" font-family="Manrope, Helvetica, Arial, sans-serif" role="img" aria-labelledby="t d">',
           '<title id="t">Podcast Ecosystem Radar components map</title>',
           '<desc id="d">Swimlane diagram: lanes for Aditya, Vercel Cron, the Radar app, podcast feeds, Gemini Flash, Supabase and Resend across trigger, input, context, processing and output.</desc>',
           f'<defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="{line}"/></marker></defs>',
           f'<rect x="0" y="0" width="{W}" height="{H + 2}" fill="{bg}"/>']
    # column headers + dotted header rule with nodes
    out.append(f'<line x1="{LABEL_W}" y1="{HEAD_H / 2}" x2="{W}" y2="{HEAD_H / 2}" stroke="{grid}" stroke-dasharray="2 3"/>')
    for i, col in enumerate(COLS):
        x = LABEL_W + i * COL_W
        tw = len(col) * 8.6 + 18
        out.append(f'<rect x="{x + COL_W / 2 - tw / 2}" y="{HEAD_H / 2 - 9}" width="{tw}" height="18" fill="{bg}"/>')
        out.append(f'<text x="{x + COL_W / 2}" y="{HEAD_H / 2 + 4}" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="1.2" fill="{ink}">{col}</text>')
        if i:
            out.append(f'<circle cx="{x}" cy="{HEAD_H / 2}" r="2.5" fill="{gline}"/>')
            out.append(f'<line x1="{x}" y1="{HEAD_H}" x2="{x}" y2="{H}" stroke="{grid}" stroke-width="1"/>')
    # lane grid
    out.append(f'<rect x="1" y="{HEAD_H}" width="{W - 2}" height="{H - HEAD_H}" fill="none" stroke="{line}" stroke-width="1"/>')
    out.append(f'<line x1="{LABEL_W}" y1="{HEAD_H}" x2="{LABEL_W}" y2="{H}" stroke="{line}"/>')
    for key, name, sub in LANES:
        ly, lh = lane_y[key]
        out.append(f'<line x1="1" y1="{ly}" x2="{W - 1}" y2="{ly}" stroke="{line}" stroke-width="1"/>')
        out.append(f'<text x="{LABEL_W / 2}" y="{ly + lh / 2 - 2}" text-anchor="middle" font-size="11.5" font-weight="700" letter-spacing=".5" fill="{ink}">{name}</text>')
        out.append(f'<text x="{LABEL_W / 2}" y="{ly + lh / 2 + 13}" text-anchor="middle" font-size="10.5" fill="{mute}">{sub}</text>')

    # edges (drawn under boxes)
    gutter_count = {}
    def off(k):
        gutter_count[k] = gutter_count.get(k, 0) + 1
        return (gutter_count[k] - 1) * 6

    for a, b in EDGES:
        ax, ay, aw, ah = pos[a]
        bx, by, bw, bh = pos[b]
        ca, cb = COLS.index(node_by[a][2]), COLS.index(node_by[b][2])
        amy, bmy = ay + ah / 2, by + bh / 2
        same_lane = node_by[a][1] == node_by[b][1]
        if ca == cb and same_lane:  # stacked in one cell
            d = f"M{ax + aw / 2},{ay + ah} L{bx + bw / 2},{by}"
            start = (ax + aw / 2, ay + ah)
        elif ca == cb:  # same column, other lane: route along the column's right gutter
            gx = LABEL_W + (ca + 1) * COL_W - 14 - off(("col", ca))
            d = f"M{ax + aw},{amy} L{gx},{amy} L{gx},{bmy} L{bx + bw},{bmy}"
            start = (ax + aw, amy)
        elif cb > ca:  # forward
            gx = LABEL_W + (ca + 1) * COL_W + 0 - 8 + off(("fwd", ca))
            d = f"M{ax + aw},{amy} L{gx},{amy} L{gx},{bmy} L{bx},{bmy}"
            start = (ax + aw, amy)
        else:  # backward: leave from the left, enter the target's right side
            gx = LABEL_W + ca * COL_W + 8 - off(("back", ca))
            d = f"M{ax},{amy} L{gx},{amy} L{gx},{bmy} L{bx + bw},{bmy}"
            start = (ax, amy)
        out.append(f'<path d="{d}" fill="none" stroke="{line}" stroke-width="1" stroke-dasharray="2.5 2.5" marker-end="url(#ah)"/>')
        out.append(f'<circle cx="{start[0]}" cy="{start[1]}" r="2.2" fill="{gline}"/>')

    # boxes
    for nid, lane, col, text, gem in NODES:
        x, y0, w, h = pos[nid]
        out.append(f'<rect x="{x}" y="{y0}" width="{w}" height="{h}" rx="2" fill="{gfill if gem else panel}" stroke="{gline if gem else line}" stroke-width="{1.4 if gem else 1}"/>')
        lines = wrap(text)
        for i, ln in enumerate(lines):
            ty = y0 + BOX_PAD + LINE_H * (i + 0.8)
            ln = ln.replace("&", "&amp;")
            out.append(f'<text x="{x + w / 2}" y="{ty}" text-anchor="middle" font-size="10.5" fill="{ink}">{ln}</text>')
    out.append("</svg>")
    return "\n".join(out)


here = Path(__file__).parent
(here / "map.svg").write_text(render(True))
(here / "map-light.svg").write_text(render(False))
print(f"wrote map.svg and map-light.svg ({W}x{H})")
