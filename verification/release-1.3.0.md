# Version 1.3.0 verification

Tested on Zen 1.23b / Gecko 157.0 in disposable profiles. The package keeps the same mod ID, preferences and toolbar widget. No everyday-profile installation is implied by these results.

## What changed

- Toolbar choices belong to the current website. Existing workspace-only configuration resolves to website choices within each workspace; unrelated sites do not inherit a toolbar click.
- Configure has a bounded width and height, folded advanced controls, and editable saved website choices. Grouping controls which hostnames share a choice; ordinary toolbar use saves colours without learning grouping rules.
- Stock GitHub icons use the sidebar's colour scheme for contrast, including restored Essentials. The mod preserves custom icons, native favicon data, pin/reset data and unloaded state, and releases its own rendering on unload.
- A deliberate Google/Gemini toolbar choice can set the website's own theme to Device default/System, with the original setting recorded for Undo. Google repaint waits for its completed colour-preference report before one bounded retry and independently verifies the rendered palette.
- Unsent Google search input stays in memory through repaint, with cursor/focus restoration, protection for newer edits and explicit recovery when restoration cannot finish.

## Results

| Check | Passed |
| --- | ---: |
| Local JavaScript suite, including verification-helper regressions | 191 |
| Python readiness and result-proof checks | 10 |
| Native appearance, scopes and lifecycle | 45 |
| Sine manager lifecycle | 16 |
| Private windows | 6 |
| Configure layout, editing and cleanup | 25 |
| Supported-site sequence, Sine package | 19 |
| Supported-site sequence, each manual variant | 9 |
| Generated GitHub favicon lifecycle and ownership | 42 |
| Actual Google Search results | 11 |
| Actual Google Images results, separate fixture | 13 |

Search and Images each rendered Light, Dark and Light while retaining their query/results and leaving the native global Dark default unchanged. Their challenges were completed manually. Images used a fresh profile seeded with the saved Google Light choice; it verifies the saved choice and explicit toggles, not a same-profile Search-to-Images transition.

The favicon run captured a temporary native missing-source state during Essential restoration. The source and correct contrast returned at the next sample, 103 ms later. The readiness assertion checks the actual replacement document and stock icon independently of the contrast assertion.

An earlier Google Undo operation stopped on a navigation guard. Later native runs succeeded. Its initiating event remains unexplained; fault tests verify that an interruption retains the original-setting record and supports an explicit retry without overwriting a later external choice. This release does not claim that the initiating event was eliminated.

## Reproduction and limits

The public JavaScript tests cover the mod's policy, controls, lifecycle and failure recovery. The six local Google-page detector tests and private diagnostic receipts are not part of this public package; the published JavaScript suite therefore contains 185 tests. Install jsdom only as a development dependency under disposable scratch, then check the generated files and run the tests:

```sh
npm install --prefix .backup-scratch/test-tools --cache .backup-scratch/npm-cache --ignore-scripts --no-audit --no-fund jsdom@26.1.0
node tools/build.cjs --check
node --test tests/*.test.cjs
```

The mod itself has no new runtime dependency. Retained older native scripts and reports belong to their documented versions. Signed-in account routing, everyday-profile acceptance, Firefox and the complete fx-autoconfig startup path have not been established by this release's disposable checks. The manual variants were tested as trusted scripts in Zen.

The button requests a website's own appearance; it does not generate a dark stylesheet for pages that have no dark design. Google and Gemini have specific setup support. Other sites may ignore the browser preference or use their own setting.

## Upgrade and rollback

Keep the same mod ID, saved preferences and toolbar placement. Restart after updating for a clean load. Do not run multiple script variants together.

Before rolling back, use **Undo website setup** for any website-owned changes you want restored. Disable 1.3.0, restore the preceding package and restart. Saved SAT preferences can remain. Restore the global default separately if it was deliberately changed. Disabling alone does not undo Google/Gemini website settings.
