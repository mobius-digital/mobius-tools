import json, sys, io, datetime
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether

spec = json.load(open(sys.argv[1], encoding="utf-8"))
out = sys.argv[2]
INK = colors.HexColor("#13202B"); MUTED = colors.HexColor("#5B6875"); LINE = colors.HexColor("#E3E7EC")
BRAND = colors.HexColor("#2F6FED"); SOFT = colors.HexColor("#F5F7FA")
TONE = {"good": colors.HexColor("#1E8E5A"), "warn": colors.HexColor("#B7791F"), "bad": colors.HexColor("#C53030")}
PAL = ["#2F6FED", "#1E8E5A", "#B7791F", "#C53030"]

def esc(s):
    return str("" if s is None else s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

H1 = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=INK)
SUB = ParagraphStyle("sub", fontName="Helvetica", fontSize=10.5, leading=14, textColor=MUTED)
H3 = ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=12, leading=16, textColor=INK, spaceBefore=10, spaceAfter=6)
BODY = ParagraphStyle("body", fontName="Helvetica", fontSize=10, leading=14.5, textColor=INK)
CELL = ParagraphStyle("cell", fontName="Helvetica", fontSize=8.5, leading=11, textColor=INK)
CELLB = ParagraphStyle("cellb", parent=CELL, fontName="Helvetica-Bold", textColor=MUTED)
KL = ParagraphStyle("kl", fontName="Helvetica", fontSize=8.5, leading=11, textColor=MUTED)
KV = ParagraphStyle("kv", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=INK)
KN = ParagraphStyle("kn", fontName="Helvetica", fontSize=8, leading=10, textColor=MUTED)

W = letter[0] - 1.3 * inch

def header_footer(c, doc):
    c.saveState()
    c.setFillColor(BRAND); c.rect(0, letter[1] - 6, letter[0], 6, stroke=0, fill=1)
    c.setFont("Helvetica-Bold", 9); c.setFillColor(INK)
    c.drawString(0.65 * inch, letter[1] - 0.42 * inch, "LOCUS")
    c.setFont("Helvetica", 9); c.setFillColor(MUTED)
    c.drawString(0.65 * inch + 38, letter[1] - 0.42 * inch, "by Mobius Digital")
    c.drawRightString(letter[0] - 0.65 * inch, 0.45 * inch, "Page %d" % doc.page)
    c.drawString(0.65 * inch, 0.45 * inch, esc(spec.get("title", ""))[:90])
    c.restoreState()

def num(v):
    try:
        return float(str(v).replace(",", "").replace("$", "").replace("%", "").replace("x", ""))
    except Exception:
        return None

def kpis(b):
    items = (b.get("items") or [])[:6]
    if not items: return None
    cells = []
    for it in items:
        tone = TONE.get(it.get("tone") or "")
        v = ParagraphStyle("kv2", parent=KV, textColor=tone or INK)
        cell = [Paragraph(esc(it.get("label")), KL), Paragraph(esc(it.get("value")), v)]
        if it.get("note"): cell.append(Paragraph(esc(it.get("note")), KN))
        cells.append(cell)
    per = 3 if len(items) > 4 else len(items)
    rows = [cells[i:i + per] for i in range(0, len(cells), per)]
    while len(rows[-1]) < per: rows[-1].append("")
    t = Table(rows, colWidths=[W / per] * per)
    st = [("BACKGROUND", (0, 0), (-1, -1), SOFT), ("BOX", (0, 0), (-1, -1), 0.5, LINE), ("INNERGRID", (0, 0), (-1, -1), 4, colors.white),
          ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]
    t.setStyle(TableStyle(st))
    return t

def table(b):
    cols = b.get("columns") or []
    rows = b.get("rows") or []
    if not cols and not rows: return None
    n = max(len(cols), max([len(r) for r in rows] or [0]))
    right = [i > 0 and sum(1 for r in rows if i < len(r) and num(r[i]) is not None) >= max(1, len(rows)) / 2 for i in range(n)]
    data = [[Paragraph(esc(c), ParagraphStyle("h", parent=CELLB, alignment=2 if right[i] else 0)) for i, c in enumerate(cols + [""] * (n - len(cols)))]] if cols else []
    for r in rows[:200]:
        r = list(r) + [""] * (n - len(r))
        data.append([Paragraph(esc(v), ParagraphStyle("c", parent=CELL, alignment=2 if right[i] else 0)) for i, v in enumerate(r)])
    first = min(W * 0.34, W / n * 1.6) if n > 1 else W
    rest = (W - first) / (n - 1) if n > 1 else 0
    t = Table(data, colWidths=[first] + [rest] * (n - 1), repeatRows=1 if cols else 0)
    st = [("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
          ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]
    if cols: st += [("LINEBELOW", (0, 0), (-1, 0), 1, INK)]
    for i in range(1 if cols else 0, len(data)):
        if i % 2 == 0: st.append(("BACKGROUND", (0, i), (-1, i), SOFT))
    t.setStyle(TableStyle(st))
    return t

def chart(b):
    x = [str(v) for v in (b.get("x") or [])]
    series = (b.get("series") or [])[:4]
    if not x or not series: return None
    unit = b.get("unit") or ""
    fig, ax = plt.subplots(figsize=(7.2, 2.6), dpi=200)
    if b.get("kind") == "bar":
        n = len(series); w = 0.8 / n
        for i, s in enumerate(series):
            vals = [(v if v is not None else 0) for v in (s.get("values") or [])][:len(x)]
            ax.bar([j + (i - (n - 1) / 2) * w for j in range(len(vals))], vals, width=w * 0.95, color=PAL[i % 4], label=str(s.get("name", "")))
        ax.set_xticks(range(len(x)))
        ax.set_xticklabels(x, fontsize=7, rotation=30 if len(x) > 8 else 0, ha="right" if len(x) > 8 else "center")
    else:
        for i, s in enumerate(series):
            vals = [(v if v is not None else float("nan")) for v in (s.get("values") or [])][:len(x)]
            ax.plot(range(len(vals)), vals, color=PAL[i % 4], linewidth=2, marker="o", markersize=2.5, label=str(s.get("name", "")))
        step = max(1, len(x) // 8)
        ax.set_xticks(range(0, len(x), step))
        ax.set_xticklabels(x[::step], fontsize=7)
    def fmt(v, _):
        a = abs(v)
        s = ("%.0fk" % (v / 1000)) if a >= 1000 else ("%.0f" % v if a >= 10 else "%.2g" % v)
        return ("$" + s) if unit == "$" else (s + unit if unit else s)
    from matplotlib.ticker import FuncFormatter
    ax.yaxis.set_major_formatter(FuncFormatter(fmt))
    ax.tick_params(axis="y", labelsize=7, colors="#5B6875"); ax.tick_params(axis="x", colors="#5B6875")
    for sp in ("top", "right"): ax.spines[sp].set_visible(False)
    for sp in ("left", "bottom"): ax.spines[sp].set_color("#C9D1DA")
    ax.grid(axis="y", color="#E3E7EC", linewidth=0.6); ax.set_axisbelow(True)
    if len(series) > 1:
        ax.legend(fontsize=7, frameon=False, loc="upper left", ncol=min(4, len(series)))
    fig.tight_layout()
    buf = io.BytesIO(); fig.savefig(buf, format="png"); plt.close(fig); buf.seek(0)
    return Image(buf, width=W, height=W * 2.6 / 7.2)

story = [Paragraph(esc(spec.get("title", "Report")), H1)]
if spec.get("subtitle"): story.append(Paragraph(esc(spec["subtitle"]), SUB))
at = spec.get("at") or datetime.datetime.utcnow().isoformat()
story.append(Paragraph("Built by %s, %s" % (esc(spec.get("by") or "Locus"), esc(str(at)[:10])), SUB))
story.append(Spacer(1, 14))
for b in spec.get("blocks") or []:
    t = b.get("type")
    head = [Paragraph(esc(b["title"]), H3)] if b.get("title") else []
    if t == "text":
        paras = [Paragraph(esc(p).replace("\n", "<br/>"), BODY) for p in str(b.get("text") or "").split("\n\n") if p.strip()]
        story.append(KeepTogether(head + paras)); story.append(Spacer(1, 8)); continue
    el = kpis(b) if t == "kpis" else table(b) if t == "table" else chart(b) if t == "chart" else None
    if el is None: continue
    story.append(KeepTogether(head + [el]) if t != "table" else head[0] if head else Spacer(1, 0))
    if t == "table": story.append(el)
    story.append(Spacer(1, 12))

doc = SimpleDocTemplate(out, pagesize=letter, leftMargin=0.65 * inch, rightMargin=0.65 * inch, topMargin=0.75 * inch, bottomMargin=0.7 * inch,
                        title=str(spec.get("title", "Report")), author="Locus by Mobius Digital")
doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print("ok", out)
