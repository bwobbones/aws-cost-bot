import * as events from "@aws-cdk/aws-events";
import * as targets from "@aws-cdk/aws-events-targets";
import * as iam from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import * as lambdaNodejs from "@aws-cdk/aws-lambda-nodejs";
import * as logs from "@aws-cdk/aws-logs";
import * as cdk from "@aws-cdk/core";

export class AwsCostBot extends cdk.Construct {
  public readonly lambdaFunction: lambdaNodejs.NodejsFunction;

  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    // Lambda function bundled using esbuild
    this.lambdaFunction = new lambdaNodejs.NodejsFunction(this, "lambda", {
      functionName: "aws-cost-bot",
      runtime: lambda.Runtime.NODEJS_14_X,
      environment: {
        NODE_OPTIONS: "--enable-source-maps"
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: cdk.Duration.minutes(5),
      bundling: {
        sourceMap: true,
        target: "es2020"
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
