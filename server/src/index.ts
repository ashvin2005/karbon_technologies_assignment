import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./prisma.js";

async function main() {
  await prisma.$connect();
  app.listen(config.port, () => {
    console.log(`Server listening on http://localhost:${config.port}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
