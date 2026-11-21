# Data intake: artists, galleries, artworks

The format for collecting artist, gallery and artwork data (from the web or from partner galleries), plus a checker that runs before anything is imported.

## Files

| Path | What |
|---|---|
| `templates/artists.csv` `galleries.csv` `artworks.csv` | Empty sheets with the right columns and one example row. Copy them and fill them in (Excel or Google Sheets, saved as CSV UTF-8). |
| `templates/*.json` | The same, as JSON. |
| `schema/*.schema.json` | JSON Schema. Editors like VS Code use it to check JSON while you type. |
| `FIELDS.md` | Every field, what it means, whether it's required, and the values the site accepts. |
| `lookups.json` | Styles, art types, paint materials and bases the site already has. |
| `validate.mjs` | The checker. |
| `import.mjs` | Loads a checked folder into the **local** database (and can undo it). |
| `clear-old.mjs` | Deletes every artist, artwork and gallery in the **local** database that wasn't imported (backs up first). |
| `examples/broken/` | Deliberately wrong data that shows what the checker catches. |
| `fields.mjs` | Where the fields are defined. Change fields here, then run `node build-schema.mjs`. |

## Collecting data

1. Put one folder per batch somewhere outside git, e.g. `deploy/one-off/<batch-name>/`.
2. Add `artists`, `galleries` and `artworks` as `.csv`, `.json`, or both.
3. Link rows by `key`:
   - an artwork's `artistKey` is the artist's `key`;
   - an artist's `galleryKeys` lists gallery keys.
4. In CSV, put several values in one cell separated by ` | `, e.g. `https://a.com | https://b.com`.
5. Only add pictures you're allowed to use, and fill in `imageLicense` / `photoLicense`. Pictures from a partner gallery count as `permission`.

## Checking

```bash
node tools/data-intake/validate.mjs deploy/one-off/pk-real-data
```

This prints a summary and writes `validation-report.md` and `validation-report.json` into the data folder.

| Level | Meaning |
|---|---|
| **ERROR** | Must fix before import. Examples: missing required field, wrong type, unknown artist key, duplicate key, death before birth, artwork dated outside the artist's life, museum-held work marked for sale, picture without a licence, JSON and CSV disagreeing. |
| **WARNING** | Imports, but something's missing or new. Examples: a field the site's database expects, a style or art type the site doesn't have yet (with "did you mean…" for typos), possible duplicate artist or artwork, for sale without a price, no size, web data with no source link. |
| **INFO** | Notes only. Examples: no picture (imports as "needs image"), artist with no artworks yet. |

The checker exits with code 1 when there are errors. Add `--strict` to also fail on warnings, or `--quiet` to print only the summary.

## Importing into the local database

Run these from the project folder. They use `DATABASE_URL` from `.env` and refuse to touch any database that isn't on this computer.

```bash
node tools/data-intake/import.mjs deploy/one-off/pk-real-data --batch pk-test                            # preview, nothing saved
node tools/data-intake/import.mjs deploy/one-off/pk-real-data --batch pk-test --apply --create-lookups   # save
node tools/data-intake/import.mjs --remove --batch pk-test --apply                                       # undo the whole batch
```

- The checker runs first. Any error stops the import, and nothing is saved.
- Every run is all-or-nothing.
- Re-running the same batch **updates** the same rows instead of adding duplicates. The `data_import_keys` table remembers what was imported.
- Artists, galleries and artworks are imported as **approved** so you can see them on the site:
  - `--pending` imports everything hidden instead;
  - `--hide-no-image` hides only the artworks without a picture.
- `--create-lookups` adds missing styles and art types (e.g. Calligraphy, Installation). Without it, they're left empty, and artworks whose art type is missing are skipped.
- The importer prints, and saves to `import-report.txt`, what the site couldn't hold. Examples: death year, education, "held by", availability, image licence, and missing years saved as 0.
- Add `--prune` to also delete records this batch imported earlier that are no longer in the data (e.g. artworks you removed from the files).
- `--remove` doesn't delete styles or art types it added. Remove those in Admin if needed.

## On the live site

The Docker image contains `tools/data-intake` and the data in `seed/`. In Coolify → the app → Terminal:

```bash
node tools/data-intake/db-check.mjs                                   # what is in the database (changes nothing)
node tools/data-intake/import.mjs seed/pk-real-data --batch pk-v4 --create-lookups --allow-remote --allow-made-up          # preview
node tools/data-intake/import.mjs seed/pk-real-data --batch pk-v4 --apply --create-lookups --allow-remote --allow-made-up  # import
```

`--allow-remote` permits a database that isn't on this computer; `--allow-made-up` permits records with invented
test values (`madeUpFields`). Pictures are downloaded into the app's persistent `/data` volume.
