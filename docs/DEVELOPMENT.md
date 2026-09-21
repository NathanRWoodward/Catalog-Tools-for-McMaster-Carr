# Development

## Layout

| Path | Purpose |
|---|---|
| `mcmaster-catalog-tools.user.js` | The whole userscript: selectors, parser, filters, panel, export. |
| `test/parse.test.mjs` | Loads the script into jsdom against each fixture you have and checks parsing and filtering. |
| `fixtures/*.html` | Sanitized page captures for the tests. Local only, ignored by git. |
| `fixtures/raw/` | Your own browser saves before sanitizing. Local only. |
| `scripts/sanitize-fixture.mjs` | Turns a raw save into a test fixture. |
| `biome.json` | Formatter and lint rules. VS Code formats on save with the Biome extension. |
| `scripts/version.mjs` | Checks that the script header, the `VERSION` constant, `package.json` and the lockfile agree, or syncs them from `package.json`. |
| `.githooks/pre-commit` | Runs that check on the staged files. |
| `.github/workflows/release.yml` | Publishes a GitHub release with the script attached when a `vX.Y.Z` tag is pushed. |

## Tests

```
npm install
npm test
```

`npm install` also points git at `.githooks`, so the pre-commit version check runs from then on.

The test loads the userscript into a jsdom window for each fixture with scripts disabled, sets `window.__mctNoAutoInit`, and drives the parser and filters through `window.__mct`. Expectations pin table counts, header groups, price labels, spec keys and filter behaviour.

Nothing under `fixtures/` is in the repository. A fixture block whose file is missing is skipped with a `skip` line, and a run with no fixtures at all exits 0 and says so. To run the full suite you need your own captures of the pages listed below.

## Fixtures

McMaster-Carr's terms of use prohibit copying or redistributing page content, including its arrangement, so page captures stay on your machine. Sanitizing them is still worth doing: it strips your account details from a logged-in save, drops most of the size, and is what you should hand over if you ever share a capture privately with another contributor.

The sanitizer keeps only the `#ProductPage` subtree and strips scripts, styles, comments, SVG contents and every attribute except `id`, `class`, `colspan`, `rowspan`, `role`, `type`, `tabindex` and `data-testid`. Part numbers are replaced with sequential `9xxxxAxxx` values and prices with seeded pseudo-random amounts, so the same page always sanitizes to the same output. Category names, column labels and spec values are kept as they were.

To capture a page:

1. Log out of mcmaster.com first, so no account details end up in the save.
2. Open the page in your normal browser and scroll until the tables you need have rendered.
3. Save it with "Webpage, Complete" and move the `.html` file to `fixtures/raw/<short-name>.html`. Delete the `_files` folder. Nothing uses it.
4. Run `npm run fixtures`. It writes `fixtures/<short-name>.html` and refuses to write a file that still contains an email address. It also removes anything this script itself injected, so capturing with the script running is fine.

The tests find fixtures by a substring of the file name. The existing checks were written against these pages, and a fresh capture of the same page can have different rows, so expect to re-pin counts and values in `test/parse.test.mjs`:

| Name contains | Page |
|---|---|
| `linear-ball-bearings` | `/products/linear-ball-bearings/bearing-type~ball-1/linear-bearing-component~bearing/` |
| `tubing-search` | `/products/tubing/tubing-2~/?s=stainless+steel+tubing` |
| `mil-spec-hex-nuts` | `/products/nuts/hex-nuts-6~/mil-spec-hex-nuts-2~~/` |
| `socket-head-screws` | `/products/screws/system-of-measurement~metric/socket-head-screws-2~/stainless-steel-socket-head-screws~~/` |

Never point an automated browser at mcmaster.com. The site answers with a login wall, and an account that logs in through an automated session gets restricted. Save pages by hand.

## How the parser finds things

McMaster's class names carry build hashes (`_priceCell_14fib_77`). Every selector lives in the `SEL` object at the top of the script and matches by substring (`[class*='_priceCell']`), so a hash rotation normally needs no change. If a table stops parsing, open the console: the script logs `column mismatch` warnings with the table element.

Stable hooks worth knowing:

- `#SpecSrch_Inner` plus `[class*='_frame_']` is the sidebar frame. The Price block is inserted after its `[class*='_specFrameHeader']` child; Categories and Export are appended at the end.
- `tr[class*='_stackPivotRow']` is an in-table group row. `_stackPivotTitleWithTint` marks the outer level when a table has two.
- `#ProdPageContent` is the content column beside the sidebar. It, or something inside it, is what scrolls.
- `.org2-presentation` is a sub-category block.
- `th[data-testid='grouping-header']` marks header cells.
- `td[class*='_stackPivotImagesCell']` is the image column, which the parser ignores.
- `[class*='_wheelContainer']` is the spinner for a sub-category whose table has not rendered yet.

## Lazy tables

McMaster virtualizes the tables on a category page: a table below the fold renders its group headers and a single row until it comes within range, and the range is computed from `window.innerHeight` and the scroll offset. Two things deal with that.

- `primeLazyTables(rows)` runs after every parse and does whatever is still missing for the current page. It is single-flight and returns a promise that resolves when the requested level is reached. The first stage, `mountAllTables`, always runs once per page; the second, `loadAllRows`, runs once per page while the `loadAll` setting is on (off by default; settings live in the same stored prefs as the price range), or whenever `rows` is forced, which the export actions do before building their output. A run the user cancelled is not retried by the setting, but a forced request tries again. Per-node counts show once the page's rows are complete, whichever way that happened. First it replaces the `innerHeight` getter on the page window with twice the document height, dispatches `resize`, waits for the DOM to go quiet and rescans, repeating with a doubled value up to four times until the counts stop changing. That mounts every table shell and group header but not their rows, which wait for real visibility. So it then restores the property descriptor and works on the tables' container, the nearest scrollable ancestor of the first table (`#ProdPageContent`; McMaster scrolls that column, not the document). It covers the container with a translucent veil that shows progress, scrolls it in viewport-sized steps, pauses at each for about 150ms of DOM quiet (capped at 600ms) and captures the parse into the registries so the rows that rendered land in the catalog before the next jump unmounts them, settles at the bottom, repeats while it keeps growing, and returns to the starting scroll position. Priming only parses; filters and the panel are applied once at the end, and the page observer is paused meanwhile. Wheel, touch or key input cancels the scroll and leaves the page where it is. Every stage logs the table, group, row and spinner counts.
- `state.groups` remembers every group key and title seen on the page, keyed under its sub-category or tinted parent group. The tree is built from that registry first, so a group stays in the tree if the virtualizer unmounts its rows again. The registry resets on navigation.
- `state.catalog` remembers every part seen on the page with its prices, specs and the keys of the category, sub-category and groups it sits under. Tree counts, the status line and the export read the catalog, so they report the whole page after priming even though the virtualizer keeps only the tables near the viewport mounted. Hiding and dimming still work on mounted rows only, which is all that can be hidden. The catalog resets on navigation.

## Console API

The script exposes `window.__mct` on McMaster pages:

- `__mct.state.data.records` is the parsed record list.
- `__mct.rescan()` re-parses the page.
- `__mct.primeLazyTables()` runs the one-time priming pass again for the current page if it has not run yet.
- `__mct.setFilters({ min, max, includeNoPrice, disabled })` applies filters.
- `__mct.setSetting("loadAll", true)` switches a setting and, for `loadAll`, primes the current page.
- `__mct.buildExport(filteredOnly)` returns the export object.

## Releasing

A release is a GitHub release with the script attached as an asset. The install link in the README and the `@downloadURL` and `@updateURL` in the script header point at `releases/latest/download/…`, so users always get the newest release rather than whatever is on `main`. The repository must stay public for those URLs to work.

1. On a clean `main`, run `npm version patch`, or `minor`, `major` or an exact `1.2.3`. It runs the tests, bumps `package.json` and the lockfile, copies the version into the script header and the `VERSION` constant, commits, and tags `vX.Y.Z`.
2. Run `git push --follow-tags`. The tag triggers `.github/workflows/release.yml`, which checks that the tag matches the file versions, syntax-checks the script, and creates the release with generated notes.

`node scripts/version.mjs check` lists every place a version lives and fails when they differ. The pre-commit hook runs it on the staged files, so the versions cannot drift between commits. A release that already exists is not overwritten: delete the release and the tag, or tag a new version.
