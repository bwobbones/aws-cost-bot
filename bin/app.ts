import { Construct } from "constructs";
import { App, Stack } from "aws-cdk-lib";

import { AwsCostBot } from "../lib";

class AwsCostBotStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      description: "https://github.com/bwobbones/aws-cost-bot"
    });

    new AwsCostBot(this, "AwsCostBot", {
      configFile: process.env.CONFIG_FILE || ""
    });
  }
}

if (!process.env.npm_lifecycle_script?.includes('cdk "bootstrap"')) {
  const app = new App();
  new AwsCostBotStack(app, "AwsCostBotStack");
}
