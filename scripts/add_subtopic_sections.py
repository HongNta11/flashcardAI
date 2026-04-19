"""
Promote in-chapter sub-topic titles to `##` headings so the flashcard generator
sees ~50 fine-grained sections instead of 11 broad chapters.

The source md has sub-topic titles as standalone ALL-CAPS lines in the body.
This script finds each (by line number, verified via grep on 2026-04-19) and
inserts a `## <Title (Title Case)>` heading above it.

Chapter headings already inserted by add_chapter_sections.py are kept, so the
generator will produce cards for both chapter intros and each sub-topic.
"""
from pathlib import Path

SRC = Path("books/super-thinking-the-big-book-of-mental-models.md")

# (line number in current md, exact CAPS text on that line, Title Case heading)
# Line numbers are 1-based; verified via `grep -n` on 2026-04-19.
SUBTOPICS = [
    # Chapter 1
    (325, "KEEP IT SIMPLE, STUPID!", "Keep It Simple, Stupid!"),
    (577, "IN THE EYE OF THE BEHOLDER", "In the Eye of the Beholder"),
    (761, "WALK A MILE IN THEIR SHOES", "Walk a Mile in Their Shoes"),
    (930, "PROGRESS, ONE FUNERAL AT A TIME", "Progress, One Funeral at a Time"),
    (1106, "DON\u2019T TRUST YOUR GUT", "Don\u2019t Trust Your Gut"),
    # Chapter 2
    (1296, "HARM THY NEIGHBOR, UNINTENTIONALLY", "Harm Thy Neighbor, Unintentionally"),
    (1531, "RISKY BUSINESS", "Risky Business"),
    (1704, "BE CAREFUL WHAT YOU WISH FOR", "Be Careful What You Wish For"),
    (1899, "IT\u2019S GETTING HOT IN HERE", "It\u2019s Getting Hot in Here"),
    (2059, "TOO MUCH OF A GOOD THING", "Too Much of a Good Thing"),
    # Chapter 3
    (2328, "YOU CAN DO ANYTHING, BUT NOT EVERYTHING", "You Can Do Anything, but Not Everything"),
    (2624, "GETTING MORE BANG FOR YOUR BUCK", "Getting More Bang for Your Buck"),
    (2787, "GET OUT OF YOUR OWN WAY", "Get Out of Your Own Way"),
    (3094, "SHORTCUT YOUR WAY TO SUCCESS", "Shortcut Your Way to Success"),
    # Chapter 4
    (3410, "DON\u2019T FIGHT NATURE", "Don\u2019t Fight Nature"),
    (3787, "HARNESSING A CHAIN REACTION", "Harnessing a Chain Reaction"),
    (3999, "ORDER OUT OF CHAOS", "Order Out of Chaos"),
    # Chapter 5
    (4266, "TO BELIEVE OR NOT BELIEVE", "To Believe or Not Believe"),
    (4298, "HIDDEN BIAS", "Hidden Bias"),
    (4316, "BE WARY OF THE \u201CLAW\u201D OF SMALL NUMBERS", "Be Wary of the \u201cLaw\u201d of Small Numbers"),
    (4333, "THE BELL CURVE", "The Bell Curve"),
    (4431, "IT DEPENDS", "It Depends"),
    (4447, "RIGHT OR WRONG?", "Right or Wrong?"),
    (4486, "WILL IT REPLICATE?", "Will It Replicate?"),
    # Chapter 6
    (4595, "WEIGHING THE COSTS AND BENEFITS", "Weighing the Costs and Benefits"),
    (4870, "TAMING COMPLEXITY", "Taming Complexity"),
    (5228, "BEWARE OF UNKNOWN UNKNOWNS", "Beware of Unknown Unknowns"),
    # Chapter 7
    (5674, "PLAYING THE GAME", "Playing the Game"),
    (5781, "NUDGE NUDGE WINK WINK", "Nudge Nudge Wink Wink"),
    (5959, "PERSPECTIVE IS EVERYTHING", "Perspective Is Everything"),
    (6171, "WHERE\u2019S THE LINE?", "Where\u2019s the Line?"),
    (6270, "THE ONLY WINNING MOVE IS NOT TO PLAY", "The Only Winning Move Is Not to Play"),
    (6545, "CHANGING THE GAME", "Changing the Game"),
    (6705, "ENDGAME", "Endgame"),
    # Chapter 8
    (6902, "IT TAKES A VILLAGE", "It Takes a Village"),
    (7091, "WHO GOES WHERE", "Who Goes Where"),
    (7232, "PRACTICE MAKES PERFECT", "Practice Makes Perfect"),
    (7413, "UNLOCKING POTENTIAL", "Unlocking Potential"),
    (7635, "TOGETHER WE THRIVE", "Together We Thrive"),
    # Chapter 9
    (8019, "SECRET SAUCE", "Secret Sauce"),
    (8236, "VISION WITHOUT EXECUTION IS JUST HALLUCINATION", "Vision Without Execution Is Just Hallucination"),
    (8578, "ACTIVATE YOUR FORCE FIELD", "Activate Your Force Field"),
]


def main() -> None:
    text = SRC.read_text(encoding="utf-8")
    lines = text.splitlines()

    # Insert descending so earlier inserts don't shift later targets.
    for line_num, expected, heading in sorted(SUBTOPICS, reverse=True):
        idx = line_num - 1
        got = lines[idx]
        if got != expected:
            raise SystemExit(
                f"Line {line_num} mismatch: expected {expected!r}, got {got!r}"
            )
        lines.insert(idx, f"## {heading}")
        lines.insert(idx + 1, "")

    SRC.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Inserted {len(SUBTOPICS)} sub-topic headings.")


if __name__ == "__main__":
    main()
