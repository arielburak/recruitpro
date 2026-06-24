"""
Generador del .docx de email copys para revisar con Ari.

Lee EMAIL_COPYS.md y produce docs/email-review/Email-Copys.docx.
Formato simple — headers, bullets, body text. Sin floruras.

Run:
  python3 scripts/build-email-copys-docx.py
"""

from docx import Document
from docx.shared import Pt, RGBColor
import re
from pathlib import Path

SOURCE = Path(__file__).parent.parent / "EMAIL_COPYS.md"
TARGET = Path(__file__).parent.parent / "docs" / "email-review" / "Email-Copys.docx"


def main():
    md = SOURCE.read_text(encoding="utf-8")
    doc = Document()

    # Defaults
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    for raw_line in md.split("\n"):
        line = raw_line.rstrip()

        # Skip empty lines but preserve paragraph breaks
        if not line.strip():
            doc.add_paragraph("")
            continue

        # Horizontal rules → page-break-feeling separator
        if line.strip() == "---":
            doc.add_paragraph("─" * 40)
            continue

        # Headings
        if line.startswith("### "):
            doc.add_heading(strip_markdown(line[4:]), level=3)
            continue
        if line.startswith("## "):
            doc.add_heading(strip_markdown(line[3:]), level=2)
            continue
        if line.startswith("# "):
            doc.add_heading(strip_markdown(line[2:]), level=1)
            continue

        # Blockquotes (the body samples)
        if line.startswith("> "):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Pt(24)
            run = p.add_run(strip_markdown(line[2:]))
            run.font.color.rgb = RGBColor(0x44, 0x44, 0x44)
            continue
        if line.strip() == ">":
            doc.add_paragraph("")
            continue

        # List items
        m = re.match(r"^(\s*)- (.*)$", line)
        if m:
            text = strip_markdown(m.group(2))
            p = doc.add_paragraph(text, style="List Bullet")
            continue
        m = re.match(r"^(\s*)(\d+)\. (.*)$", line)
        if m:
            text = strip_markdown(m.group(3))
            p = doc.add_paragraph(text, style="List Number")
            continue

        # Tables — keep markdown table rows as plain paragraphs.
        # Conversion ahead-of-time is overkill for this doc.
        if line.startswith("|"):
            doc.add_paragraph(strip_markdown(line))
            continue

        # Plain paragraph with inline formatting
        write_inline(doc, line)


    TARGET.parent.mkdir(parents=True, exist_ok=True)
    doc.save(TARGET)
    print(f"Wrote {TARGET}")


def strip_markdown(s: str) -> str:
    """Strip bold/italic/code markers for plain rendering."""
    s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
    s = re.sub(r"\*(.+?)\*", r"\1", s)
    s = re.sub(r"`(.+?)`", r"\1", s)
    s = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", s)
    return s


def write_inline(doc, line: str):
    """Add a paragraph with bold runs for **text** segments."""
    p = doc.add_paragraph()
    # Split on **bold** markers, keeping the marker positions for runs.
    parts = re.split(r"(\*\*.+?\*\*)", line)
    for part in parts:
        if part.startswith("**") and part.endswith("**"):
            run = p.add_run(part[2:-2])
            run.bold = True
        else:
            # Strip other markdown markers in non-bold text
            p.add_run(strip_markdown(part))


if __name__ == "__main__":
    main()
