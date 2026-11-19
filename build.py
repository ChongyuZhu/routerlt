#!/usr/bin/env python3
"""Build the dependency-free RouteRLT project website into docs/ for GitHub Pages."""
import base64
from html import escape
import json
from pathlib import Path
import re
import shutil
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
OUT = ROOT / "docs"
data = json.loads((ROOT / "content/site.json").read_text(encoding="utf-8"))


def text(value):
    return escape(str(value), quote=True)


def rich_cell(value):
    """Allow **bold** highlights inside table cells while escaping all HTML."""
    raw = str(value)
    parts = re.split(r"(\*\*.*?\*\*)", raw)
    out = []
    for part in parts:
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            out.append(f"<strong>{text(part[2:-2])}</strong>")
        else:
            out.append(text(part))
    return "".join(out)


def link(value):
    if not isinstance(value, str) or urlsplit(value).scheme not in ("http", "https"):
        raise ValueError(f"Expected an HTTP(S) link: {value!r}")
    return text(value)


def asset(path):
    if not isinstance(path, str) or not path.startswith("assets/media/"):
        raise ValueError(f"Media paths must begin with assets/media/: {path!r}")
    source = (WEB / path).resolve()
    if not source.is_relative_to((WEB / "assets/media").resolve()) or not source.is_file():
        raise ValueError(f"Media file is missing or outside web/assets/media/: {path}")
    if source.stat().st_size >= 100 * 1024 * 1024:
        raise ValueError(f"{path} exceeds 100 MiB GitHub file size limit.")
    return text(path)


def render_table(columns, rows):
    thead = "<thead><tr>" + "".join(f'<th scope="col">{text(c)}</th>' for c in columns) + "</tr></thead>"
    tbody = "<tbody>" + "".join(
        "<tr>" + "".join(f"<td>{rich_cell(cell)}</td>" for cell in row) + "</tr>"
        for row in rows
    ) + "</tbody>"
    return f'<div class="results-table-wrap"><table class="results-table">{thead}{tbody}</table></div>'


def render_reentry_cards(real_item, sim_item):
    tri_views = "".join(
        f'<div class="tri-view-item">'
        f'<video controls autoplay muted loop playsinline data-rate="2" preload="metadata" poster="{asset(v["poster"])}" aria-label="{text(v["label"])} camera view">'
        f'<source src="{asset(v["src"])}" type="video/mp4"></video>'
        f'<span class="view-tag">{text(v["label"])}</span></div>'
        for v in real_item["views"]
    )
    real_card = (
        f'<article class="video-card" id="video-real-reentry">'
        f'<div class="tri-view-grid">{tri_views}</div>'
        f'<div class="video-card-body"><span class="video-badge">{text(real_item["badge"])}</span>'
        f'<h3>{text(real_item["title"])}</h3><p>{text(real_item["caption"])}</p></div></article>'
    )
    sim_card = (
        f'<article class="video-card" id="video-sim-reentry">'
        f'<video controls autoplay muted loop playsinline preload="metadata" poster="{asset(sim_item["poster"])}" aria-label="{text(sim_item["alt"])}">'
        f'<source src="{asset(sim_item["src"])}" type="video/mp4"></video>'
        f'<div class="video-card-body"><span class="video-badge">{text(sim_item["badge"])}</span>'
        f'<h3>{text(sim_item["title"])}</h3><p>{text(sim_item["caption"])}</p></div></article>'
    )
    return real_card + sim_card


def render_plus_cards(items):
    cards = []
    for item in items:
        b = item["base"]
        m = item["method"]
        cards.append(
            f'<article class="video-card" id="video-{text(item["id"])}">'
            f'<div class="pair-compare-grid">'
            f'<div class="pair-item"><video controls autoplay muted loop playsinline preload="metadata" poster="{asset(b["poster"])}" aria-label="{text(b["label"])}">'
            f'<source src="{asset(b["src"])}" type="video/mp4"></video><span class="pair-tag tag-base">{text(b["label"])}</span></div>'
            f'<div class="pair-item"><video controls autoplay muted loop playsinline preload="metadata" poster="{asset(m["poster"])}" aria-label="{text(m["label"])}">'
            f'<source src="{asset(m["src"])}" type="video/mp4"></video><span class="pair-tag tag-method">{text(m["label"])}</span></div>'
            f'</div>'
            f'<div class="video-card-body"><span class="video-badge">{text(item["badge"])}</span>'
            f'<h3>{text(item["title"])}</h3><p>{text(item["caption"])}</p></div></article>'
        )
    return "".join(cards)


authors = " ".join(
    f'<a href="{link(a["url"])}" target="_blank" rel="noopener">{text(a["name"])}</a>'
    if a.get("url")
    else f'<span>{text(a["name"])}</span>'
    for a in data["authors"]
)
affiliations = " · ".join(text(a) for a in data["affiliations"])

real = data["realRobot"]
real_stats_html = "".join(
    f'<div class="stat-pill"><div class="stat-val">{text(s["value"])}</div>'
    f'<div class="stat-label">{text(s["label"])}</div></div>'
    for s in real["stats"]
)

values = {
    "PAGE_TITLE": text(f'{data["title"]}: {data["fullTitle"]}'),
    "DESCRIPTION": text(data["tldr"]),
    "VENUE": text(data["venue"]),
    "SECONDARY_VENUE": text(data["secondaryVenue"]),
    "TITLE": text(data["title"]),
    "SUBTITLE": text(data["subtitle"]),
    "AUTHORS": authors,
    "AFFILIATIONS": affiliations,
    "PAPER": link(data["links"]["paper"]),
    "PDF": link(data["links"]["pdf"]),
    "HOMEPAGE": link(data["links"]["homepage"]),
    "TLDR": text(data["tldr"]),
    "ABSTRACT": text(data["abstract"]),
    "REAL_VIDEO": asset(real["video"]),
    "REAL_POSTER": asset(real["poster"]),
    "REAL_ALT": text(real["alt"]),
    "REAL_CAPTION": text(real["caption"]),
    "REAL_STATS": real_stats_html,
    "REENTRY_CARDS": render_reentry_cards(data["reentryReal"], data["reentrySim"]),
    "PLUS_CARDS": render_plus_cards(data["liberoPlus"]),
    "OVERVIEW_FIG_SRC": asset(data["method"]["overviewFigure"]["src"]),
    "OVERVIEW_FIG_ALT": text(data["method"]["overviewFigure"]["alt"]),
    "OVERVIEW_FIG_CAPTION": text(data["method"]["overviewFigure"]["caption"]),
    "HW_RESULTS_SRC": asset(data["results"]["hardwareFigure"]["src"]),
    "HW_RESULTS_ALT": text(data["results"]["hardwareFigure"]["alt"]),
    "HW_RESULTS_CAPTION": text(data["results"]["hardwareFigure"]["caption"]),
    "KEY_TABLE": render_table(data["results"]["keyTable"]["columns"], data["results"]["keyTable"]["rows"]),
    "BACKBONES_TABLE": render_table(data["results"]["backbonesTable"]["columns"], data["results"]["backbonesTable"]["rows"]),
    "ABLATIONS_TABLE": render_table(data["results"]["ablationsTable"]["columns"], data["results"]["ablationsTable"]["rows"]),
    "BIBTEX": text(data["bibtex"]),
}

html = (ROOT / "templates/index.html").read_text(encoding="utf-8")
for k, v in values.items():
    html = html.replace(f"@@{k}@@", v)

if re.search(r"@@[A-Z_]+@@", html):
    raise ValueError("Unfilled template token detected.")

# Guardrails: double-blind compliance & English-only public page
if re.search(r"\bicra\b", html, flags=re.IGNORECASE):
    raise SystemExit("Double-blind violation: found 'ICRA' in generated HTML!")
if re.search(r"[\u4e00-\u9fff]", html):
    raise SystemExit("Language violation: found Chinese characters in public English HTML!")

# Verify unique IDs
ids = re.findall(r'\bid="([^"]+)"', html)
dupes = sorted({i for i in ids if ids.count(i) > 1})
if dupes:
    raise SystemExit(f"Duplicate HTML IDs detected: {dupes}")

if OUT.exists():
    shutil.rmtree(OUT)
shutil.copytree(WEB, OUT)
(OUT / "index.html").write_text(html, encoding="utf-8")
(OUT / ".nojekyll").write_text("\n", encoding="utf-8")
(OUT / "robots.txt").write_text("User-agent: *\nAllow: /\n", encoding="utf-8")

# Ensure no CNAME file ever exists in project sub-site docs/
cname = OUT / "CNAME"
if cname.exists():
    cname.unlink()

# Standalone single-file preview
standalone = html.replace(
    '<link rel="stylesheet" href="styles.css">',
    "<style>" + (WEB / "styles.css").read_text(encoding="utf-8") + "</style>",
)
standalone = standalone.replace('<script src="site.js" defer></script>', "")
standalone = standalone.replace(
    "</body>",
    "<script>" + (WEB / "site.js").read_text(encoding="utf-8") + "</script></body>",
)
icon_b64 = base64.b64encode((WEB / "assets/favicon.svg").read_bytes()).decode("ascii")
standalone = standalone.replace('href="assets/favicon.svg"', f'href="data:image/svg+xml;base64,{icon_b64}"')
standalone = (
    standalone.replace('src="assets/media/', 'src="docs/assets/media/')
    .replace('poster="assets/media/', 'poster="docs/assets/media/')
    .replace('href="assets/media/', 'href="docs/assets/media/')
)
(ROOT / "PREVIEW.html").write_text(standalone, encoding="utf-8")

print("Built docs/index.html and PREVIEW.html cleanly (visual TL;DR + double-blind checks passed).")
