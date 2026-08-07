# Documentation Style Guide

## Brand Guidelines

This site is a private fork ("HeyBuddy") of the upstream `goose` project. Two names now coexist here — do not mix them up:

- **"HeyBuddy"** — the fork's own brand: site title, navbar/footer chrome, page titles, and any new UI copy this site adds. Capitalized, standard proper-noun casing (not "heybuddy" or "Hey Buddy").
- **"goose"** — the underlying CLI, environment variables (`GOOSE_*`), config files (`.goosehints`), and all existing documentation/blog content, which was written for and still accurately describes the unchanged upstream engine. **IMPORTANT**: keep writing "goose" in lowercase "g" everywhere it already appears — do not rename it to HeyBuddy.

  - ✅ Correct: "goose", "using goose", "goose provides"
  - ❌ Incorrect: "Goose", "using Goose", "Goose provides"

## Context

The lowercase-"goose" rule applies to:
- All markdown files in `/docs/`
- All blog posts in `/blog/`
- README files
- Configuration files with user-facing text
- Any other existing documentation content

When editing existing content in this documentation directory, keep "goose" lowercase. When adding new chrome/branding for this site itself (not documenting the underlying CLI), use "HeyBuddy" instead.
