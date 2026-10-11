<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Website Reverse-Engineer Template

## What This Is
A reusable template for reverse-engineering any website into a clean, modern Next.js codebase using AI coding agents. The Next.js + shadcn/ui + Tailwind v4 base is pre-scaffolded — just run `/clone-website <url1> [<url2> ...]`.

## Tech Stack
- **Framework:** Next.js 16 (App Router, React 19, TypeScript strict)
- **UI:** shadcn/ui (Radix primitives, Tailwind CSS v4, `cn()` utility)
- **Icons:** Lucide React (default — will be replaced/supplemented by extracted SVGs)
- **Styling:** Tailwind CSS v4 with oklch design tokens
- **Deployment:** Vercel

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run lint` — ESLint check
- `npm run typecheck` — TypeScript check
- `npm run check` — Run lint + typecheck + build

## Code Style
- TypeScript strict mode, no `any`
- Named exports, PascalCase components, camelCase utils
- Tailwind utility classes, no inline styles
- 2-space indentation
- Responsive: mobile-first

## Design Principles
- **Pixel-perfect emulation** — match the target's spacing, colors, typography exactly
- **No personal aesthetic changes during emulation phase** — match 1:1 first, customize later
- **Real content** — use actual text and assets from the target site, not placeholders
- **Beauty-first** — every pixel matters

## Project Structure
```
src/
  app/              # Next.js routes
  components/       # React components
    ui/             # shadcn/ui primitives
    icons.tsx       # Extracted SVG icons as React components
  lib/
    utils.ts        # cn() utility (shadcn)
  types/            # TypeScript interfaces
  hooks/            # Custom React hooks
public/
  images/           # Downloaded images from target site
  videos/           # Downloaded videos from target site
  seo/              # Favicons, OG images, webmanifest
docs/
  research/         # Inspection output (design tokens, components, layout)
  design-references/ # Screenshots and visual references
scripts/            # Asset download scripts
```

## Reverse Engineering with REA
[REA](https://github.com/morluto/rea) ("Reverse Engineer Anything") is **optional and off by default**. `npm run rea:enable` registers it as the `rea` MCP server for Claude Code (`.mcp.json`), Cursor (`.cursor/mcp.json`), Gemini CLI (`.gemini/settings.json`) and Codex (`.codex/config.toml`, trusted projects), and installs its `reverse-engineer-anything` skill (`.claude/skills/`, `.codex/skills/`, `.github/skills/`). `npm run rea:disable` removes all of it. Other agents: run `npx rea-agents setup`. It needs Node.js 22.19+ and runs locally. If `rea` tools aren't available, skip the REA steps; nothing in this template depends on them.

Use REA when the question is about something you don't have source for: how a shipped website, app, or binary implements a feature. Skip it for this repo's own code.

- **Websites** — REA attaches passively to a Chrome-family browser started with `--remote-debugging-port=9222` on loopback (it never clicks or navigates; keep using browser automation for that). Start with `list_browser_targets`, then `inspect_web_page` (DOM, resources, network metadata), `analyze_web_bundle` (vendor fingerprints, routes, endpoints, source maps), `recover_javascript_sources`, and `capture_web_screenshot` + `compare_web_screenshots` for pixel diffs against the clone.
- **Applications** — pick the first tool from the target: Electron/JS app directory or `.asar` → `analyze_javascript_application`; running Electron app → `list_electron_targets`; .NET assembly → `inspect_managed_artifact`; Android APK → `inspect_android_package`; ZIP/APK/IPA/DMG/MSIX → `open_binary` + `inspect_artifact`; native executable → `open_binary` (needs Hopper, Ghidra, or IDA installed).
- **No MCP?** Static JS analysis works from the CLI: `npx -y rea-agents@<pinned version> analyze-javascript-application /absolute/path --json`.
- **Output** — save findings to `docs/research/<target>/`, separating observations, inferences, and unknowns, and cite REA Evidence IDs. When rebuilding a feature here, keep observed behavior distinct from your own design choices.
- **Updating** — the version is pinned in `scripts/sync-rea.mjs`. Run `node scripts/sync-rea.mjs <version>` (or `latest`) to bump every registration and re-vendor the matching skill, then restart the agent. Don't edit the generated `rea` entries or the vendored skill by hand.

## MOST IMPORTANT NOTES
- When launching Claude Code agent teams, ALWAYS have each teammate work in their own worktree branch and merge everyone's work at the end, resolving any merge conflicts smartly since you are basically serving the orchestrator role and have full context to our goals, work given, work achieved, and desired outcomes.
- After editing `AGENTS.md`, run `bash scripts/sync-agent-rules.sh` to regenerate platform-specific instruction files.
- After editing `.claude/skills/clone-website/SKILL.md`, run `node scripts/sync-skills.mjs` to regenerate the skill for all platforms.

@docs/research/INSPECTION_GUIDE.md
