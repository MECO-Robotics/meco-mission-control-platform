import "dotenv/config";

import { buildApp } from "./app";
import { cadPersistenceConfig, cadStepParserConfig, env } from "./config/env";

async function start() {
  const app = await buildApp();

  app.log.info(
    {
      cadStoreDriver: cadPersistenceConfig.storeDriver,
      cadStepParserMode: cadStepParserConfig.mode,
      placeholderMode: cadStepParserConfig.mode === "placeholder",
    },
    "CAD startup configuration",
  );
  if (cadStepParserConfig.mode === "placeholder") {
    app.log.warn(
      "[startup] WARNING: CAD_STEP_PARSER_MODE=placeholder is enabled. STEP uploads will not be treated as real CAD parses.",
    );
  }

  await app.listen({
    host: "0.0.0.0",
    port: env.PORT,
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
