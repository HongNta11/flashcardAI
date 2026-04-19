# Generate Flashcards

Generate multiple-choice flashcards from a Markdown book file and save them as JSON.

## Usage

`/generate-flashcards <book-filename.md>`

Run without arguments to list all `.md` files in the `books/` folder.

## Steps

1. If no argument provided: list all `.md` files in `books/` and stop.

2. Read `books/<filename>` from the project root.

3. Split content into sections by `##` headings. Skip sections shorter than 3 sentences.

4. For each section generate 3–5 multiple-choice flashcards. Each card:
   - `id`: `<book-slug>-<NNN>` (slug = filename without `.md`, NNN = zero-padded sequential integer starting at 001)
   - `question`: tests understanding of a concept in the section, not just wording recall
   - `options`: exactly 4 strings — 1 correct answer + 3 plausible distractors
   - `correct_answer`: exact text of the correct option (must match one entry in `options`)
   - `explanation`: 1–2 sentences explaining why the answer is correct and the others are not

5. Write output to `books/<book-slug>.json`:

```json
{
  "book": "<book-slug>",
  "generated_at": "<ISO 8601 UTC timestamp>",
  "cards": [ ... ]
}
```

6. Report: sections processed, total cards generated, output file path.

## Guidelines

- Questions test understanding, not rote recall of phrasing.
- Distractors are plausible but clearly wrong on reflection.
- Explanations teach, not just restate the answer.
- Never invent facts not present in the source text.
