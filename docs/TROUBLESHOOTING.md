# Appearance troubleshooting and retained findings

SAT requests a website appearance through the browser. It does not generate a
dark stylesheet for a site that supplies no dark design. Compare the requested
preference, the website's own setting and its painted colours separately.

## Button, browser default and remembering

The toolbar acts on the current website. Configure's browser default mirrors
Zen's native System/Light/Dark setting. Ordinary toolbar use must not change
that global preference. The sparkle or sun means Light; the moon means Dark.
System is a separate right-click choice, not the sparkle icon.

Zen initially remembers a website within its workspace. Per-site mode shares
its choice across workspaces. Shared Essentials use the active workspace; an
ordinary tab belongs to its own workspace. A toolbar choice is remembered and
visible in Configure. Grouping does not learn from clicks: Apply grouping
changes which hostname shares a saved choice, not its colour.

## Google Search and Gemini

Both sites can save their own explicit theme, which can override the browser's
Light/Dark request. Gemini's System follows the request delivered to that tab.
It is distinct from SAT's explicit System choice, which follows the operating
system even when the browser default differs.

On a deliberate SAT choice, the supported adapter records the original website
setting, selects System/Device default and verifies it. Google setup uses a
temporary settings tab in the same container and closes it. Undo website setup
restores the original setting only after independent readback and refuses to
overwrite a later conflicting external choice. Disabling SAT alone does not
undo a website-owned setting.

Google's server-rendered palette can lag the content media query. Its recorded
`data-pcs` marker alone does not prove the visible colour. The repair preserves
the URL's query, Images mode, filters, account selector and fragment, waits for
the site's colour-preference report and allows at most one bounded additional
reload. An explicit website Off/On setting was shown to override both `cs=1`
and `cs=2` hints; URL hints alone were insufficient. Unsent text, selection and
focus are restored only when newer user edits are protected; failed drafts have
an explicit copy action and remain in memory, not preferences or files.

Google result recognition must see actual visible result evidence. A search
field, help link or `udm=2` parameter does not prove Search or Images results.
The retained helper tests cover ordinary links, opaque `/goto` links with a
visible external citation, and Images preview cards with a loaded thumbnail
and external source. Treat a traffic challenge separately from appearance.

## GitHub icons and restored Essentials

GitHub can replace its stock black/white favicon when its page theme changes.
A loaded tab and an unloaded tab can therefore have different native sources.
SAT 1.3.0 applies contrast to recognised stock glyphs according to the actual
sidebar colour scheme. It does not replace favicon data, pinned/reset data or
custom/unknown artwork. External filter changes take ownership immediately;
unload restores the previous inline values and priority.

During native Essential restore, a transient missing source occurred and
returned about 103 ms later. A loaded flag alone was an inadequate readiness
test. `RestoredIconReadiness` requires a completed replacement document at the
expected URL with both native and stock icon sources stable over three samples.
Readiness is independent of contrast so it cannot hide a rendering failure.

## Icon differs from the page

Before 1.3.2 the icon described the requested mode, which could show Dark on a
fixed-light site. The read-only detector now samples nine visible background
points, composes transparent ancestors and requires seven agreeing clear
Light/Dark samples. It checks the selected loaded page every 750 ms and obtains
a fresh result for a click. Website-owned theme changes update the icon without
saving a SAT choice. Results are tied to the tab/document/URL/request so stale
answers cannot repaint another page's icon.

Mixed colours, images, opacity, filters and unsupported colours can be unknown.
The tooltip then explains the requested-mode fallback. A fixed-light site can
keep its light icon after a saved Dark request; that is a visible-page reading,
not proof that the browser request was applied to the site's design.

## BBC and remaining boundaries

The retained BBC Sport article had a fixed light body and no matching dark-mode
stylesheet or control during a source/rendering inspection. That supported a
missing-native-dark-design hypothesis, but was not a native Light/Dark SAT
comparison and did not prove every BBC section behaves alike. No speculative
BBC recolouring was added. See the linked observation in the development guide.

An earlier Google Undo run stopped on a navigation guard; later runs succeeded.
Its initiating event was not established as eliminated. Recovery regressions
preserve the original-setting journal across interruption and avoid overwriting
a later external website choice. Signed-in routing, Firefox, full manual-loader
startup and everyday acceptance retain their separate proof boundaries.

For a new failure, record the current package/browser versions, exact public
URL, native browser default, SAT saved scope/choice, website-owned theme,
reported media query and actual colours in a fresh disposable profile first.
Keep private captures out of public issues and commits. The development guide
contains the reusable checks and the versioned evidence.
