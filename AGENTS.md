<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Git workflow

All work ships through `staging` first. When a task is done, open the PR (or merge) against `staging` — never `main`/production — unless the user explicitly says "push to main", "promote to production", or similar. `staging` is the safety buffer; `main` only receives changes after the user decides to promote.