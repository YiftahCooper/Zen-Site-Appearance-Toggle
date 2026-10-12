# Zen Site Appearance Toggle

A toolbar button that remembers whether you want each website to use Light or Dark. Share a website's choice across workspaces, or remember a different choice for that website in each workspace.

**Version 1.3.2:** the toolbar icon and next-click action follow the selected page's detected appearance, including changes made with the website's own theme controls. See [the verification notes](verification/page-appearance-1.3.2.md).

Version 1.3.1 made Per site within each workspace the default in Zen; explicit mode selections are preserved. See the [follow-up verification](verification/default-scope-1.3.1.md).

Version 1.3.0 repaired website-only toolbar scope, the Configure dialog and stock GitHub favicon contrast, and added reversible Google/Gemini setup. Those repairs remain in 1.3.1. See the [verification summary](verification/release-1.3.0.md) for tested behavior and remaining limits.

## Using the button

Click to switch between Light and Dark. The choice is saved for the remembering mode selected in **Sine Mods → Zen Site Appearance Toggle → Configure**. It survives unloading a tab, opening the site again and restarting Zen.

Right-click the button for four choices:

- **Light** or **Dark** saves an explicit choice.
- **System** saves a choice that follows the operating system, even if your browser default is different.
- **Use browser default** removes the exception for this scope.

The sparkle or sun represents **Light**; the moon represents **Dark**. System is a separate right-click choice. The tooltip describes what the next click will do.

SAT samples the visible surfaces of the selected, loaded web page. The icon follows the detected Light/Dark appearance even when it differs from the browser request or a saved SAT choice. Changes made using a website's own theme controls are checked every 750 ms; a toolbar click also reads the current page before choosing the opposite appearance. Detection does not save a choice or change the website's own setting.

Mixed colours, image backgrounds and other complex surfaces can make detection uncertain. In that case the icon falls back to the requested appearance and the tooltip says that the page theme was not detected. If a website stays Light despite a Dark request, a detected light icon continues to describe the visible page; the tooltip explains the difference. The selected page alone is sampled, and hidden windows and unloaded tabs are skipped.

The toolbar changes the current website's choice. It never changes the browser-wide default or applies an exception to unrelated websites. On supported Google Search and Gemini pages, the first deliberate toolbar choice also makes the website's own theme follow the browser. SAT saves the original website setting for **Undo website setup** in Configure. Other websites may still ignore browser appearance requests when they have their own explicit theme.

## Browser default and remembering mode

**Browser default** in Configure controls the same System/Light/Dark setting as Zen's **Settings → Appearance → Web site appearance**. Changing either control updates the other. Opening Configure does not change it.

| Remember choices | Example |
| --- | --- |
| Per site | A news site requests Dark wherever you open it. |
| Per site within each workspace | The same news site requests Light in Work and Dark in Personal. |

An ordinary tab uses the workspace it belongs to. Shared Essentials use the active workspace of their window. Background tabs keep their own appearance instead of changing whenever you select an unrelated tab.

Each mode retains its own saved choices. Switching modes does not erase them or blend them together. A missing choice uses the browser default. The initial mode in Zen is **Per site within each workspace**; an explicitly selected mode is preserved. Firefox uses Per site because it has no Zen workspaces. An old Per workspace setting also means Per site within each workspace. Old workspace-wide records remain visible as inactive legacy entries and are not applied to unrelated websites.

Choices made in a private window are temporary and do not write to the normal saved settings. SAT does not automatically change website-owned theme settings there: a supported website must already use System/Device default. Change persistent configuration from a normal window.

## How websites are recognised

Changing a path, search query or fragment does not create another preference. Normal HTTP/HTTPS addresses and a site's bare/`www` forms share a group. Recognition uses the browser's public-suffix service, so independent hosted sites such as `alice.github.io` and `bob.github.io` remain separate.

A small set of service rules separates independent services on shared domains. Google Search and Images share a group; Gemini, Gmail and Drive are separate. External websites opened from image results keep their own groups. Non-default ports remain separate.

Toolbar clicks automatically save the appearance choice and make it viewable under **Saved website choices** in Configure. Grouping does not learn from toolbar clicks. **Apply grouping** changes which preference an exact hostname uses; it does not apply a colour or save a new Light/Dark choice. Under **Advanced: site grouping and icon overrides**, enter a hostname to:

- restore automatic recognition;
- keep the hostname separate;
- join a group that already has a saved choice or grouping rule.

The preview shows the destination's choice for the selected remembering mode. In the combined mode, it lists the saved choices by workspace. Grouping rules apply across workspaces, but appearance choices still follow the selected mode. Conflicting old choices are retained, so restoring the old grouping makes those choices available again. The resolver never needs browsing history, page titles, search terms or favicons.

## Google and Gemini

Gemini's own explicit Light/Dark setting can override the browser request. On the first deliberate toolbar choice, SAT reads that setting, records its original value, selects Gemini **System**, verifies the change, then applies the current website's SAT choice. Gemini System follows the appearance request delivered to that tab; the SAT right-click **System** choice specifically follows the operating system.

Google Search similarly has its own **Dark theme** preference. SAT reads it through a temporary background Search settings page in the same container, records the original mode and selects **Device default**. The temporary page is closed after the operation.

Google can keep its previous server-rendered colours after the browser request changes. The candidate navigates the selected Google page using its current URL and Google's colour-scheme parameter, preserving the loaded search query, Images mode, filters, account selector and fragment. If the palette is stale, it waits for Google's own colour-preference report to finish before at most one additional reload, then verifies the resulting theme marker and browser request. If that report does not complete or verification fails, the saved choice remains and the toolbar reports the failure. The final candidate passed native Google homepage checks and separate actual Search and Images Light/Dark/Light checks in disposable Zen 1.23b profiles. These signed-out checks retained the query/results and global browser default; signed-in account routing remains a separate limit.

Changing System, browser inheritance, or the relevant workspace's choice can repaint a selected Google tab previously used with SAT. A reopened page with a saved website choice is checked before any compensating navigation. Background, unloaded and unrelated tabs are not automatically reloaded.

The candidate captures unsent Search input, its cursor/selection and scroll position in memory before navigation. It restores them when the current input has not been edited again, and pauses a retry if you type new text after the first navigation. If restoration fails or newer input needs to be preserved, the earlier text remains available under **Copy unsent Google search** in the button's right-click menu. Only choosing that command writes to the clipboard; no draft is saved to preferences, files or the setup journal. Multiple failed drafts are retained until the mod stops, so a later successful repaint does not discard an earlier recovery copy. Native homepage checks verified unsent text, selection and focus restoration on the final candidate; cancellation, newer edits and failure-recovery branches also have source regressions.

**Undo website setup** restores the original website-owned theme preference after independent readback. It leaves saved SAT toolbar choices intact. If the website's theme was changed outside SAT, Undo reports the conflict and preserves it. Disabling the mod alone does not undo website-owned settings; use Undo first when rolling back. Explicit numeric Google/Gemini account routes and containers have separate recovery records; signed-in account-routing acceptance remains unverified.

There was also a demonstrated SAT defect: the old button could say “Switch to Light” but reset forced Dark to System, which remained dark when the system was dark. The new button saves the opposite explicit appearance instead.

## Icons and placement

Existing Original/Zen icon sets, Sparkle/Sun choice and individual icon overrides remain in Sine Configure. The native toolbar widget keeps the same ID and supports Customize Toolbar placement. The manual Sparkle and Sun variants use the same appearance logic.

For GitHub's exact stock black and white SVGs, SAT adjusts the displayed glyph to the sidebar's actual colour scheme. It leaves custom and unknown icons alone and does not rewrite native favicon data, cached icons, tab/pin reset data or unloaded tab state.

## Installation and upgrade

The usual Sine package consists of `theme.json`, `preferences.json`, the declared scripts and `chrome/userChrome.css`. This fork publishes the package on `main`. In Sine, use the repository `YiftahCooper/Zen-Site-Appearance-Toggle` and branch `main`. The upstream store version is managed separately.

When upgrading from 1.1.0 or 1.1.1, keep the same mod ID and preserve existing `mod.zensiteappearancetoggle.*` preferences and toolbar placement. **Restart after upgrading from 1.1.0 or 1.1.1:** those versions do not unregister its old listeners, so replacing files during the same session is not a clean upgrade. Version 1.2.0 supports Sine unload/re-enable.

No browser default is reset on startup. Existing website/grouping records are retained. Old workspace-wide values keep their original numeric format as inactive legacy entries. Old temporary session-only overrides were never persistent and do not become saved records automatically.

For an existing [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) installation, choose one generated manual script:

- [Sparkle](chrome/JS/moon-sparkle/zen-colorscheme-toggle-sparkle.uc.js)
- [Sun](chrome/JS/moon-sun/zen-colorscheme-toggle-sun.uc.js)

Copy the selected variant **and its adjacent `appearance-site-child.mjs`** into the same loader folder, and retain the existing [button CSS](chrome/userChrome.css). Keep the helper's plain `.mjs` filename: `.sys.mjs` files are automatically imported as background modules by fx-autoconfig. The full Configure editor requires Sine. The standalone variants read the same preferences and provide the same toolbar menu; native fx-autoconfig and Firefox acceptance are still separate from the tested Sine/Zen path. Do not run two variants together.

## Rollback

Before rolling back the candidate, use **Undo website setup** for any website-owned theme changes you want to restore, then disable it, restore the previous package and restart. Retain the existing preferences and toolbar placement. Website/grouping/setup records can stay in the profile for a later return. Existing workspace choices keep their old numeric format. If you deliberately changed the browser default during a trial, restore its recorded pre-trial value separately.

Disabling SAT releases its tab overrides and owned favicon presentation and keeps your chosen native browser default. It cancels pending website actions and does not delete saved choices. Google may need a reload to render the inherited default after disable. Installing an update does not require clearing saved preferences or recreating the toolbar button.

## Development

Edit `src/`, then run `node tools/build.cjs`. The builder produces the Sine script, both standalone icon variants and the settings bridge; no build tools or dependencies run inside the mod.

Test commands, scratch regeneration, native evidence and rollback limits are in [verification/README.md](verification/README.md). The earlier Essentials repair is retained in [the 1.1.1 report](verification/essentials-1.1.1.md).
