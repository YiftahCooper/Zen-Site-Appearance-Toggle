# Version 1.2.0 verification

Verified on 1 October 2026 with Zen 1.22.3b / Gecko 156.0.1. Tests used fresh disposable profiles and synthetic tabs. Publication is separate from everyday-profile installation and acceptance.

## Requirements and results

| Requirement | Evidence |
| --- | --- |
| Selecting Essentials must preserve the browser default and unrelated background tabs | Native Essential/workspace switches and independent background rendering |
| Clicking must choose the advertised opposite appearance | Rendered Light under Dark defaults; legacy browser-theme default tested separately from System |
| Configure controls Zen's actual System/Light/Dark default | Clicks on Zen's real appearance picker and two-way synchronization with Configure |
| Remember by workspace, website, or website within each workspace | Policy tests and native workspace/site rendering |
| Keep choices after navigation, unloading, reopening and restart | Native navigation, discard/restore, restart and persisted-record checks |
| Recognize Search and Images together and keep independent services separate | Service rules, native public-suffix service and grouping tests |
| Retain icons, toolbar placement and old workspace choices | Same widget ID, original icon options, three variants; Sine preserves legacy records |
| Private choices do not change normal saved settings | Native private-window checks and persistence tests |

All **51 Node tests**, **43 native appearance checks**, **15 actual Sine manager checks**, and **4 native private-window checks** passed. All four generated scripts match shared source.

Public results omit machine identity and profile paths:

- [Native appearance](release-1.2.0-native-appearance.json)
- [Sine manager APIs](release-1.2.0-native-sine.json)
- [Private windows](release-1.2.0-native-private.json)

Sine checks used unmodified source pinned to [CosmoCreeper/Sine commit fb0bd4c](https://github.com/CosmoCreeper/Sine/tree/fb0bd4ca6af888f10648e126947f7d1f82228433). They invoked its actual script loader, Configure renderer, rebuild, disable and re-enable APIs. A minimal `sineModsList` host was supplied in native about:preferences. This covers those APIs, not the complete installer, downloader or updater.

Independent review found and repaired transferred-tab override ownership, unresolved workspace IDs, aliased ports, grouping previews reading the wrong mode, native System binding, and inherited browser-theme detection. Focused regressions cover these repairs. On this Zen version, native value 2 follows System; legacy value 3 follows the browser's derived content theme. Configure displays both as the native picker does, preserves existing values on opening, and writes native value 2 when System is explicitly selected. SAT now reads each correctly and responds to native theme changes.

The previous workspace-only implementation and its native test are retained in [version 1.1.1's commit](https://github.com/YiftahCooper/Zen-Site-Appearance-Toggle/tree/45a24213b4fe3cbe77eecc9ab34c9921fee6340a). Its test assumed the old global-preference behavior and has been replaced by the 1.2.0 rendering suite.

## Google and Gemini

The old SAT toggle returned an explicit Light/Dark choice to Auto instead of choosing its advertised opposite. Version 1.2.0 selects an explicit opposite; System and browser inheritance are separate menu choices.

Websites also control their own appearance. Gemini's explicit Dark setting ignored a Light browser request. Its own System setting followed Light/Dark/Light in the native test. Google Search's explicit Off setting similarly chose Light despite receiving a Dark browser signal. Device default allowed a fresh Google homepage to follow the browser.

Google's homepage can show the previous appearance on the first navigation and catch up on another navigation. This occurred with Zen's native default as well as SAT's per-site override. It does not establish a native Zen defect. SAT does not rewrite account theme settings or automatically reload pages.

Google Search and Images result pages presented an automated-traffic challenge in disposable testing. The grouping policy is tested, but complete rendered-result-page acceptance is still unverified. Full native Firefox and fx-autoconfig loading are also untested; their variants and no-Zen fallback have model coverage.

## Reproduce the included checks

Use Node and Python. The mod has no new runtime dependency. DOM tests use jsdom only in disposable scratch:

```powershell
npm.cmd install --prefix .backup-scratch/test-tools --cache .backup-scratch/npm-cache --ignore-scripts --no-audit --no-fund jsdom@26.1.0
node tools/build.cjs --check
node --test tests/*.test.cjs
python tests/native_appearance.py
python tests/native_private.py
```

The native harness expects Zen at `C:\Program Files\Zen Browser\zen.exe`. It creates a unique `.backup-scratch/` profile, uses an ephemeral localhost port, verifies the exact profile before automation, and closes only its owned process. A dead proxy blocks external traffic; local HTTP fixtures supply rendered pages. The headless child's content-sandbox environment option affects only that process. Useful results are retained under `verification/`; generated profiles, logs and dependencies are disposable. Backup exclusions for scratch were not verified or changed.

## Upgrade and rollback

Keep the same mod ID, preference keys and toolbar placement. **Restart after upgrading from 1.1.0 or 1.1.1**, whose listeners cannot be cleanly unloaded in an existing session. Version 1.2.0 registers Sine cleanup callbacks.

To roll back, disable 1.2.0, restore the previous package and restart. Keep existing preferences: the old workspace map retains its numeric format, and new site/grouping records can remain for a later return to 1.2.0. Restore the browser default separately if deliberately changed during a trial.
