# Seed data

`pk-real-data/` is the artists, galleries and artworks loaded into the site (format: `tools/data-intake/FIELDS.md`).
Some records hold invented test values, listed per record in `madeUpFields` - replace them with real details over time.

Load or refresh it on the live site from Coolify → the app → Terminal:

    node tools/data-intake/import.mjs seed/pk-real-data --batch pk-v4 --apply --create-lookups --allow-remote --allow-made-up
