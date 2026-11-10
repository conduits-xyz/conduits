# Code conventions

Write new code like the code around it. These rules describe that code.

## Format

- Indent with 2 spaces. Do not use tabs, except where a language
  requires them (for example, a Makefile).
- Do not end statements with semicolons. Exception: a classic script
  that starts with an IIFE begins with `;(function () { ... })()`.
- Use single quotes for strings in TypeScript and JavaScript.
- Put the opening brace on the same line as its statement (1TBS).
- Keep lines short enough to read in a terminal. The code has no strict
  limit.

## Names

- Use lowercase kebab-case for files and directories, for example
  `credential-store.ts`. Windows ignores case, so mixed case causes
  conflicts in version control.
- Use names that give the meaning, even when they are longer:
  `iphone-64x32.png`, not `iphone-small.png`.
- Use a directory only when it groups files by meaning. Keep the depth
  between 3 and 5 levels. For example, keep all image sizes in
  `public/assets/images`, not in `small/`, `medium/`, and `large/`.

## Imports

1. Put external packages first.
2. Put a blank line.
3. Put the files of this repository next.

In each group, put the imports that change least often first.

## Dependencies

Open an issue before you add an external dependency.

## Tests

Test what the code does for a use case. Do not test how it looks.
