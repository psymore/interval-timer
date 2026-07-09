# Production Review

This prompt should be executed ONLY before a production release.

Do not perform unnecessary refactoring.

Focus on production readiness, security, stability, performance, and release validation.

Follow every phase in order and do not skip any step unless explicitly instructed.

────────────────────────────────────────

FINAL MANUAL RELEASE VALIDATION

This validation is divided into two parts:

1. Tasks that YOU (Claude Code) can perform.
2. Tasks that require MY manual verification.

Do not repeat the production code review that was already completed.

Focus only on release validation.

==================================================
PART 1 — CLAUDE CODE TASKS
==================================================

Perform the following checks and generate reports where applicable.

1. Verify build configuration

- Check production configuration.
- Verify packaging configuration.
- Verify no unnecessary files are bundled.

2. Verify Electron security configuration
   Review:

- BrowserWindow
- preload
- contextIsolation
- sandbox
- nodeIntegration
- webSecurity
- contextBridge
- IPC exposure
- shell.openExternal
- Content Security Policy

3. Verify package contents

Check for:

- unnecessary assets
- test files
- screenshots
- documentation
- source maps (if not intended)
- development-only files

4. Verify secrets

Ensure no:

- API keys
- tokens
- passwords
- certificates
- private keys
- .env files

are included inside the production bundle.

5. Verify logging

Check:

- logging exists where appropriate
- no sensitive data is logged
- crash logging is reasonable

6. Verify error handling

Review:

- uncaught exceptions
- unhandled promise rejections
- graceful error handling

7. Review performance risks

Identify:

- possible memory leaks
- event listener leaks
- synchronous blocking operations
- heavy startup tasks

8. Generate a report summarizing all findings.

==================================================
PART 2 — MANUAL VALIDATION (USER)
==================================================

Guide me through each step ONE AT A TIME.

Do not continue until I confirm the previous step.

For every step:

- Explain exactly what I should do.
- Explain what PASS looks like.
- Explain what FAIL looks like.
- Explain the most likely cause if it fails.

The manual checklist is:

1. Installer

- Launch installer.
- Verify installation completes.
- Verify shortcuts.
- Verify installation directory behavior.

2. Uninstall

- Remove the application.
- Verify cleanup.
- Verify reinstall works.

3. Windows SmartScreen

- Observe whether SmartScreen appears.
- Explain whether the behavior is expected.

4. Code Signing

- Verify the executable is digitally signed.
- Guide me through checking Windows Properties and PowerShell.

5. Memory Usage

- Observe RAM usage at startup.
- Observe idle RAM.
- Observe RAM after extended use.

6. CPU Usage

- Observe idle CPU.
- Observe CPU during normal usage.

7. Long Session Test

- Use the application for approximately 2 hours.
- Observe crashes, freezes, increasing RAM usage, UI degradation, and unexpected behavior.

8. High DPI

- Test at 100%, 125%, 150%, and 200% Windows scaling.
- Verify text, icons, dialogs, and layouts remain correct.

9. Multi-Monitor

- Move the window between monitors.
- Test fullscreen.
- Verify remembered window position.
- Verify behavior with different DPI scaling.

10. Offline Test

- Disconnect the Internet.
- Verify startup.
- Verify stability.
- Verify offline behavior.
- Verify user-facing error messages.

11. Auto Update

- If implemented, verify update detection, download, installation, restart, and failure handling.
- If not implemented, simply record that it is not available.

12. Final User Experience
    Evaluate:

- first impression
- responsiveness
- consistency
- wording
- animations
- overall polish

==================================================
FINAL REPORT
==================================================

When both parts are complete, generate:

RELEASE_VALIDATION_REPORT.md

Include:

- Overall Release Score (0–100)
- PASS/FAIL for every manual check
- PASS/FAIL for every automatic check
- Critical Issues
- High Issues
- Medium Issues
- Low Issues
- Recommended Improvements

Conclude with exactly one:

✅ READY FOR PRODUCTION

⚠️ READY WITH MINOR FIXES

❌ NOT READY FOR PRODUCTION
