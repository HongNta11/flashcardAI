# Sample Book

## Chapter 1: Clean Functions

A function should do one thing and do it well. If a function does more than one thing, extract each concern into its own function. Small functions are easier to name, test, and understand.

Side effects are hidden actions a function takes beyond its stated purpose. A function named `checkPassword` that also initializes a session has a side effect. Prefer functions with no side effects when possible.

## Chapter 2: Meaningful Names

Names should reveal intent. A variable named `d` with a comment "elapsed time in days" should be renamed to `elapsedTimeInDays`. The name should make the comment unnecessary.

Avoid disinformation. Do not use names that mean something specific in programming (like `list` or `hp`) unless that is literally what they are. Misleading names cause subtle bugs.
