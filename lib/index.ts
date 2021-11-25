import * as events from "@aws-cdk/aws-events";
import * as targets from "@aws-cdk/aws-events-targets";
import * as iam from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import * as lambdaNodejs from "@aws-cdk/aws-lambda-nodejs";
import * as logs from "@aws-cdk/aws-logs";
import * as cdk from "@aws-cdk/core";
import * as secretsManager from "@aws-cdk/aws-secretsmanager";

export class AwsCostBot extends cdk.Construct {
  public readonly lambdaFunction: lambdaNodejs.NodejsFunction;

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    const discordBackupSecret = secretsManager.Secret.fromSecretNameV2(
      this,
      "discord-backup-secret",
      "discordBackupSecret"
    );

    // Lambda function bundled using esbuild
    this.lambdaFunction = new lambdaNodejs.NodejsFunction(this, "lambda", {
      functionName: "aws-cost-bot",
      runtime: lambda.Runtime.NODEJS_14_X,
      environment: {
        DISCORD_BACKUP_SECRET: discordBackupSecret.secretValue.toString(),
        NODE_OPTIONS: "--enable-source-maps"
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: cdk.Duration.minutes(5),
      bundling: {
        sourceMap: true,
        target: "es2020",
        // Dependencies to exclude from the build
        externalModules: [
          "aws-sdk", // already available in the lambda runtime
          "ffmpeg-static" // dependency of discord.js that isn't used at runtime
        ],
        // Dependencies to deploy from node_modules instead of bundling
        nodeModules: [
          "discord.js" // contains non-analyzable imports https://github.com/discordjs/discord.js/issues/7032
        ]
      }
    });

    // Read-only access to the S3 bucket
    const s3BucketName = "generalresourceful";
    this.lambdaFunction.addToRolePolicy(
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
      targets: [new targets.LambdaFunction(this.lambdaFunction)],
      ruleName: "aws-cost-bot",
      description: "Run the AWS Cost Bot daily"
    });
  }
}
