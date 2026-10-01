# Zen Site Appearance Toggle

A toolbar button that remembers whether you want websites to request light or dark appearance. You can remember that choice per workspace, per website, or per website within each workspace.

**Version 1.2.0** adds remembered appearance by website and workspace. See [verification](verification/README.md) for the tested behaviour and website-specific limits, including Google Search.

## Using the button

Click to switch between Light and Dark. The choice is saved for the remembering mode selected in **Sine Mods → Zen Site Appearance Toggle → Configure**. It survives unloading a tab, opening the site again and restarting Zen.

Right-click the button for four choices:

- **Light** or **Dark** saves an explicit choice.
- **System** saves a choice that follows the operating system, even if your browser default is different.
- **Use browser default** removes the exception for this scope.

The button and tooltip describe the appearance requested from the website. A website can have its own theme setting and ignore that request. SAT does not recolour pages or change account theme settings.

## Browser default and remembering mode

**Browser default** in Configure controls the same System/Light/Dark setting as Zen's **Settings → Appearance → Web site appearance**. Changing either control updates the other. Opening Configure does not change it.

| Remember choices | Example |
| --- | --- |
| Per workspace | Work requests Light; Personal requests Dark. |
| Per site | A news site requests Dark wherever you open it. |
| Per site within each workspace | The same news site requests Light in Work and Dark in Personal. |

An ordinary tab uses the workspace it belongs to. Shared Essentials use the active workspace of their window. Background tabs keep their own appearance instead of changing whenever you select an unrelated tab.

Each mode retains its own saved choices. Switching modes does not erase them or blend them together. A missing choice uses the browser default. The initial mode is Per workspace, preserving existing workspace choices; Firefox uses Per site because it has no Zen workspaces.

Choices made in a private window are temporary and do not write to the normal saved settings. Change persistent configuration from a normal window.

## How websites are recognised

Changing a path, search query or fragment does not create another preference. Normal HTTP/HTTPS addresses and a site's bare/`www` forms share a group. Recognition uses the browser's public-suffix service, so independent hosted sites such as `alice.github.io` and `bob.github.io` remain separate.

A small set of service rules separates independent services on shared domains. Google Search and Images share a group; Gemini, Gmail and Drive are separate. External websites opened from image results keep their own groups. Non-default ports remain separate.

In Configure, **Site grouping** lets you enter an exact hostname and:

- restore automatic recognition;
- keep the hostname separate;
- join a group that already has a saved choice or grouping rule.

The preview shows the destination's choice for the selected remembering mode. In the combined mode, it lists the saved choices by workspace. Grouping rules apply across workspaces, but appearance choices still follow the selected mode. Conflicting old choices are retained, so restoring the old grouping makes those choices available again. The resolver never needs browsing history, page titles, search terms or favicons.

## Google and Gemini

Gemini's **Settings → Theme → System** follows the browser request in the signed-out native test. Its explicit Light or Dark setting takes precedence, which can make the SAT button appear ineffective.

Google Search has a separate **Dark theme** setting; choose **Device default** to let it follow the browser. Its homepage does not necessarily update when the browser preference changes: in the disposable test, it could show the previous colour on the first navigation and match the new preference on the next. That delay occurs with Zen's native setting too. SAT does not automatically reload your Google pages. Google blocked automated Search and Images results with a traffic challenge, so those pages have not received complete rendering verification. See the [verification report](verification/README.md).

There was also a demonstrated SAT defect: the old button could say “Switch to Light” but reset forced Dark to System, which remained dark when the system was dark. The new button saves the opposite explicit appearance instead.

## Icons and placement

Existing Original/Zen icon sets, Sparkle/Sun choice and individual icon overrides remain in Sine Configure. The native toolbar widget keeps the same ID and supports Customize Toolbar placement. The manual Sparkle and Sun variants use the same appearance logic.

## Installation and upgrade

The usual Sine package consists of `theme.json`, `preferences.json`, the declared scripts and `chrome/userChrome.css`. This fork publishes the package on `main`. In Sine, use the repository `YiftahCooper/Zen-Site-Appearance-Toggle` and branch `main`. The upstream store version is managed separately.

When upgrading from 1.1.0 or 1.1.1, keep the same mod ID and preserve existing `mod.zensiteappearancetoggle.*` preferences and toolbar placement. **Restart after upgrading from 1.1.0 or 1.1.1:** those versions do not unregister its old listeners, so replacing files during the same session is not a clean upgrade. Version 1.2.0 supports Sine unload/re-enable.

No default is reset on startup. Existing saved workspace values are read directly; old Auto entries remain explicit System choices. The new site/grouping records are stored separately. Old temporary session-only overrides were never persistent and do not become saved records automatically.

For an existing [fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) installation, choose one generated manual script:

- [Sparkle](chrome/JS/moon-sparkle/zen-colorscheme-toggle-sparkle.uc.js)
- [Sun](chrome/JS/moon-sun/zen-colorscheme-toggle-sun.uc.js)

Copy only that variant into the loader's `chrome/JS/` folder and retain the existing [button CSS](chrome/userChrome.css). The full Configure editor requires Sine. The standalone variants read the same preferences and provide the same toolbar menu; native fx-autoconfig and Firefox acceptance are still separate from the tested Sine/Zen path. Do not run two variants together.

## Rollback

Disable version 1.2.0 before restoring the previous package, then restart. Retain the existing preferences and toolbar placement. The new records can stay in the profile: 1.1.1 does not read them, and they will be available if you return to 1.2.0. Existing workspace choices keep their old numeric format. If you deliberately changed the browser default during a trial, restore its recorded pre-trial value separately.

Disabling 1.2.0 releases its tab overrides and keeps your chosen native browser default. It does not delete saved choices. Installing an update does not require clearing saved preferences or recreating the toolbar button.

## Development

Edit `src/`, then run `node tools/build.cjs`. The builder produces the Sine script, both standalone icon variants and the settings bridge; no build tools or dependencies run inside the mod.

Test commands, scratch regeneration, native evidence and rollback limits are in [verification/README.md](verification/README.md). The earlier Essentials repair is retained in [the 1.1.1 report](verification/essentials-1.1.1.md).
