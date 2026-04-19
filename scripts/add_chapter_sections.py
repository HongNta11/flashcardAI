"""
Add real chapter-level `##` headings to super-thinking md for flashcard generation.

The OCR'd source has `## Page N` markers but no chapter structure. Neutralize those
and insert one `## <Chapter>` heading at each chapter's body start so the flashcard
generator groups cards by actual chapter instead of by page number.
"""
from pathlib import Path
import re

SRC = Path("books/super-thinking-the-big-book-of-mental-models.md")

# (body-start line number in current file, heading text)
# Verified via grep on 2026-04-19.
CHAPTERS = [
    (68,   "Introduction — The Super Thinking Journey"),
    (249,  "Chapter 1 — Being Wrong Less"),
    (1248, "Chapter 2 — Anything That Can Go Wrong, Will"),
    (2230, "Chapter 3 — Spend Your Time Wisely"),
    (3313, "Chapter 4 — Becoming One with Nature"),
    (4246, "Chapter 5 — Lies, Damned Lies, and Statistics"),
    (4513, "Chapter 6 — Decisions, Decisions"),
    (5582, "Chapter 7 — Dealing with Conflict"),
    (6792, "Chapter 8 — Unlocking People's Potential"),
    (7883, "Chapter 9 — Flex Your Market Power"),
    (8900, "Conclusion"),
]

def main() -> None:
    text = SRC.read_text(encoding="utf-8")
    lines = text.splitlines()

    # Demote `## Page N` markers so they're no longer level-2 headings.
    page_re = re.compile(r"^## Page \d+\s*$")
    for i, line in enumerate(lines):
        if page_re.match(line):
            lines[i] = line.replace("## Page", "Page")

    # Insert chapter headings. Apply in descending order so earlier inserts
    # don't shift the indices of later ones.
    for line_num, heading in sorted(CHAPTERS, reverse=True):
        idx = line_num - 1  # 1-based → 0-based
        if idx < 0 or idx >= len(lines):
            raise SystemExit(f"Line {line_num} out of range for heading '{heading}'")
        lines.insert(idx, f"## {heading}")
        lines.insert(idx + 1, "")  # blank line after heading

    SRC.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Inserted {len(CHAPTERS)} chapter headings; neutralized page markers.")

if __name__ == "__main__":
    main()
