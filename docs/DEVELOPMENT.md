# Developing Site Appearance Toggle

The repository is the development starting point. It contains shared source,
generated Sine and manual packages, tests, fixture definitions and public
verification results. Browser profiles, cookies, local captures, recordings and
old build directories are not prerequisites. Do not copy a user's browser
profile to reproduce a bug.

The runtime remains version 1.3.2. The development consolidation on 29 October
2026 did not change the installed mod scripts. Native results in the release
reports describe the recorded versions; they are not claims that the current
browser has been retested or that an everyday profile has accepted the mod.

## Source map

| File | Responsibility |
| --- | --- |
| `src/appearance-policy.js`, `src/site-rules.json` | Saved choices, site recognition, grouping, private state and workspace/site scopes. |
| `src/appearance-controller.js` | Resolves and applies a tab's remembered choice. |
| `src/appearance-browser.js` | Native preference binding and Zen workspace/browser adapters. |
| `src/appearance-toolbar.js` | Widget, menus, next action, selected-page sampling and lifecycle. |
| `src/appearance-site-browser.js` | Content actor transport, guarded site actions, navigation and unsent-search recovery. |
| `src/appearance-site-actions.js` | Read-only page sampling and the host/account-gated Google/Gemini controls. |
| `src/appearance-site-setup.js` | Original website-setting journal and verified Undo. |
| `src/appearance-favicons.js` | Presentation-only contrast for recognised stock GitHub icons. |
| `src/appearance-settings.js`, `src/appearance-icons.js` | Configure editor and existing icon options. |
| `tools/build.cjs` | Generates the Sine scripts, both manual variants and adjacent content actors. |

Edit shared source, then rebuild. Do not patch generated variants independently.
Keep the mod ID, toolbar widget ID and existing preferences stable unless an
explicit migration is designed. Opening settings must not migrate preferences.
The public-suffix service keeps independent hosted sites separate. Google
Search/Images share a service group; Gemini, Gmail and Drive do not join it.

## Local build and deterministic checks

Prerequisites: a fresh checkout, Node.js 20 or later, npm, and Python 3.10 or
later. These commands were checked in PowerShell 7 with Node 24.22.1 and Python
3.12.14. Use an ordinary development account, without administrator privileges.
Run from the repository root. There are no interactive prompts.

Install development dependencies into project scratch, using the retained lock:

```powershell
New-Item -ItemType Directory -Force -Path .backup-scratch/test-tools | Out-Null
Copy-Item -LiteralPath tools/test-dependencies/package.json,tools/test-dependencies/package-lock.json -Destination .backup-scratch/test-tools
npm.cmd ci --prefix .backup-scratch/test-tools --cache .backup-scratch/npm-cache --ignore-scripts --no-audit --no-fund
```

Expect npm's package summary and exit code 0, normally within a minute. Stop on
a lock, integrity, network or permission error; do not install packages globally
or remove the lock to get past it. A retry can repeat this dependency-only step.
Its rollback is removal of the generated test-tools directory and npm cache;
neither is needed by the installed mod. Backup exclusion of scratch is a local
policy decision, not something this repository configures.

The following checks do not start a browser or access external websites:

```powershell
node tools/build.cjs --check
node --test tests/*.test.cjs
python -B -m unittest discover -s tests -p 'test_*.py'
```

Expect generated-file parity, 208 passing JavaScript checks and 10 passing
Python helper checks on this revision. They normally finish within seconds.
Stop on a failure and inspect it before rerunning. These commands do not change
the mod; after a source edit, run `node tools/build.cjs` deliberately and review
all generated diffs before running the checks again. After deletion of local
test dependencies, repeat the dependency step, not earlier browser tests.

## Native checks in disposable Zen

Native scripts use `tests/native_support.py` and verify the exact profile
identity before controlling it. They create profiles under `.backup-scratch`
and close only their own process. They do not connect to everyday Zen, run the
Sine installer or change the installed browser. Never replace that identity
check with a connection to an unspecified debugging port.

Windows is required by the current launcher. The default executable is
`C:\Program Files\Zen Browser\zen.exe`. `SAT_NATIVE_BINARY` may select a copy
under this project's scratch directory only. `SAT_NATIVE_HEADFUL=1` shows the
owned test window. `SAT_NATIVE_CONTENT_SANDBOX=1` keeps the normal content
sandbox; the launcher's legacy default disables it in that child only. Choose
and record the mode when comparing runs. No global browser preference or
environment variable needs changing.

Optional native commands, run individually from the repository root in the
same ordinary PowerShell session:

| Command | Coverage and network |
| --- | --- |
| `python -B tests/native_page_appearance.py` | Offline page-owned Light/Dark buttons, actual icon/tooltip, navigation, unknown palettes and unload. |
| `python -B tests/native_appearance.py` | Offline scopes, workspaces, native browser defaults and lifecycle. |
| `python -B tests/native_private.py` | Offline private-window choice isolation. |
| `python -B tests/native_favicons.py` | Public GitHub requests; stock icon contrast, restore readiness, custom/external ownership and cleanup. |
| `python -B tests/native_sites.py sine` | Public Google/Gemini requests in a fresh signed-out fixture, including website setup and Undo. |
| `python -B tests/native_google_results.py --allow-manual-challenge` | Visible Search/Images fixture. Stops or waits for the user at a Google challenge; never bypasses it. |
| `python -B tests/native_google_results.py --images-only --allow-manual-challenge` | Independent Images fixture seeded with Google Light. Does not establish Search or a Search-to-Images transition. |

Expect named assertions, an output path under scratch and exit code 0 on success.
An online run can take several minutes; the Google challenge wait is at most
five minutes. Do not interact with a running fixture except its explicitly
requested challenge. Stop on a challenge timeout, unexpected sign-in, startup
crash, failed assertion or identity mismatch. A new run creates a new profile;
it does not resume an earlier website action. Keep the failed run's receipt
before retrying a diagnostic. Never classify a traffic challenge or a browser
startup crash as a failed SAT colour comparison.

These relocated historical native scripts were syntax-checked during the
consolidation. Their browser/network paths were not rerun then. The 1.3.2
page-appearance result and 1.3.0 favicon result are retained below. Websites and
Gecko internals can change, so record the installed Zen/Gecko version and current
source hashes on any new native run. A startup crash before SAT loads is an
environment limitation; it does not prove the mod failed. Do not fall back to
the everyday profile to bypass it.

### Sine manager and Configure integration

The optional integration tests use 21 non-asset upstream files pinned to Sine
commit `fb0bd4ca6af888f10648e126947f7d1f82228433`. The manifest contains Git blob
hashes; upstream licensing remains with Sine. Restore the fixture with:

```powershell
python -B tools/fetch-sine-fixture.py
python -B tools/fetch-sine-fixture.py --check-only
```

The first command downloads only missing pinned public files into scratch; it
does not run them. The second is offline and checks every hash. Expect a
21-file match and exit code 0, normally within a minute for a new download.
Stop on any mismatch; preserve an existing differing fixture instead of
overwriting it. Repeating the first command reuses matching files and fetches
only missing files. Remove only the fixture directory to undo this setup.

Then `python -B tests/native_sine.py` and `python -B tests/native_settings.py`
exercise the real manager callbacks and Configure markup/CSS inside an owned
offline profile. They omit the full installer, updater, marketplace, assets and
localisation startup, and do not prove those paths. The consolidation checked
the restored 21-file fixture against GitHub's pinned tree; the download branch
and native integration runs were not rerun.

## Evidence and current limits

- [1.3.0 repairs and original native coverage](../verification/release-1.3.0.md)
- [42 historical native GitHub/Essential checks](../verification/release-1.3.0-native-favicons.json)
- [1.3.1 default scope](../verification/default-scope-1.3.1.md)
- [1.3.2 detector and its limits](../verification/page-appearance-1.3.2.md)
- [19 historical native detector checks](../verification/page-appearance-1.3.2-native.json)
- [BBC Sport observation and its proof boundary](../verification/2026-10-04-bbc-sport.md)

The native results are privacy-reduced check summaries, not raw browser dumps.
Search and Images passed in separate historical fixtures; signed-in account
routing and a full same-profile Search-to-Images sequence remain distinct
coverage gaps. Everyday acceptance, native Firefox and full fx-autoconfig
startup are not established by the disposable checks.

## Publishing and rollback

Review source, generated packages, tests, metadata and documentation together.
Run the deterministic checks and only the native checks relevant to a behavior
change. Inspect the public diff for private paths, account data, cookies,
tokens, browsing history and screenshots before publishing. Update the agreed
branch without force and read back the commit and changed file hashes. Do not
retry an uncertain push without inspecting the remote branch first.

Publish a version bump for runtime changes; do not invent a runtime release for
a documentation-only consolidation. Publishing is separate from installation
or user acceptance. The README explains preserving preferences and toolbar
placement, clean restart and the website setup Undo procedure.

## Keeping disk use small

Native profiles, caches, extracted browsers and routine output belong in
`.backup-scratch`. They are not repository content. Close owned test windows
before removing their profiles. Keep a concise result and relevant versions,
inputs and hashes before removing a diagnostic environment. Preserve exact
browser installers if reproducing an old build matters; an extracted copy can
be recreated from its installer. Locked npm dependency manifests are tracked
under `tools/test-dependencies` so dependencies need not be kept locally.

Inspect scratch before deleting it: it can also contain a unique prototype,
capture or final result. Private local archives are ignored under
`.local-private`; they are not required to build or test this repository.
Never publish browser profiles, raw diagnostic receipts or a private archive,
and never treat GitHub Actions secrets as storage for private development notes.
