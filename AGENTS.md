<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Git workflow

All work ships through `staging` first, and the definition of "task done" includes `staging` actually containing the changes. Open the PR against `staging` AND merge it as part of finishing — don't leave the PR sitting open waiting for user action, and don't ask first. The user has already decided; re-asking or stopping at "PR opened" is noise. Only target `main`/production if the user explicitly says "push to main", "promote to production", or similar.