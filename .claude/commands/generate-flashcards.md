# Generate Flashcards

Generate multiple-choice flashcards from a Markdown book file and save them as JSON.

## Usage

`/generate-flashcards <book-filename.md> [--force] [--sections <pattern>]`

- No arguments → list all `.md` files in `books/` and stop.
- `--force` → overwrite existing output file (default: abort if `books/<book-slug>.json` exists).
- `--sections <pattern>` → only process sections whose heading matches the glob/regex pattern.

## Steps

1. **Input validation**
   - No argument → list all `.md` files in [books/](books/) and stop.
   - File missing → report the path and list available files.
   - Output file [books/<book-slug>.json](books/) already exists and `--force` not set → stop; tell the user to pass `--force` to overwrite.

2. **Read source.** Read [books/<filename>](books/) from the project root. Preserve the original text; do not summarize or paraphrase during reading.

3. **Segment into sections.** Split on `##` headings (level-2). Skip a section when any of these hold:
   - Fewer than 3 sentences of prose.
   - Heading matches `^(References?|Bibliography|Index|Acknowledg(e)?ments?|Appendix|Table of Contents)$` (case-insensitive).
   - Content is only lists/tables/code with no explanatory prose.

4. For each section generate 3–5 multiple-choice flashcards. Each card:
   - `id`: `<book-slug>-<NNN>` (slug = filename without `.md`, NNN = zero-padded sequential integer starting at 001)
   - `section`: the exact text of the `##` heading this card belongs to
   - `question`: tests understanding of a concept in the section, not just wording recall
   - `options`: exactly 4 strings — 1 correct answer + 3 plausible distractors
   - `correct_answer`: exact text of the correct option (must match one entry in `options`)
   - `explanation`: 1–2 sentences explaining why the answer is correct and the others are not
4. **Generate cards per section.** For each surviving section produce 3–5 cards. Aim for coverage of the section's distinct concepts, not repeated angles on one concept.

5. **Write output** to [books/<book-slug>.json](books/) using the schema below. Use UTF-8, 2-space indent, trailing newline.

6. **Report** to the user: sections kept, sections skipped (with reasons), total cards, output file path.

## Output Schema

```json
{
  "book": "<book-slug>",
  "source_file": "books/<filename>.md",
  "generated_at": "<ISO 8601 UTC, e.g. 2026-04-19T12:34:56Z>",
  "card_count": 0,
  "cards": [
    {
      "id": "<book-slug>-001",
      "section": "<exact ## heading text>",
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correct_answer": "<must equal one entry in options>",
      "explanation": "..."
    }
  ]
}
```

### Field rules
- `id`: `<book-slug>-<NNN>`. Slug = filename without `.md`, lowercased, non-alphanumerics → `-`. `NNN` is zero-padded, sequential across the whole book starting at `001`.
- `options`: exactly 4 strings, each unique within the card. Do not prefix with `A)`/`B)`.
- `correct_answer`: byte-exact match to one `options` entry.
- Randomize the position of the correct answer per card (avoid always-A bias).

## Card Quality Criteria

**Questions test understanding, not phrasing recall.** Prefer "why"/"when"/"which scenario" over "what is the definition of". A good question is answerable by someone who understood the concept even if they've never seen the exact wording.

**Distractors must be plausible and section-grounded.**
- Draw from real adjacent concepts, common misconceptions, or partially-correct statements from the same section.
- Never use obvious filler ("none of the above", joke answers, unrelated topics).
- Each distractor should be wrong for a *specific* reason a learner could articulate.

**Explanations teach.**
- 1–2 sentences. State why the correct answer is right *and* name the specific flaw in at least one distractor.
- Do not quote the question back or say "because that's what the text says."

**Source fidelity.** Every correct answer must be supported by the section text. If the section doesn't assert it clearly, don't write the card. Never invent facts, examples, or author claims.

**Avoid.**
- Trivia (dates, proper nouns) unless the section makes them load-bearing.
- True/false-style questions padded to 4 options.
- Questions solvable by elimination from grammar/length cues (keep option lengths comparable).

## Validation Before Writing

Before writing the JSON, self-check each card:
1. `correct_answer` appears exactly once in `options`.
2. `options` has exactly 4 unique strings.
3. `question` is answerable from the section alone.
4. Explanation names a reason, not just a restatement.

Drop any card that fails. If a section yields fewer than 3 valid cards, keep what passed and note it in the report.
