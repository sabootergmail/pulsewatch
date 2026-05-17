# PulseWatch — stav řešení

> _Snapshot ke dni odevzdání submission. Diagramy v ASCII art stylu — vypadají stejně v každém viewru._

**PulseWatch** je hybrid Betterstack-style uptime monitoringu a Trello-style ticketingu pro AI-driven dev loop. Uživatel zadá úkol → AI agent ho udělá → uživatel schválí → nasadí se. Sám sebe monitoruje. Live na `https://pulsewatch-sigma.vercel.app`.

## Architektura — top-level krabičky

```
                          ┌──────────────────┐
                          │       👤         │
                          │       Já         │ ◄── přihlášení přes GitHub
                          └────────┬─────────┘
                                   │ HTTPS
                                   ▼
       ╔═══════════════════════════════════════════════════╗
       ║                  📋 PulseWatch                    ║
       ║      moje aplikace  (Next.js 16 na Vercelu)       ║
       ╚═══╤═══════════════╤════════════════╤══════════════╝
           │               │                │
           ▼               ▼                ▼
     ┌──────────┐    ┌──────────────┐    ┌─────────────────────┐
     │    💾    │    │      🌐      │    │      🐙 GitHub      │
     │ Databáze │    │  Sledované   │    │ repo + workflows +  │
     │ (SQLite) │    │     weby     │    │  issues + Pull Reqs │
     └──────────┘    └──────────────┘    └──────────┬──────────┘
                                                    │ claude.yml
                                                    │ trigger
                                                    ▼
                                              ┌─────────────┐
                                              │     🤖      │
                                              │   Claude    │
                                              │  AI agent   │
                                              └─────────────┘
```

## Workflow — od úkolu po nasazení

```
   ┌────────────────────────┐
   │  1. Já: zadám úkol     │ ◄── ticket v aplikaci nebo GH issue s @claude
   └───────────┬────────────┘
               │
               ▼
   ╔════════════════════════════════════════════════════════╗
   ║  2. AI agent zpracuje úkol                             ║
   ║  ──────────────────────────                            ║
   ║  Architect → Implementer → Reviewer → Release/Ops      ║
   ║  (4 role, každá ve svém kontextu, file-based handoff)  ║
   ╚════════════════════════╤═══════════════════════════════╝
                            │
                            ▼
   ┌────────────────────────┐
   │  3. Náhled (preview)   │ ◄── Vercel preview deploy z PR
   └───────────┬────────────┘
               │
               ▼
   ┌────────────────────────┐
   │  4. Já: schválím       │ ◄── přečtu změny, zaškrtnu, kliknu
   └───────────┬────────────┘
               │
               ▼
   ┌────────────────────────┐
   │  5. Nasazení live      │ ◄── merge + prod deploy + tag + release notes
   └───────────┬────────────┘
               │
               ▼
          ╱──────────╲
         ╱  smoke?    ╲    ◄── 60 s test po deployi
         ╲   pass?    ╱
          ╲──────────╱
              │     │
          ano │     │ ne
              ▼     ▼
        ┌──────────┐  ┌────────────┐
        │   🎉     │  │    ↩️      │
        │  Done    │  │ Rollback   │ ◄── autonomně, nebo z /releases v UI
        └──────────┘  └────────────┘
```

## Co je v repu (✅ dodáno)

Monitoring + incidenty + append-only audit (vynucený na Prisma layer); kanban + tickety; release_approval s **dvoukrokovým Approve & deploy** (PR diff link + checkbox); GUI rollback L1/L2/L3 (L3 otevírá revert PR přes GitHub API); REST `/api/tickets` + `/api/audit` s Bearer auth; PR-merge webhook s HMAC verifikací zavírá smyčku z GitHub strany; 4 agent role v `.claude/agents/` (Architect → Implementer → Reviewer → Release/Ops) s file-based handoff a 1-retry capem; 4 workflowy (`ci`, `claude`, `probe`, `release-verify` — release-verify dělá `npm version` + git tag + GitHub Release); **NextAuth + GitHub OAuth + single-user allowlist + `@claude` actor gate**; **Turso libSQL v produkci** — adapter auto-aktivní podle `TURSO_DATABASE_URL`, DB provisionovaná a env vars na Vercelu set (perzistence dat napříč Vercel cold starty); Turso migration/inspection skripty; MCP server (3 tools, stdio); Pino strukturované logy + Discord stub + **Beeceptor webhook na `incident.open`** (fire-and-forget); check retention cron; agent performance dashboard; **První ostrý multi-agent loop proběhl end-to-end** — task `cmpa1avwl…` má v `.claude/work/` Architectův `spec.md` i Reviewerův `review.md`, Implementer commit `feat(notify): Beeceptor webhook`, PR #2 mergnutý přes „Approve & deploy" gate.

**Test suite zelená lokálně:** 4 E2E spec (8 testů — auth, monitor lifecycle, release_approval lifecycle, task lifecycle) v Playwrightu + 7 Vitest souborů (34 testů) — probe state machine, audit append-only invariant, agent stats, API kontrakty, notify Beeceptor.

**Dokumentace:** 9 souborů v root + tato česká verze v `docs/` (`README.md`, `ARCHITECTURE.md`, `RELEASE.md`, `DR.md`, `INCIDENTS.md`, `ONE_PAGER.md`, `TESTING.md`, `CHANGELOG.md`, `AGENTS.md`).

## Co je vědomě mimo tuto submission

**Runtime provisioning, které ovlivňují live deploy:**
- ⬜ Reálný `DISCORD_WEBHOOK_URL` — kód funkční, push notification pro člověka no-op bez URL (Beeceptor outbound sink je zapojen samostatně)
- ⬜ Vercel deployment protection na preview deploye (UI klik)

**Items, které se po archivaci repa staly moot:**
- `vars.PROBE_URL`, `vars.RUN_E2E='1'`, branch protection na `main`, GitHub webhook setup — všechno by dávalo smysl pro živý vývoj proti otevřenému repu. Archived repo neprouští workflowy ani nemerguje, takže tyto kroky pro tento snapshot ztrácí účel.

**Vývoj nad rámec submission scope:**
- Self-monitor seed row — chybí v `prisma/seed.ts`, tvrzení „PulseWatch monitors its own prod" je tím v MVP zatím podloženo až po manuálním přidání monitoru
- Autonomous incident response loop — *„probe havaruje → agent diagnostikuje → buď investigační ticket, nebo bug → existující 4-role pipeline → PR"*. Architektonicky additive, jeden nový workflow + agent role
- Replay-based test multi-agent pipeline — fixture z `.claude/work/cmpa1avwl…/` umožňuje deterministicky otestovat orchestrátor pod simulovaným reviewer reject

## Kam by se pokračovalo (post-submission)

1. **Autonomous incident response** — druhá agent smyčka, system-initiated (probe → diagnostik) paralelní k user-initiated (task → implementer). *„AI nejen implementuje, co řekneš, ale i diagnostikuje, co se rozbije."* Architektonicky additive nad stávající 4-role pipeline.
2. **Turso provisioning + zapnutí 5min cronu** — odemkne perzistenci dashboard dat napříč Vercel cold starty a stabilní monitoring cadence.
3. **Replay-based test agent pipeline** — využití zachycených artefaktů z prvního live běhu jako test fixture, deterministicky pokrýt Reviewer retry/escalation cestu.

## Tech stack

| Vrstva | Volba | Proč právě tohle |
|---|---|---|
| Framework | Next.js 16 (App Router, RSC, Server Actions) | Jeden repo, jeden deploy, server actions místo REST tam, kde to dává smysl |
| Jazyk | TypeScript 5 | Type safety na hranici action / route handler |
| Databáze | SQLite (dev) → Turso libSQL (prod) přes Prisma 7 driver adapters | Stejné schema oběma stranami, Turso přidá perzistenci + PITR na Vercelu |
| Migrace + ORM | Prisma 7 + append-only AuditLog extension | Schema jako single source of truth, audit guard v Prisma layer |
| Auth | NextAuth v5 + GitHub OAuth + single-user allowlist | Standardní, hodnotitel zná, žádný password |
| Styling | Tailwind v4 | Rychlá iterace UI, žádný design system overhead |
| Validace | Zod | Boundary validation na server actions |
| Logging | Pino (JSON v prod, pretty-print v dev) | Strukturované logy s `ticket_id`, `role`, `event` |
| Alerting | Discord webhook + Beeceptor outbound | Discord push pro člověka, Beeceptor pro test sink / externí integrace |
| Testing | Vitest 4 (unit + integration) + Playwright (E2E, Chromium) | Vitest pro rychlé spec, Playwright pro vertikální průchod |
| Deployment | Vercel + Vercel Cron + GitHub Actions | Push-to-deploy, dvojí scheduler pro DR |
| CI/CD | 4 GitHub Actions workflows (`ci`, `claude`, `probe`, `release-verify`) | Lint/test/build, agent runtime, monitoring fallback, smoke + tag automation |
| AI runtime | `anthropics/claude-code-action` v GitHub Action | Oficiální, Max subscription token, žádný self-hosted runner |
| AI rozšíření | MCP server (stdio, 3 tools nad REST) | Připraveno pro Claude Desktop / ad-hoc LLM klienty |
| Bundler | Turbopack (default Next 16) / webpack v E2E | Webpack stabilnější pod paralelním Playwright load |
