#!/usr/bin/env node

const events = require("@aws-cdk/aws-events");
const targets = require("@aws-cdk/aws-events-targets");
const iam = require("@aws-cdk/aws-iam");
const lambda = require("@aws-cdk/aws-lambda");
const logs = require("@aws-cdk/aws-logs");
const cdk = require("@aws-cdk/core");
const secretsManager = require("@aws-cdk/aws-secretsmanager");
const path = require("path");

class AwsCostBotStack extends cdk.Stack {
  /**
   * @param {cdk.Construct} scope
   * @param {string} id
   */
  constructor(scope, id) {
    super(scope, id, {
      stackName: "aws-cost-bot",
      description: "AWS Cost Bot deployed by AWS CDK"
    });

    const discordBackupSecret = secretsManager.Secret.fromSecretNameV2(
      this,
      "discord-backup-secret",
      "discordBackupSecret"
    );

    // Lambda function
    const functionName = "aws-cost-bot";
    const lambdaFunction = new lambda.Function(this, "awscostbot-lambda", {
      functionName,
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "src/index.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "..", "..", "lambda")),
      environment: {
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
        DISCORD_BACKUP_SECRET: discordBackupSecret.secretValue.toString()
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: cdk.Duration.minutes(5)
    });
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/lambda/${functionName}:log-stream:*`
        ]
      })
    );

    // Read-only access to the S3 bucket
    const s3BucketName = "generalresourceful";
    lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:ListBucket"],
        resources: [
          `arn:aws:s3:::${s3BucketName}`,
          `arn:aws:s3:::${s3BucketName}/*`
        ]
      })
    );

    // Cloudwatch rule to trigger the lambda daily
    new events.Rule(this, "awscostbot-rule", {
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      targets: [new targets.LambdaFunction(lambdaFunction)],
      ruleName: "aws-cost-bot",
      description: "Run the AWS Cost Bot daily"
    });
  }
}

const app = new cdk.App();
new AwsCostBotStack(app, "awscostbot-stack");
