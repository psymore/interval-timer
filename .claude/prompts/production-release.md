# Production Release

This prompt should be executed ONLY before a production release.

Do not perform unnecessary refactoring.

Focus on production readiness, security, stability, performance, and release validation.

Follow every phase in order and do not skip any step unless explicitly instructed.

────────────────────────────────────────

You are my Production Release Automation Engineer.

Your objective is to perform a COMPLETE production verification of this Electron application.

Your goal is NOT to rewrite code or refactor unnecessarily.

Your goal is to determine whether this project is truly production-ready.

────────────────────────────────────────
GENERAL RULES
────────────────────────────────────────

• Continue until the ENTIRE repository has been analyzed.

• Never stop because one tool fails.

• If one step fails, explain why and continue with the remaining steps.

• Never automatically modify application source code unless I explicitly ask.

• Never automatically apply security fixes.

• Never automatically run npm audit fix.

• Never automatically run biome --write.

Only produce reports.

────────────────────────────────────────
TOOL INSTALLATION POLICY
────────────────────────────────────────

Before installing anything:

1. Detect the operating system.

2. Detect the available package manager
   (winget, brew, apt, npm, pip, chocolatey, etc.)

3. Detect whether every required CLI is already installed.

Examples:

semgrep --version
trivy --version
gitleaks version
knip --version
madge --version
biome --version

If already installed:

• Reuse the existing installation.

Do NOT reinstall.

If missing:

Install automatically using the most appropriate package manager.

IMPORTANT:

Install ONLY development tools.

Never install anything that becomes part of the production Electron application.

If using npm:

Install ONLY as devDependencies.

Never add analysis tools to production dependencies.

Never import these tools into application source code.

Never modify Electron Builder / Electron Forge configuration in a way that bundles these tools.

Before finishing, verify that none of these tools will be included inside the production bundle.

────────────────────────────────────────
REPORT DIRECTORY
────────────────────────────────────────

Create:

production-review/

Store every report there.

────────────────────────────────────────
STEP 1 — SEMGREP
────────────────────────────────────────

Install if necessary.

Run a full repository security scan.

Save:

production-review/semgrep-report.txt

────────────────────────────────────────
STEP 2 — TRIVY
────────────────────────────────────────

Scan:

• repository

• dependencies

• vulnerabilities

• secrets (if supported)

Save:

production-review/trivy-report.txt

────────────────────────────────────────
STEP 3 — GITLEAKS
────────────────────────────────────────

Scan:

• repository

• git history (if available)

Save:

production-review/gitleaks-report.txt

────────────────────────────────────────
STEP 4 — CODEQL
────────────────────────────────────────

If CodeQL CLI is available:

Run repository analysis.

Otherwise:

Explain exactly how to enable CodeQL using GitHub Actions.

Save:

production-review/codeql-report.txt

────────────────────────────────────────
STEP 5 — KNIP
────────────────────────────────────────

Detect:

• unused files

• unused exports

• unused dependencies

Save:

production-review/knip-report.txt

────────────────────────────────────────
STEP 6 — MADGE
────────────────────────────────────────

Detect:

• circular dependencies

Generate dependency graph if possible.

Save:

production-review/madge-report.txt

────────────────────────────────────────
STEP 7 — BIOME
────────────────────────────────────────

Run project analysis.

Do NOT automatically fix.

Save:

production-review/biome-report.txt

────────────────────────────────────────
STEP 8 — NPM AUDIT
────────────────────────────────────────

Run:

npm audit

Do NOT run:

npm audit fix

Save:

production-review/npm-audit-report.txt

────────────────────────────────────────
STEP 9 — ELECTRON SECURITY REVIEW
────────────────────────────────────────

Review this project against the official Electron Security Checklist.

Verify:

• BrowserWindow configuration

• preload scripts

• contextBridge

• contextIsolation

• sandbox

• nodeIntegration

• nodeIntegrationInSubFrames

• webSecurity

• Content Security Policy

• IPC communication

• ipcMain validation

• ipcRenderer exposure

• shell.openExternal

• protocol handlers

• remote content

• file system access

• child process usage

• permissions

• auto updater security

• secrets handling

• BrowserWindow creation

• session usage

Report every issue.

Save:

production-review/electron-security-review.md

────────────────────────────────────────
STEP 10 — FINAL PRODUCTION REVIEW
────────────────────────────────────────

Perform a COMPLETE repository review as:

• Senior Electron Engineer

• Electron Security Engineer

• Senior JavaScript Engineer

• Software Architect

• Performance Engineer

• QA Lead

• UX Reviewer

Review:

Architecture

Maintainability

Scalability

SOLID

JavaScript best practices

HTML best practices

CSS best practices

Electron best practices

Error handling

Logging

Memory leaks

Performance

Large files

Code smells

Duplicate code

Dead code

Folder organization

Naming

Security

Production readiness

────────────────────────────────────────
FINAL REPORT
────────────────────────────────────────

Generate:

production-review/PRODUCTION_REVIEW.md

Include:

Executive Summary

Production Readiness Score (0–100)

Security Score

Performance Score

Maintainability Score

Architecture Score

JavaScript Quality Score

HTML Quality Score

CSS Quality Score

Classify every finding as:

CRITICAL

HIGH

MEDIUM

LOW

SUGGESTION

For every finding include:

• description

• affected files

• why it matters

• recommended fix

Never recommend stylistic changes unless they clearly improve production quality.

Never rewrite working code simply because you prefer another style.

Finally conclude with ONLY one:

✅ READY FOR PRODUCTION

⚠️ READY WITH MINOR FIXES

❌ NOT READY FOR PRODUCTION
