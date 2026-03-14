

import json
import os
from datetime import datetime


def export_transcript(turns: list, fmt: str = "txt") -> str:
    """
    Export conversation turns to file.
    Returns path to generated file.
    """
    os.makedirs("audio", exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    if fmt == "json":
        return _export_json(turns, timestamp)
    elif fmt == "pdf":
        return _export_pdf(turns, timestamp)
    else:
        return _export_txt(turns, timestamp)


def _export_txt(turns: list, timestamp: str) -> str:
    path = f"audio/transcript_{timestamp}.txt"
    lines = [
        "BABEL TRANSLATOR — CONVERSATION TRANSCRIPT",
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "=" * 60,
        ""
    ]
    for t in turns:
        lines.append(f"[Turn {t['turn']}] {t.get('timestamp', '')}")
        lines.append(f"  {t.get('source_lang','?')} (Original):   {t['original']}")
        lines.append(f"  {t.get('target_lang','?')} (Translated): {t['translated']}")
        lines.append("")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return path


def _export_json(turns: list, timestamp: str) -> str:
    path = f"audio/transcript_{timestamp}.json"
    data = {
        "generated": datetime.now().isoformat(),
        "turns": turns
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


def _export_pdf(turns: list, timestamp: str) -> str:
    """Generate a simple PDF using reportlab if available, else fallback to txt."""
    path = f"audio/transcript_{timestamp}.pdf"
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.units import cm
        from reportlab.lib import colors

        doc = SimpleDocTemplate(path, pagesize=A4,
                                rightMargin=2*cm, leftMargin=2*cm,
                                topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()
        story = []

        title_style = ParagraphStyle("Title", parent=styles["Heading1"],
                                     fontSize=18, textColor=colors.HexColor("#6366f1"))
        story.append(Paragraph("🌍 Babel Translator — Transcript", title_style))
        story.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles["Normal"]))
        story.append(Spacer(1, 0.5*cm))

        for t in turns:
            story.append(Paragraph(f"<b>Turn {t['turn']}</b> — {t.get('timestamp','')}", styles["Heading3"]))
            story.append(Paragraph(f"<b>{t.get('source_lang','?')}:</b> {t['original']}", styles["Normal"]))
            story.append(Paragraph(f"<b>{t.get('target_lang','?')}:</b> {t['translated']}", styles["Normal"]))
            story.append(Spacer(1, 0.3*cm))

        doc.build(story)
        return path

    except ImportError:
        return _export_txt(turns, timestamp)