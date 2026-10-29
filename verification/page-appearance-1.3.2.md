# Page appearance detection, 1.3.2

Implemented on 12 October 2026. Previously the toolbar read the requested SAT/browser appearance, so an unfamiliar light page could show a moon under a Dark browser default. The first click could also request Light when the visible page was already light.

The toolbar now uses a read-only sample of the selected page's painted backgrounds. Nine viewport points are checked, compositing transparent ancestors; at least seven must agree on a clearly light or dark surface. Image backgrounds, mixed palettes, unsupported colours or unavailable documents can produce an unknown result. The tooltip identifies the requested-appearance fallback instead of claiming successful detection.

Sampling repeats every 750 ms for a visible window's selected, loaded HTTP/HTTPS page, including websites with their own theme controls. The next toolbar click obtains a fresh sample before requesting the opposite appearance. Results are tied to the tab, document, URL and current appearance request. A stale result cannot update a different tab/document. Observing a page makes no preference writes or website-control changes; unloaded and background tabs are skipped. Stop cancels the queries and timer. The general read operation does not broaden the existing Google/Gemini theme-setting permissions.

## Verification

- The regression fixtures failed against the preceding code, then passed after implementation.
- All 208 local JavaScript checks passed, including page colours, website class/stylesheet changes, toolbar actions, stale asynchronous results, transport guards, unknown palettes and lifecycle cleanup. The original 1.3.2 publication contained 202 of those checks. The development consolidation subsequently included the six Google diagnostic-runner checks, so a current checkout contains all 208.
- All generated scripts and actor helpers match their shared source.
- The generated Sine package passed all 19 native checks on Zen 1.23.2b / Gecko 157.0.1. The checks confirmed the actual icon/tooltip, website-owned Light/Dark controls, first-visit behavior, a fresh toolbar click, a website override of a saved choice, navigation, unknown detection and unload. Global Dark and saved choices were preserved through observation.

The independently checked Sine script SHA256 was `63ad2ac9932b475761b4a72137fd0ec5dca96899870131b9df3c0c7045626d6b`.

The [privacy-reduced native result](page-appearance-1.3.2-native.json) retains the runtime, package hash and all 19 check outcomes without profile paths, process IDs, account details or raw page captures.

Native verification used offline fixtures in a fresh owned disposable profile, launched from normal PowerShell. Tool-launched Zen exited with Windows access violation `0xC0000005` before mod loading. No everyday profile was accessed or modified. Arbitrary real-site palettes, native Firefox and the complete fx-autoconfig startup path are outside this acceptance. This detector estimates the dominant visible background; it cannot guarantee a binary theme for every design or inspect the contents of a cross-origin frame.

## Reproduction and rollback

Use the retained source, fixtures and the jsdom 26.1.0 development dependency setup described in the 1.3.0 verification notes. Routine test output and disposable profiles belong under `.backup-scratch/`; the native check writes `.backup-scratch/page-appearance/native-result.json`.

```sh
node tools/build.cjs --check
node --test tests/*.test.cjs
python -B tests/native_page_appearance.py
```

Installation and everyday-profile acceptance remain separate from publication. To roll back after installing, disable this package, restore 1.3.1 and restart, retaining saved preferences and toolbar placement. This follow-up adds no saved-setting migration. Existing Google/Gemini website setup still has its own Undo procedure described in the 1.3.0 notes.
