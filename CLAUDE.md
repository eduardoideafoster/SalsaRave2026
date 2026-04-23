# SalsaRave 2026 — working agreement

**Autonomy:** operate directly. Don't ask for confirmation before
applying code changes, running migration scripts, committing, pushing,
or deploying to Vercel — just do it and report what happened. Exceptions
where you still pause:

- Destructive actions on production data that aren't clearly requested
  (wiping tables outside the current task scope, dropping columns, force
  push to main unrelated to a concrete fix).
- Actions that require the user's own authentication flow (`vercel login`,
  `gh auth login`, Supabase dashboard settings).

**Deploy workflow** (do not re-explain each time):
1. `pnpm build` to verify.
2. `git add -A && git -c user.email="eduardo@ideafoster.com" -c user.name="eduardoideafoster" commit -m "..."` with a clean message.
3. `git push`.
4. `vercel deploy --prod --yes`.
5. `vercel alias set <new-url> salsarave-rooming-2026.vercel.app`.

**Commit author email must be `eduardo@ideafoster.com`** — the
`ideafoster` Vercel team's seat-block rejects anything else with a
generic "deploy_failed" (empty message).

**Preview server:** the Claude Preview MCP is bound to a different
project directory in this machine (`zastur-development`). Don't try to
start a preview server from here — verify via Vercel prod deploy
instead. Don't keep repeating this caveat; just deploy.

**Language:** the user writes in Spanish; reply in Spanish. Keep
technical output (code, commit messages) in English.

**Memory:** if the user asks something that's already been answered in
earlier sessions (Vercel team-seat fix, Supabase env vars location, H3
room numbering 101–139 / 201–239 / 301–338 / …), recall from
`~/.claude/projects/-Users-emf-if/memory/` before re-asking.
