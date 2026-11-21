import app from "./app";
import { logger } from "./lib/logger";
import { ensureArtistLevelColumn } from "./lib/artist-level";
import { ensureArtistSlideColumn } from "./lib/carousels";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Make sure the artists.level column exists before serving (migration-11, applied here too).
await ensureArtistLevelColumn().catch((err) => logger.error({ err }, "Could not add the artists.level column"));
await ensureArtistSlideColumn().catch((err) => logger.error({ err }, "Could not add the artworks.artist_slide column"));

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
