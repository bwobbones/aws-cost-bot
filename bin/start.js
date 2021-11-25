const { handler } = require("../lib/index.lambda");

if (require.main === module) {
  process.env.DRY_RUN = process.env.DRY_RUN || "true";

  const event = {};
  const context = {
    done: (...args) => {
      console.log(`context.done(${args.map(arg => String(arg)).join(", ")})`);
    }
  };
  handler(event, context).catch(e => console.error(e));
}
