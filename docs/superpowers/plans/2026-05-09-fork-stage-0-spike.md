# UI-TARS-desktop Fork — Stage 0 Spike

> **For codex (executor):** This is a 1-2 day go/no-go spike, NOT a migration. Run 4 independent validation tasks. **Do NOT modify the existing `agent-lite` repo.** All work happens in scratch directories. End deliverable: a written report at `docs/test-report.md` with PASS/FAIL per spike. Decision (fork vs return to v3 self-build) is made by the human AFTER reading the report.

**Why a spike**: Four reviewer rounds caught my optimistic estimates and wrong build commands. Before committing to a fork, validate four assumptions cheaply.

**Workspace**: scratch dir `C:\Users\g\Desktop\ui-tars-spike\`. Do NOT pollute `agent-lite`.

**Decision rule**:
- All 4 PASS → human writes formal fork plan (multi-week work)
- Any FAIL → discard scratch dir, return to v3 self-build plan with reviewer's 15 fixes

---

## Spike A — Upstream builds + runs on this Windows machine

**Question**: Can we build and run UI-TARS-desktop's dev mode on this user's Windows + Node + pnpm setup?

- [ ] **Step 1**: Verify prereqs.
  ```powershell
  node -v   # need >= 22
  pnpm -v   # install if missing: npm i -g pnpm
  ```

- [ ] **Step 2**: Clone reference into scratch dir.
  ```powershell
  cd C:\Users\g\Desktop
  git clone https://github.com/bytedance/UI-TARS-desktop.git ui-tars-spike
  cd ui-tars-spike
  ```

- [ ] **Step 3**: Read upstream's actual scripts. Don't assume any command names.
  ```powershell
  Get-Content package.json | ConvertFrom-Json | Select-Object -ExpandProperty scripts
  Get-Content apps/ui-tars/package.json | ConvertFrom-Json | Select-Object -ExpandProperty scripts
  ```
  Record the actual `dev`, `build`, and Windows-packaging commands in `spike-report.md`.

- [ ] **Step 4**: Install deps.
  ```powershell
  pnpm install
  ```
  Capture errors. Common pitfalls on Windows: native module compilation (sharp, node-mac-permissions — the latter is mac-only and might fail on Windows; check if conditionally skipped).

- [ ] **Step 5**: Run dev mode using the verified script name.
  ```powershell
  pnpm <verified-dev-script>   # e.g. pnpm dev:ui-tars (per reviewer)
  ```

- [ ] **Step 6**: Verify the Electron app window opens. Take a screenshot.

**PASS criteria**:
- Window opens
- No fatal install errors
- Dev mode reaches its main UI (chat or settings screen)

**FAIL → record in report and STOP. Don't attempt other spikes if A fails.**

---

## Spike B — Doubao seed-1.6-vision drives a real browser task

**Question**: Does the user's existing Doubao endpoint (`ep-20260509193331-bf5px`) work as the agent's vision/planning model in UI-TARS-desktop?

Prerequisites: Spike A passed; app is running.

- [ ] **Step 1**: In Settings, configure model provider.
  - Provider: Volcengine (or whatever upstream calls it)
  - Endpoint: `https://ark.cn-beijing.volces.com/api/v3`
  - API key: `ark-a5441b2f-ba23-4b09-8605-847a8c29daa7-64df5`
  - Model: `ep-20260509193331-bf5px`

- [ ] **Step 2**: Pick "Local Browser" operator.

- [ ] **Step 3**: Submit task: "open https://example.com and tell me the page title"

- [ ] **Step 4**: Watch what happens. Record:
  - Did agent take a screenshot?
  - Did agent click/navigate?
  - Did response contain "Example Domain"?
  - Total time start→done

**PASS criteria**:
- Browser task completes within 60s
- Final answer contains a recognizable substring of "Example Domain"
- No 401/404 model errors in the log

**FAIL → check error log, paste into report. Common causes: model endpoint not supported by upstream's "Volcengine" provider name, missing tool capability in seed-1.6-vision (some models only support text), or upstream expects UI-TARS-1.5 instead.**

---

## Spike C — CDP attach to user's existing Chrome

**Question**: Can UI-TARS-desktop's Local Browser operator attach via CDP to the user's already-running Chrome (preserving login state), instead of launching a fresh Chromium?

This is the critical decision point — if upstream only supports launching its own Chromium, we lose login-state preservation we discussed (and the user's stated requirement that they DON'T need it changes calculus).

- [ ] **Step 1**: Close all Chrome windows. Re-launch Chrome with remote debugging enabled.
  ```powershell
  & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\Google\Chrome\User Data"
  ```
  In that Chrome, manually log into 学习通 (or any site) so we have a known login state.

- [ ] **Step 2**: Find UI-TARS-desktop's browser config. Read code at `apps/ui-tars/src/main/agent/operator.ts` and `packages/ui-tars/operators/browser-operator/`. Look for:
  - CDP connection logic (`puppeteer.connect({browserURL: 'http://localhost:9222'})`)
  - OR launching logic (`puppeteer.launch(...)`) — confirm if launch is the default and CDP is opt-in

- [ ] **Step 3**: Configure UI-TARS-desktop to use CDP attach (whatever knob upstream provides). If no built-in option, document the actual default behavior.

- [ ] **Step 4**: Submit task: "go to my 学习通 main page and tell me how many courses I have" — something requiring login state.

**PASS criteria**: Agent operates within the user's logged-in Chrome (sees logged-in content). Screenshots show the user's tabs and login state.

**FAIL acceptable**: If upstream only does fresh-Chromium launch, document that and proceed. The user's earlier statement was "no longer need login state preservation" — this isn't a blocker, just data for the decision.

---

## Spike D — Windows installer build with upstream's real commands

**Question**: Can we produce a Windows .exe installer using upstream's actual build pipeline?

- [ ] **Step 1**: Run the verified Windows packaging command (from Spike A Step 3 inventory). Likely candidates:
  - `pnpm --filter @ui-tars/desktop run make` (electron-forge default)
  - `pnpm --filter @ui-tars/desktop run publish:win32`
  - Or root-level: `pnpm make:win` (per my old plan — likely wrong per reviewer)

- [ ] **Step 2**: Capture build output. Note artifacts directory and format.

- [ ] **Step 3**: Inspect produced installer:
  - Format (NSIS / Squirrel / WiX / Inno)?
  - Single .exe or directory?
  - Code signing required for it to launch on a fresh machine?

- [ ] **Step 4**: Install on a clean Windows VM (or fresh user account). Verify it launches without errors.

**PASS criteria**:
- A Windows installer is produced (any format)
- It runs on a clean machine and the app launches

**FAIL → record actual format vs our needs. If upstream only produces Squirrel and we need NSIS, that's added work; not a fork-killer but documented.**

---

## Final report

After running A → B → C → D (stop on A fail), write
`<scratch>/spike-report.md` with these sections:

1. **A — Build/run**: PASS/FAIL + actual commands found in upstream's package.json + any Windows-specific issues + total time spent.
2. **B — Doubao end-to-end**: PASS/FAIL + observed task time + final response sample.
3. **C — CDP attach**: PASS/FAIL/N-A + upstream's default browser launch behavior + whether login state is reachable.
4. **D — Installer**: PASS/FAIL + installer format + clean-VM launch result.
5. **Summary**: how many of A/B/C/D passed.
6. **Recommendation** (codex's call):
   - 4/4 → "fork plan viable; recommend writing formal multi-week migration plan"
   - 2-3/4 → "fork plan needs targeted patches before commitment; list which"
   - 0-1/4 → "fork is not viable for this user/environment; recommend returning to v3 self-build plan"

Copy the report to:
- `C:\Users\g\Desktop\agent-lite\docs\test-report.md` (append under `## 2026-05-09 UI-TARS-desktop fork spike`)
- `C:\Users\g\Desktop\计划书\spike-report.md` (so user sees it without opening repo)

Then **STOP**. Do not start any migration work. Wait for human to read the report and decide next step.

---

## Out of scope for this stage

- Renaming to AionUi
- Porting SKILL.md skills
- Porting oi-bridge
- Welcome dialog work
- Changing anything in `agent-lite/`

If any of these tempt during the spike, document the temptation in the report ("would have started X but skipped per spike scope") and don't do them.

---

## Cleanup if spike says "no"

```powershell
Remove-Item -Recurse -Force C:\Users\g\Desktop\ui-tars-spike
```

Scratch dir gone, no harm done. Move on to v3 self-build with reviewer's
15 fixes applied.

## Cleanup if spike says "yes"

Keep `ui-tars-spike` for reference during the migration; the formal plan
will write a separate `aionui` repo from a fresh clone (not from the
scratch).
