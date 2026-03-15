# CampaignAgent: Agentic Payments Learning Project

## Design Document

**Date:** 2026-03-14
**Goal:** Build a campaign optimization agent that accumulates client-specific knowledge, helps make better decisions, and can sell its expertise via x402 + ERC-8004.
**Timeline:** ~1-2 weeks (side project)
**Builder profile:** Full-stack agentic engineer, new to crypto/blockchain

---

## 1. Problem Statement

Campaign optimization for clients is tedious but requires judgement. The user manages multiple clients across Meta and Google Ads, analyzing performance data, diagnosing issues, and making optimization decisions. Each client has unique context that takes time to accumulate.

**The insight:** When AI intelligence is commoditized, the scarce resources are:
- **Accumulated state** — An agent with 6 months of client patterns beats a fresh agent
- **Trust** — Bad campaign advice costs real ad budget; you need verified track records
- **Access** — Proprietary data and specialized analysis behind a paywall

**This project builds a tool the user actually uses**, then layers agentic commerce on top.

---

## 2. Existing Foundation

The `ads-report-automation` project (at `~/Documents/Coding Repository/ads-report-automation`) provides:

- **Tech stack:** Python 3.9+, Click CLI, Polars, UV
- **API integrations:** Meta Ads (facebook-business SDK), Google Ads (google-ads SDK)
- **6 analyzers:** Search terms, impression share, quality score, trends, composition, diagnostic engine
- **Diagnostic engine:** Evidence-based Investigation -> Diagnosis -> Evidence -> Recommendation (with confidence scores)
- **Storage:** Partitioned Parquet (monthly, by client/data_type)
- **Reporting:** Dual markdown output (internal verbose + client-facing summary)
- **Pipeline:** Fetch -> Store -> Analyze -> Report
- **Config:** YAML-based client/theme/diagnostic configuration
- **Status:** Production-ready, generating real reports for real clients

**What it lacks:** LLM integration, knowledge accumulation, web API, payment layer.

---

## 3. Architecture Decision

### Approach: CLI-first -> FastAPI for payments (validated via multiple debates)

**Debates conducted:**
1. Library-first vs MCP Server vs API-first (3-way debate)
2. CLI vs MCP research (March 2026 industry consensus)
3. gcloud-style resource CLI vs Minimalist vs Workflow vs Agent-first (4-way debate)

**Decision:** Build a CLI tool (inspired by gcloud, but simpler) that serves as the universal interface. Agents call it via shell. FastAPI added in week 2 only for x402 payment gating.

**Rationale:**
- CLI is the most token-efficient interface for agents (March 2026 consensus)
- `--format json` makes any CLI command machine-readable with zero extra infrastructure
- gcloud's resource-oriented pattern is overkill for 6 analyzers — use a 2-layer design instead
- Porcelain commands encode workflow knowledge (the product's value)
- Plumbing commands give agents surgical precision when needed
- FastAPI added only when HTTP is required (x402 payments in week 2)

### CLI Design: Two Layers (validated via 4-way debate)

```
campaign                                    # the tool
│
│  # ─── CONTEXT ───
├── use <client_id>                         # set default client (sticky)
├── status                                  # show current context + data freshness
│
│  # ─── PORCELAIN (daily workflow, 90% of usage) ───
├── check [client_id]                       # quick health dashboard
├── investigate [client_id] --metric cpl    # diagnostic deep dive
├── brief [client_id]                       # client-ready summary
├── watch [client_id]                       # continuous monitoring loop (autoresearch-inspired)
│
│  # ─── PLUMBING (granular / agent direct access) ───
├── fetch [client_id]                       # pull data from APIs
├── analyze [client_id]                     # run analyzers
│   --only search-terms,trends              # filter specific analyzers
├── report [client_id]                      # generate markdown
├── knowledge query|list|seed              # accumulated patterns
│
│  # ─── META ───
├── config list|check-creds                 # configuration
├── tools                                   # list capabilities as JSON (agent discovery)
│
│  # ─── GLOBAL FLAGS ───
    --format table|json|csv                 # json for agents
    --month 2026-02 / --days 30             # date range
    --quiet                                 # no prompts
    --verbose                               # debug
```

**Design principles (converged from debate):**
1. Smart defaults: no date = last 30 days, no client = active context, no analyzer = all
2. Max 2 levels deep (never 3)
3. Porcelain encodes domain expertise; plumbing gives precision
4. `--format json` on every command for agent consumption
5. `campaign use <client>` eliminates repetitive flags
6. `campaign tools` enables agent self-discovery (MCP-style, without MCP)

**How porcelain maps to plumbing:**
- `campaign check` → fetch + all analyzers + health summary view
- `campaign investigate --metric cpl` → fetch + targeted analyzers + diagnostic engine
- `campaign brief` → fetch + analyze + client summary report
- `campaign watch` → autonomous loop (fetch → analyze → diff → alert → repeat)

### Access patterns by user type

```
You (local):         campaign check acme
                     campaign investigate acme --metric cpl
Agent (local):       campaign analyze acme --format json
Agent (discovery):   campaign tools --format json
External agents:     HTTP -> x402 payment gate -> FastAPI -> same library (week 2)
```

---

## 4. Week 1: CLI Restructure + Agent Layer (Days 1-5)

### 4.0 Codebase Cleanup (Day 1, first half)

Before adding features, fix the structural coupling:

1. **Delete dead shim files:** `src/calculations.py`, `src/formatting.py`, `src/data_models.py`, `src/report.py`
2. **Decouple pipeline.py:** Split into `fetch_client()` and `analyze_client()` → returns `AnalysisResults`
3. **Wire unused code:** Connect dimension breakdown fetchers, `track_term_trends()`, `detect_emerging_terms()` in pipeline
4. **Split models/diagnostics.py:** Analyzer outputs → `models/analysis.py`, diagnostic engine types stay

### 4.1 CLI Restructure (Day 1-2)

Transform the monolithic `ads-report` CLI into the `campaign` CLI with porcelain + plumbing layers.

**Key changes to existing codebase:**
- `main.py` → Click group with subcommands instead of single command
- `pipeline.py` → `analyze_client()` returns `AnalysisResults` (decoupled from report generation)
- Add `--format json` support to all commands via output formatter
- Add `campaign use <client>` context with `.campaign-context` file
- Add `campaign tools` for agent discovery

**Porcelain commands internally wire plumbing:**

| Porcelain | Internally calls |
|-----------|-----------------|
| `check` | `fetch_client()` → `analyze_client()` → health summary formatter |
| `investigate --metric X` | `fetch_client()` → targeted analyzers + diagnostic engine → investigation formatter |
| `brief` | `fetch_client()` → `analyze_client()` → client summary report generator |
| `watch` | autonomous loop: fetch → analyze → diff → alert → repeat |

### 4.2 Agent Core (Days 2-3)

The agent calls CLI commands via shell (same as how Claude Code uses bash tools).

**Agent tools = CLI commands:**

| Agent tool call | CLI command |
|----------------|-------------|
| `campaign fetch acme --quiet` | Pull fresh data |
| `campaign analyze acme --format json` | Run all analyzers |
| `campaign analyze acme --only search-terms --format json` | Targeted analysis |
| `campaign investigate acme --metric cpl --format json` | Diagnostic deep dive |
| `campaign knowledge query acme "budget allocation" --format json` | Query accumulated knowledge |
| `campaign tools --format json` | Discover available capabilities |

### 4.2 Knowledge Accumulation (Day 2-3)

The moat. Each interaction makes the agent smarter.

**What gets stored (SQLite):**

```sql
-- Patterns extracted from analyses
CREATE TABLE knowledge_entries (
    id INTEGER PRIMARY KEY,
    client_id TEXT,              -- NULL for cross-client patterns
    category TEXT,               -- 'search_terms', 'budget', 'creative', 'audience', etc.
    pattern TEXT,                -- "Video creatives outperform static by 2.3x in Q4"
    confidence REAL,             -- 0.0 to 1.0
    source TEXT,                 -- Which analyzer produced this
    evidence TEXT,               -- JSON: supporting data points
    created_at TIMESTAMP,
    last_confirmed TIMESTAMP     -- Updated when pattern holds true again
);

-- Recommendations and their outcomes
CREATE TABLE recommendation_log (
    id INTEGER PRIMARY KEY,
    client_id TEXT,
    recommendation TEXT,         -- What the agent suggested
    action_taken TEXT,           -- What the user actually did (NULL if pending)
    outcome TEXT,                -- Did it work? (NULL until logged)
    outcome_metrics TEXT,        -- JSON: before/after KPIs
    created_at TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Interaction history for context
CREATE TABLE interactions (
    id INTEGER PRIMARY KEY,
    client_id TEXT,
    query TEXT,
    response_summary TEXT,
    tools_used TEXT,             -- JSON array
    created_at TIMESTAMP
);
```

**Accumulation flow:**
1. User asks a question -> agent runs analyzers
2. Agent extracts patterns from diagnostic results -> stores in `knowledge_entries`
3. Agent makes recommendations -> logged in `recommendation_log`
4. User later logs outcome -> agent learns what advice worked
5. Future queries retrieve relevant knowledge entries + past outcomes -> better recommendations

### 4.3 FastAPI Wrapper (Days 4-5)

Wrap the working agent in HTTP for week 2 readiness.

```python
# Endpoints
POST /chat                    # Conversational interface (streaming)
POST /analyze/{client_id}     # Run full analysis pipeline
GET  /knowledge/{client_id}   # Query accumulated insights
GET  /capabilities            # Tool manifest (for ERC-8004 registration)
GET  /stats                   # Agent stats: clients served, queries answered, accuracy

# Request/response: JSON
# Auth: API key for now (x402 replaces this in week 2)
```

**The agent tools still call the library directly** — FastAPI is just the HTTP skin.

---

## 5. Week 2: Commerce Layer (Days 6-10)

### 5.1 x402 Payment Integration (Days 6-7)

Gate the FastAPI endpoints with x402 for external users.

**Flow:**
```
External agent                    CampaignAgent API
     |                                   |
     |--- GET /analyze/acme ------------>|
     |                                   |
     |<-- 402 Payment Required ----------|
     |    {                              |
     |      price: "0.01 USDC",          |
     |      payTo: "0x...",              |
     |      network: "base-sepolia",     |
     |      accepts: ["USDC"]            |
     |    }                              |
     |                                   |
     |--- GET /analyze/acme ------------>|
     |    x-payment: <signed USDC tx>    |
     |                                   |
     |<-- 200 OK + analysis results -----|
```

**Implementation:**
- Deploy on Base Sepolia testnet
- Use testnet USDC (faucet-funded)
- x402 middleware on FastAPI checks payment header before forwarding to handler
- Internal/local calls bypass payment (service key or localhost check)

**Pricing model:**
- `/chat` — 0.001 USDC per message
- `/analyze/{client_id}` — 0.01 USDC per full analysis
- `/knowledge/{client_id}` — 0.005 USDC per knowledge query

### 5.2 ERC-8004 Identity & Trust (Days 8-9)

Register the agent on ERC-8004 so other agents can discover and evaluate it.

**Identity Registry entry:**
```json
{
  "agentAddress": "0x...",
  "name": "CampaignAgent",
  "description": "Campaign optimization specialist with accumulated cross-client knowledge",
  "capabilities": ["search_term_analysis", "budget_optimization", "trend_detection", "diagnostic_investigation"],
  "supportsX402": true,
  "endpoint": "https://campaign-agent.example.com",
  "metadata": {
    "clientsServed": 5,
    "queriesAnswered": 342,
    "avgConfidence": 0.82,
    "domainExpertise": ["meta_ads", "google_ads", "e-commerce", "lead_gen"]
  }
}
```

**Reputation Registry:**
- After each paid interaction, the caller can submit a rating (on-chain)
- Agent's reputation score = weighted average of ratings + query volume + age
- Simple Solidity contract on Base Sepolia

### 5.3 Competition Demo (Day 10)

Add a second competing agent (or mock one) to demonstrate trust-aware routing:

- **CampaignAgent A** — Your real agent with accumulated knowledge (higher trust, higher price)
- **CampaignAgent B** — A simpler agent, freshly deployed (lower trust, lower price)
- **Coordinator** — Discovers both via ERC-8004, compares reputation + price, selects one, pays via x402

**Dashboard:** Simple web page showing:
- Agent registry entries (capabilities, reputation, price)
- Live payment flow (who paid whom, how much)
- Reputation trends over time
- Selection decisions (why the coordinator picked A over B)

---

## 6. Tech Stack Summary

| Layer | Technology |
|-------|------------|
| Language | Python 3.9+ |
| Existing pipeline | Polars, Click, Parquet, facebook-business, google-ads SDKs |
| LLM | Claude API (or OpenAI) with tool-use |
| Knowledge store | SQLite |
| API server | FastAPI |
| Blockchain | Base Sepolia testnet |
| Stablecoin | Testnet USDC |
| x402 | x402 Python SDK / middleware |
| ERC-8004 | Simple Solidity contracts (identity + reputation registries) |
| Smart contract tooling | Hardhat or Foundry (for ERC-8004 contracts) |
| Wallet | ethers.js / viem (or Python web3.py) |
| Dashboard | Simple HTML + JS (or Next.js if ambitious) |

---

## 7. What You'll Learn

| Week | Skill | How |
|------|-------|-----|
| 1 | LLM tool-use patterns | Agent calling structured tools over campaign data |
| 1 | Knowledge accumulation | SQLite-based pattern extraction and retrieval |
| 1 | Autonomous agent loops | Prompt-driven "never stop" pattern (autoresearch-inspired) |
| 1 | API design for agents | FastAPI endpoints designed for machine consumption |
| 2 | Crypto wallet basics | Creating wallets, signing transactions on testnet |
| 2 | x402 payment flow | HTTP 402 -> payment -> retry -> access |
| 2 | Smart contracts (intro) | Deploying simple registry contracts on Base Sepolia |
| 2 | ERC-8004 identity | Registering agent identity + capabilities on-chain |
| 2 | Agent economics | Pricing, reputation, trust-aware selection |

---

## 8. Key Design Decisions & Rationale

| Decision | Why |
|----------|-----|
| CLI-first, then FastAPI for payments | Validated via 4-way CLI debate + 3-way architecture debate. CLI is the universal interface; HTTP only for x402 |
| SQLite for knowledge (not Parquet) | Knowledge entries are relational (queries, joins, updates). Parquet stays for time-series campaign data |
| Base Sepolia testnet | Base is where x402 + USDC ecosystem is strongest. Sepolia = free testnet tokens |
| Porcelain + plumbing CLI pattern | Porcelain encodes domain expertise (check, investigate, brief). Plumbing gives precision (fetch, analyze). Validated via 4-way debate |
| CLI is the agent interface | Agents call CLI via shell with --format json. No separate API needed for local use. Inspired by how Claude Code uses bash |
| Max 2 levels deep | gcloud's 3-level nesting is overkill for 6 analyzers. Flat-enough is better |
| Simple reputation contract | Not trying to solve sybil resistance. Simple success/failure counter is sufficient for learning |
| Autonomous loop is read-only | Inspired by autoresearch but campaign changes have real cost. Agent analyzes and recommends; human executes |
| Pre-seed knowledge from existing reports | Solves cold-start problem. Months of real reports already exist in ads-report-automation |

---

## 9. Autonomous Loop Pattern (Inspired by autoresearch)

### The Insight

Karpathy's autoresearch proves that an autonomous agent loop requires no special infrastructure — just a well-crafted prompt with a tight feedback loop. The agent keeps running because the LLM never ends its turn; it always has a next tool call to make.

**Key mechanism:** A coding agent (Claude Code, Codex CLI) is already a long-running agentic loop: LLM generates tool call → runtime executes → result feeds back → LLM generates next tool call. By instructing the agent to "NEVER STOP" and always have a next experiment, the loop runs indefinitely in a single uninterrupted turn.

### Adapted for CampaignAgent

Two modes of autonomous operation:

#### Mode 1: Overnight Knowledge Accumulation (Read-Only)

The agent runs autonomously through all clients, accumulating knowledge without human intervention.

```
LOOP (for each client in clients.yaml):
  1. Fetch latest campaign data (Meta + Google Ads)
  2. Run all 6 analyzers on the fresh data
  3. Compare results to previous period
  4. Extract new patterns → store in knowledge_entries
  5. If anomaly detected (z-score > threshold):
     → Log alert + preliminary recommendation
  6. Update interaction count + confidence scores
  7. Move to next client
  8. After all clients: generate cross-client insights
  9. Sleep until next scheduled run (or loop immediately)
```

**Safety:** This mode is strictly read-only + analyze. It fetches data and accumulates knowledge but NEVER modifies campaigns, budgets, or bids. All recommendations are logged for human review.

**Prompt instruction (autoresearch-style):**
```
You are running in autonomous overnight mode. Process every client
in sequence. For each client: fetch data, run all analyzers, extract
patterns, log anomalies. After all clients, look for cross-client
patterns. Do NOT stop to ask for confirmation. Do NOT modify any
campaign settings. Log everything to the knowledge store. Continue
until all clients are processed, then start over with fresh data.
The human will review your findings in the morning.
```

#### Mode 2: Interactive Optimization (Human-in-the-Loop)

For real-time use during work hours. The agent responds to questions and makes recommendations, but waits for human input between actions.

```
LOOP:
  1. User asks a question or requests analysis
  2. Agent retrieves relevant knowledge + runs targeted analyzers
  3. Agent presents recommendation with confidence + evidence
  4. User approves, rejects, or modifies
  5. Agent logs the decision + outcome to recommendation_log
  6. Wait for next user input
```

### The Feedback Loop

Inspired by autoresearch's keep/discard pattern:

```
┌─────────────────────────────────────────────┐
│         Campaign Optimization Loop          │
│                                             │
│  Recommend → User acts → Measure outcome    │
│       ↑                        │            │
│       │    ┌───────────────────┘            │
│       │    ▼                                │
│       │  Did it work?                       │
│       │    │                                │
│       │    ├─ YES → Increase pattern        │
│       │    │        confidence, store        │
│       │    │        as validated insight     │
│       │    │                                │
│       │    └─ NO  → Decrease confidence,    │
│       │             log what went wrong,    │
│       │             refine understanding    │
│       │                                     │
│       └─── Generate next recommendation ────┘
└─────────────────────────────────────────────┘
```

This creates a self-improving cycle: the agent's recommendations get better over time because it tracks which advice actually worked. This is the accumulated state that makes the agent worth paying for (week 2).

### Knowledge Pre-Seeding

Unlike autoresearch (which starts from a known baseline), your agent has a cold-start advantage: **months of existing reports in `ads-report-automation/reports/`**. Before the first autonomous run:

1. Parse existing markdown reports for all clients
2. Extract patterns, anomalies, and recommendations already identified
3. Seed the `knowledge_entries` table with these historical patterns
4. The agent starts with context, not from zero

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Scope creep in week 2 (smart contracts are new) | Use existing x402 SDKs and contract templates. Don't write contracts from scratch |
| Knowledge accumulation feels empty with few interactions | Pre-seed with patterns from existing reports (you have months of real data) |
| x402 SDK/tooling is immature | Have a fallback: mock the payment flow if SDK issues block progress |
| ERC-8004 is still a draft standard | Implement the concept (registries), not the exact spec. The learning is in the pattern |
| Agent gives bad campaign advice | This is a learning project, not production. Use for insights, not automated actions |

---

## 10. Success Criteria

**Week 1 complete when:**
- [ ] Agent can answer "Why did CPL spike for Client X last month?" using real data
- [ ] Knowledge store has 10+ accumulated patterns from real analyses
- [ ] Autonomous overnight loop processes all clients and logs findings without human intervention
- [ ] Knowledge pre-seeded from existing historical reports
- [ ] FastAPI serves at least `/chat` and `/analyze` endpoints
- [ ] You've used it for at least one real client analysis

**Week 2 complete when:**
- [ ] External request without payment returns 402 with pricing
- [ ] External request with valid testnet USDC payment returns results
- [ ] Agent is registered on ERC-8004 with capabilities and stats
- [ ] Coordinator demo selects between two agents based on reputation + price
- [ ] Dashboard shows the payment + trust flow visually
