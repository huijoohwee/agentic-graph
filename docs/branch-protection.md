---
title: "Knowgrph Branch Protection"
doc_type: "Process Guide"
status: "active"
frontmatter_contract: "required"
---

# Knowgrph Branch Protection

## Overview

- This guide defines the GitHub branch protection settings that enforce `knowgrph` conflict-resolution compliance on the server side.
- Local hooks and CI reduce manual errors, but branch protection is the final gate that prevents non-compliant merges into `main`.
- Apply these settings in the GitHub repository settings for `huijoohwee/knowgrph`.

---

## Context-Intent-Directive (CID) Framework

### Definition

- **Context**: focus domain of concern
- **Intent**: desired principle or guiding goal
- **Directive**: explicit prohibition or required safeguard

### Sorting

Each mantra and table row stays alphabetized for predictable administration and review.

---

## Three-Beat Mantra Form

- Checks; require server-side validation; forbid merging with failing compliance status
- History; preserve auditable review flow; forbid direct unreviewed pushes to `main`
- Merges; gate integration through pull requests; forbid bypassing review and automation
- Reviews; require human approval; forbid self-merging without policy satisfaction
- Status; require `Integration Gate`; forbid merging with missing required checks

---

## Context-Intent-Directive Table

| Context | Intent | Directive |
|---|---|---|
| Checks | Require server-side validation | - [ ] Require passing status checks; enforce server-side validation; forbid merging with failing compliance status |
| History | Preserve auditable review flow | - [ ] Protect `main` branch history; preserve review flow; forbid direct unreviewed pushes |
| Merges | Gate integration through pull requests | - [ ] Require pull requests for `main`; gate integration; forbid bypassing review and automation |
| Reviews | Require human approval | - [ ] Require approving reviews before merge; preserve accountability; forbid self-merging without policy satisfaction |
| Status | Require `Integration Gate` | - [ ] Mark `Integration Gate` as required; enforce conflict policy; forbid merging with missing required checks |

---

## Required Settings

Apply these settings to the `main` branch in GitHub:

- **Require a pull request before merging**: `ON`
- **Require approvals**: `OFF` while one human is the sole maintainer; turn `ON` when another human regularly reviews
- **Required approving reviews**: `1` when multi-human review is active
- **Dismiss stale pull request approvals when new commits are pushed**: `ON` when approvals are required
- **Require review from code owners**: `ON` only after maintainable CODEOWNERS coverage exists
- **Require status checks to pass before merging**: `ON`
- **Require branches to be up to date before merging**: `ON`
- **Required status checks**: select `Integration Gate`
- **Restrict who can push to matching branches**: `ON`; all device and Codex changes enter through task branches
- **Allow force pushes**: `OFF`
- **Allow deletions**: `OFF`

---

## Recommended Settings

- **Require conversation resolution before merging**: `ON`
- **Do not allow bypassing the above settings**: `ON`
- **Require linear history**: `ON`
- **Lock branch**: `OFF` by default; turn `ON` only for release freezes or emergency governance windows

---

## Required Status Check

The sole merge-gating workflow and job are:

- **Workflow name**: `Integration`
- **Required job name**: `Integration Gate`

Use the job name as the exact required merge status. It runs:

- `npm run ci:integration`
- standalone `npm run worktree:check` enforcement before build or affected-scope work
- canonical collaboration frontmatter and protected-main-only automatic deployment validation
- `agent/<device>/<semantic-scope>` branch and canonical `main` target validation
- declared base-SHA ancestry and unique active semantic-scope validation across open pull requests
- affected-scope checks selected from `docs/collaboration-runtime-contract.md`
- changed-file hygiene budget regression checks (`<600` lines/file and `<500 KiB` text chunks for new files; no growth for existing over-budget files)
- built JS/CSS chunk budgets after Pages build (`<500 KiB` per asset)
- graph cache semantic keys must use `canvas/src/lib/graph/semanticKey.ts`
- merge-marker detection

Publish-mirror and sibling-schema parity are release checks after ephemeral sync; they are not Dev merge prerequisites.

---

## Setup Steps

1. Open GitHub repository settings for `huijoohwee/knowgrph`.
2. Go to `Settings` -> `Branches`.
3. Add or edit a branch protection rule for `main`.
4. Enable pull request requirements and approval requirements.
5. Enable required status checks.
6. Select `Integration Gate` as the sole required check.
7. Disable force pushes and branch deletion.
8. Save the rule and verify the workflow appears on the next pull request.

---

## Validation Checklist

- [ ] `main` requires pull requests before merge
- [ ] `main` requires one approval when more than one human maintainer is active
- [ ] `Integration Gate` is marked as the sole required status check
- [ ] stale approvals are dismissed when approvals are enabled
- [ ] force pushes are disabled
- [ ] direct pushes to `main` are restricted without bypass
- [ ] only `Production Release` can deploy, only for an exact `turn:end`-reviewed protected `main` candidate, and only after required human approval in the protected `production` environment
- [ ] the `production` environment requires an authenticated human reviewer, prevents self-review and administrator bypass, restricts deployment to protected `main`, and exposes only least-privilege deployment credentials
- [ ] the Cloudflare Pages Git source has production deployments disabled and preview deployment set to `none`; `Production Release` Direct Upload is the sole deploy owner

---

## Role-Action-Outcome

- **Role: Repository Admin**  
-> Action: configures branch protection and required checks in GitHub  
-> Outcome: blocks non-compliant merges into `main`

- **Role: Maintainer**  
-> Action: routes all `main` updates through pull requests and required checks  
-> Outcome: preserves auditable conflict-resolution governance

- **Role: Reviewer**  
-> Action: approves only pull requests that satisfy automation and policy checks  
-> Outcome: maintains human oversight on top of automated enforcement

---

## Mantra Application

**"CID frames knowgrph branch gates, SRP isolates merge authority, RAO aligns admin actions, SVO clarifies enforcement."**

- **CID frames**: defines which GitHub controls matter, why they matter, and which shortcuts are forbidden.
- **SRP isolates**: keeps merge authority in protected branch settings instead of ad hoc maintainer habits.
- **RAO aligns**: maps admins, maintainers, and reviewers to explicit enforcement actions.
- **SVO clarifies**: turns branch protection into a concrete checklist rather than a vague repository preference.
