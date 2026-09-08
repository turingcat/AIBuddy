# Documentation Style Guide

## Brand Guidelines

This site is a private fork ("HeyBuddy") of the upstream `heybuddy` project. Two names now coexist here — do not mix them up:

- **"HeyBuddy"** — the fork's own brand: site title, navbar/footer chrome, page titles, and any new UI copy this site adds. Capitalized, standard proper-noun casing (not "heybuddy" or "Hey Buddy").
- **"heybuddy"** — the underlying CLI, environment variables (`HEYBUDDY_*`), config files (`.heybuddyhints`), and all existing documentation/blog content, which was written for and still accurately describes the unchanged upstream engine. **IMPORTANT**: keep writing "heybuddy" in lowercase "g" everywhere it already appears — do not rename it to HeyBuddy.

  - ✅ Correct: "heybuddy", "using heybuddy", "heybuddy provides"
  - ❌ Incorrect: "HeyBuddy", "using HeyBuddy", "HeyBuddy provides"

## Context

The lowercase-"heybuddy" rule applies to:
- All markdown files in `/docs/`
- All blog posts in `/blog/`
- README files
- Configuration files with user-facing text
- Any other existing documentation content

When editing existing content in this documentation directory, keep "heybuddy" lowercase. When adding new chrome/branding for this site itself (not documenting the underlying CLI), use "HeyBuddy" instead.
