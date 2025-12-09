const { handler } = require("../lib/index.lambda");

if (require.main === module) {
  process.env.DRY_RUN = process.env.DRY_RUN || "true";

  handler().catch(e => console.error(e));
}
