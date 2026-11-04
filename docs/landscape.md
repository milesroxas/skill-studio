# How Skill Studio compares

A survey of agent skill eval tools as of October 2026, and where Skill Studio fits among them: Anthropic's skill-creator and `claude plugin eval`, NVIDIA SkillEvaluator, and the 2026 crop of Agent Skills harnesses.

Sources: public GitHub READMEs, NVIDIA SkillEvaluator docs, Claude Code plugin-eval docs, arXiv [2608.20614](https://arxiv.org/abs/2608.20614) (ACES) and [2602.12670](https://arxiv.org/abs/2602.12670) (SkillsBench).

## Summary

The outer loop already exists: run an agent with and without a skill, grade, compare versions. Several tools do it well.

What no other tool ships is a calibrated human review loop for subjective skill outputs: stored judge answers you can reweight without new calls, a blind queue that checks the judge against your ratings, and viewers for writing, HTML and agent process instead of pass/fail. Skill Studio is built for that loop and reuses the rest (the `claude plugin eval` case format, known isolation flags) instead of reimplementing it.

## What is already solved

Paired with-skill / without-skill runs, skill lift, pass@k, deterministic verifiers, LLM-as-judge rubrics, trigger checks, CI gating, Docker sandboxes, and HTML reports.

Anthropic ships this as `claude plugin eval`. NVIDIA ships a three-tier pipeline. skilljack-evals, Caliper, Skillgrade, eval-magic, and Promptfoo cover the same engineering loop with different tradeoffs.

## What Skill Studio adds

**Jev as the judge, not an LLM essay.** Every other tool uses a reasoning model as grader (pass/fail or 1–5 rubric). Skill Studio stores TypeSafe Nouls, keeps thresholds in code, and rescores from knobs with no new calls. NVIDIA’s own paper reports structural vs LLM-judge Spearman ρ = 0.14 and publishes no human calibration. That gap is the product.

**Human review as the loop, not a pause.** Skillgrade can pause for a human score. skill-creator opens a one-shot HTML viewer. Nobody ranks a confidence-sorted blind queue, keeps Jev and human pairwise votes apart, runs Bradley-Terry, or names the skill section vs the bench knob. Skill Studio does all of these.

**Subjective artifacts.** Live eval tools assume the answer is a file or a test. Writing, HTML prototypes, screenshots, and transcripts need viewers and layered scores. uivet and VisualJudge do Playwright + axe + a vision model for generated UI, not for Agent Skills. Cursor agent is first-class here and almost nowhere else.

**Anchors before trust.** Known-good and known-bad outputs that the judge must rank correctly. Promptfoo docs mention this as practice. Skill Studio gates each pack on `st self-test`. The public skill eval CLIs do not ship an anchors self-test as a gate on the pack.

## Left to other tools

| Capability                         | Already exists                                                                | Skill Studio                                       |
| ---------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| Claude Code plugin evals           | `claude plugin eval`: 6 grader types, with/without Δ, 3 runs, report.html, CI | Reads the same case folders; no Claude-only runner |
| Sandboxed live eval                | Harbor + SkillEvaluator Tier 3, BenchFlow, SkillsBench                        | Runs on the host; no Docker                        |
| Static skill quality / security    | SkillEvaluator Tier 1, SkillSpector, Semgrep, Gitleaks                        | Out of scope                                       |
| Description / trigger optimization | skill-creator `run_loop.py`, plugin-eval `skill-fired`, Caliper `activates`   | Out of scope for now                               |
| Deterministic code checks          | plugin-eval regex/file/tool, skilljack checks, Skillgrade scripts             | One layer in the code and design packs             |

## Landscape

### skill-creator (Anthropic)

A skill, not a harness. It tells Claude to draft cases, spawn with-skill and without-skill subagents, LLM-grade assertions, open `eval-viewer/generate_review.py`, then rewrite the skill.

- Engines: Claude subagents; `claude -p` for trigger optimization
- Judge: LLM grader agent, pass/fail assertions
- Human loop: one-shot Outputs + Benchmark tabs, free-text `feedback.json`
- Blind A/B is optional, uses another LLM, and most users never run it
- Upstream GitHub still documents the old `evals.json`; the current skill uses the `claude plugin eval` folder format

Good for authoring skills. Skill Studio reads its case folder format.

https://github.com/anthropics/skills/tree/main/skills/skill-creator

### claude plugin eval

Official CLI. Same `evals/` tree. With vs without plugin, Δ, CI exit codes.

- Claude Code only
- Graders: `regex`, `tool_used`, `tool_order`, `file_exists`, `llm` (2 of 3 votes), `baseline`. No custom-code graders
- Default 3 runs per arm. Score is weighted grader pass rate. Case passes at `--threshold` (default 1.0)
- Static `report.html`. No blind ranking. No Cursor

The right tool for pass/fail on Claude plugins. Skill Studio reads the same case folders.

https://code.claude.com/docs/en/plugin-evals

### NVIDIA SkillEvaluator

Three tiers: static quality, overlap detection, live Harbor eval. Reports Skill Lift, pass@k, and five catalog dimensions (Security, Correctness, Discoverability, Effectiveness, Efficiency).

- Engines: `codex`, `claude-code`, `opencode` in Docker. `cursor-cli.txt` is reconstructed, not first-class
- Judge: deterministic trajectory checks plus LLM judges. No published human calibration
- HTML report and dashboard. No blind queue
- Experimental, Apache-2.0. Part of NVIDIA Verified Skills

Use for CI, security, and catalog gates. Wrong UI for writing and design.

https://github.com/NVIDIA/SkillEvaluator
https://docs.nvidia.com/skills/skillevaluator/

### skilljack-evals

SkillsBench-style TDD plus CI. Deterministic reward is law. An LLM judge never gates the result.

- Runners: `claude-sdk`, `claude-code`, `codex`, `opencode`; Gemini experimental
- Metrics: resolution rate, pass@k, Skill Lift, invocation rate
- Caching, GitHub Action, BenchFlow import/export
- Documents isolation flags that Skill Studio follows for claude (`--setting-sources project`, Codex `--ignore-user-config --ephemeral`)
- Agent runs on the host with all permissions; Docker isolates the verifier only

Best host-run engineering harness. Skill Studio borrows its isolation flags.

https://github.com/olaservo/skilljack-evals

### Caliper

Ablate skills, MCPs, and rules. Neighbourhoods of competing skills. Token cost.

- Engines: Claude Code, Codex, Pi, Hermes
- Judge: LLM `expect:` plus local Python `assert:` plus `activates:`
- CLI compare. No visual review

Its neighbourhood and activation checks have no equivalent in Skill Studio yet.

https://github.com/edonadei/caliper

### Skillgrade

Generic agent harness. Docker or local. Web preview on `:3847`.

- Engines: Gemini, Claude, Codex, OpenCode, ACP, any CLI
- Graders: scripts, `llm_rubric`, human pause
- Human grader writes a score file. Closest human hook, still not a loop

Closest generic runner. Still no Jev, packs, or artifact viewers.

https://github.com/mgechev/skillgrade

### Promptfoo

Mature LLM eval platform. Now has Claude Agent SDK plus `skill-used` assertions.

- Many providers including Claude Agent SDK
- Large assertion catalog, `llm-rubric`
- Web eval UI, not a skill-authoring loop

A strong general eval backend. Not a skill review loop.

https://www.promptfoo.dev/docs/guides/test-agent-skills/

### eval-magic and skill-eval-harness

Paired campaigns and causal lift with deterministic-only grading.

- eval-magic: Claude, Cline, Codex, OpenCode; isolated git workspaces
- skill-eval-harness: any runner that writes a contract; no model in the grade path; static `review.html`

Useful contracts. Neither is a design/writing bench.

https://github.com/slowdini/eval-magic
https://github.com/adewale/skill-eval-harness

### Adjacent: UI screenshot judges

uivet, VisualJudge, and mllm-ui-judge render HTML in Playwright, run axe, and score screenshots with a vision model. Right reference for the design pack, not for the skill runner.

mllm-ui-judge found absolute 1–5 scores cluster and pairwise judges show position bias. This is why Skill Studio leans on pairwise votes and anchors, and keeps image judging experimental.

## Research backbone

**ACES / Skill Lift** (arXiv 2608.20614). NVIDIA: paired live trials, ATIF trajectories, six runtime metrics. Mean composite Skill Lift 0.2134 across 947 paired cases; positive in 72.8%. Scan-only gates and live judges measure different things.

Skill Studio runs `with_skill`, `without_skill` and `old_skill`. The UI does not yet label the with/without delta as Skill Lift, which would make its numbers comparable to the literature.

**SkillsBench** (arXiv 2602.12670). 87 containerized tasks, deterministic pytest verifiers, paired no-skill vs curated-skill. Curated skills raise pass rate 33.9% → 50.5%. Focused skills beat large bundles. Self-generated skills add nothing on average.

This supports small, focused skills, and script checks rather than Jev as the hard layer for verifiable skills (the code pack's check layer).

NVIDIA's five dimensions answer a catalog-gate question, not a voice question, so Skill Studio keeps them out of writing scores.

## Status

| Area                     | Where Skill Studio stands                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Packs                    | generic, writing, code, workflow and design ship. Design reads HTML as text; it does not render the page or run axe yet.                         |
| Engines                  | claude and cursor-agent. Others wait until a skill needs them.                                                                                  |
| Isolation                | claude runs with `--setting-sources project` and `--strict-mcp-config`. cursor-agent has no equivalent switch, so a run sees `~/.cursor/skills`. |
| Answer-key leakage       | The agent's skill copy omits `evals/`, so graders and anchors stay hidden. Absolute paths are not blocked, only flagged by the workflow pack.     |
| Anchors                  | `st self-test` grades labelled anchors and fails when a bad anchor beats a good one.                                                            |
| Pairwise / Bradley-Terry | Human and Jev votes are stored apart; boards show in Compare.                                                                                   |
| Trigger eval             | Not built. Use skill-creator's `run_loop` or plugin-eval's `skill-fired`.                                                                       |
| Oracle gate              | Not built. skilljack's `validate` runs a reference solution before trusting a check command; the code pack has no such gate yet.                |
| Neighbourhoods           | Not built. Caliper installs competing skills and asserts which one activates.                                                                   |

## When to use something else

| Need                                                     | Use                                                                                  | Entry                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Claude plugin or skill, pass/fail                        | [claude plugin eval](https://code.claude.com/docs/en/plugin-evals)                   | `claude plugin eval . --allow-tools Write,Edit,Bash`                      |
| Create or rewrite a skill with a human looking at outputs | [skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator) | Load the skill. It writes `evals/` folders and opens its viewer.          |
| Host-run TDD for a verifiable skill                      | [skilljack-evals](https://github.com/olaservo/skilljack-evals)                       | `skilljack-evals run evals/my-task` (baseline on by default)              |
| CI quality, security and live lift                       | [SkillEvaluator](https://github.com/NVIDIA/SkillEvaluator)                           | Copy `ci/templates/skill-checks.yml`, or `uv run skillevaluator validate` |
| Ablate a skill against neighbours, watch tokens          | [Caliper](https://github.com/edonadei/caliper)                                       | `caliper run spec.eval.yaml --ablate my-skill --k 3`                      |
| Generic agent, human pause, browser report               | [Skillgrade](https://github.com/mgechev/skillgrade)                                  | `skillgrade init && skillgrade preview browser`                           |
