# Essentials workspace appearance repair

## What was wrong

Version 1.1.0 inferred the workspace from the selected tab's `zen-workspace-id`. Essentials deliberately lack that attribute. With a manual Dark override in a workspace, selecting an Essential therefore reset the global website preference to Auto; selecting an ordinary tab restored Dark. Websites that react to the preference, including GitHub's favicon code, changed appearance even though the workspace hadn't changed.

Version 1.1.1 reads `gZenWorkspaces.activeWorkspace` instead. It listens to Zen's workspace-change callback so an actual workspace change still applies the correct choice when the selected Essential stays the same. An unknown workspace during startup no longer resets the preference, and initialization retries after Zen is ready.

Toolbar commands use the button's owning window. Widget registration happens once globally; workspace tracking and menus are installed in each window. The Sine script and both manual variants contain the same repair. Settings keys, the mod ID, CSS, icon options and toolbar placement are unchanged.

## Checks

Run the dependency-free JavaScript suite with Node:

```sh
node --test tests/workspaces.test.cjs
```

24 tests cover the three scripts: repeated Essential/ordinary selection, workspace changes with a shared Essential, manual overrides and saved defaults from Essentials, startup with no workspace yet, Firefox's global toggle, a dark system theme, and second-window command routing. The suite models actual loader constraints: duplicate registration throws, ordinary workspace changes use Zen's callback rather than its UI-refresh event, and an older fx-autoconfig callback may supply an undefined window argument.

The original code failed these regression cases before the repair. Native tests also rejected an intermediate implementation that listened only to `ZenWorkspacesUIUpdate`; that event does not fire on every ordinary workspace change in the tested Zen version.

The native harness uses fresh synthetic profiles and verifies their exact paths before automation. On Windows:

```powershell
python tests/native_workspaces.py --zen 'C:\Program Files\Zen Browser\zen.exe'
```

It creates only blank tabs and test workspaces, blocks external proxy traffic, opens a second test window, restarts its own disposable browser, and closes it afterwards. Its output is retained under `verification/native-*.json`; browser profiles and process logs stay under `.backup-scratch/`. The harness uses port 28797 and should not run concurrently with itself. The Windows child-process environment disables the content sandbox for this nested headless test only; it does not change browser installation files or an everyday profile.

The accepted native run on **Zen 1.22.3b / Gecko 156.0.1** passed 20 checks covering:

- Loading the Sine script with an Essential selected and a saved default.
- Switching workspaces while the selected Essential and TabSelect count stay unchanged.
- Repeated ordinary/Essential selections without preference resets.
- Menu defaults and manual overrides from Essentials.
- Leaving and returning to a workspace with a session override.
- Toolbar and menu commands in a second native window.
- A persisted workspace default after restarting the disposable browser.

The native harness loads the Sine script in per-window privileged contexts. It does not claim to test the entire Sine installation/update lifecycle, the full fx-autoconfig loader, or native Firefox. The manual variants and Firefox fallback have source and unit coverage. No everyday-profile installation or acceptance is claimed.

GitHub was separately tested in a disposable native browser before this patch: its favicon follows the browser-reported light/dark preference even if its rendered page theme is forced to the opposite. This repair prevents accidental preference changes; it does not prevent intentional site responses or force unloaded tabs to refresh cached icons.

## Manual reproduction

1. In a disposable Zen profile with the mod, select an ordinary tab and use the toolbar toggle to choose the opposite of Auto, or set a workspace default.
2. Select an Essential, then an ordinary tab. The website appearance choice should remain unchanged.
3. Visit two workspaces and select the same shared Essential in each. Assign different defaults. Switch between them: each choice should apply even when that Essential remains selected.
4. Choose a default and a manual override while an Essential is selected. Leave and return to the workspace. The override should survive until the browser session ends, and the default should survive restart.

The underlying website appearance preference is browser-wide. This mod does not provide simultaneous independent website colour schemes for different windows.

## Rollback and profile safety

No profile migration is required. To roll back an installation, restore the previous script/version and restart the browser. Preserve existing `mod.zensiteappearancetoggle.*` preferences and the configured toolbar placement; do not uninstall/delete those settings merely to replace the script. If a trial temporarily changes the website appearance preference, restore its recorded pre-trial value as well.

Main-profile installation and source switching are separate user-approved actions. The supplied tests never use the normal profile. `.gitignore` excludes scratch from Git, but backup exclusions have not been verified or changed.
