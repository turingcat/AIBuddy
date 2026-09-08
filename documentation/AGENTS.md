# Documentation Style Guide

## Brand Guidelines

This site is a private fork ("AIBuddy") of the upstream `aibuddy` project. Two names now coexist here — do not mix them up:

- **"AIBuddy"** — the fork's own brand: site title, navbar/footer chrome, page titles, and any new UI copy this site adds. Capitalized, standard proper-noun casing (not "aibuddy" or "Hey Buddy").
- **"aibuddy"** — the underlying CLI, environment variables (`AIBUDDY_*`), config files (`.aibuddyhints`), and all existing documentation/blog content, which was written for and still accurately describes the unchanged upstream engine. **IMPORTANT**: keep writing "aibuddy" in lowercase "g" everywhere it already appears — do not rename it to AIBuddy.

  - ✅ Correct: "aibuddy", "using aibuddy", "aibuddy provides"
  - ❌ Incorrect: "AIBuddy", "using AIBuddy", "AIBuddy provides"

## Context

The lowercase-"aibuddy" rule applies to:
- All markdown files in `/docs/`
- All blog posts in `/blog/`
- README files
- Configuration files with user-facing text
- Any other existing documentation content

When editing existing content in this documentation directory, keep "aibuddy" lowercase. When adding new chrome/branding for this site itself (not documenting the underlying CLI), use "AIBuddy" instead.
