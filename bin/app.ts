import * as cdk from "@aws-cdk/core";

import { AwsCostBot } from "../lib";

class AwsCostBotStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string) {
    super(scope, id, {
      description: "https://github.com/bwobbones/aws-cost-bot"
    });

    new AwsCostBot(this, "AwsCostBot");
  }
}

const app = new cdk.App();
new AwsCostBotStack(app, "AwsCostBotStack");
