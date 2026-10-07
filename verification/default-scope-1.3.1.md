# Per-site within workspace default

Requested on 5 October 2026. Version 1.3.1 changes the default and invalid-value fallback to `workspace-site` in both the browser adapter and Configure. Explicit `site` and `workspace-site` selections remain intact; legacy `workspace` still resolves to `workspace-site`. Browsers without Zen workspaces continue to use `site`. Opening Configure does not write a preference or migrate stored choices.

The existing default expectations failed before implementation, then all 38 focused browser-scope, Configure and generated-variant lifecycle checks passed. All generated files match shared source. No native profile was opened or changed for this small default change. The broader native receipts remain evidence for published 1.3.0, not new native acceptance for this follow-up.

This follow-up is based on 1.3.0 commit `8435fbc6be34dc86fc7ea15d74b48dc3ae1e8934`. The earlier frozen release hashes describe 1.3.0, not this changed package. Installation and everyday-profile acceptance remain separate from publication.

To reproduce the focused checks, use the development dependency setup in the 1.3.0 verification notes, then run:

```sh
node tools/build.cjs --check
node --test tests/browser-scope.test.cjs tests/appearance-settings.test.cjs tests/workspaces.test.cjs
```

Rollback to the preceding package restores its unset-preference default. Existing explicitly saved scopes and website choices require no migration or deletion.
