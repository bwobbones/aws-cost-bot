import * as events from "@aws-cdk/aws-events";
import * as targets from "@aws-cdk/aws-events-targets";
import * as iam from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import * as lambdaNodejs from "@aws-cdk/aws-lambda-nodejs";
import * as logs from "@aws-cdk/aws-logs";
import * as cdk from "@aws-cdk/core";

/**
 * @summary The properties for the AwsCostBot class.
 */
export interface AwsSnsToDiscordProps {
  /**
   * Location of the config file in S3.
   *
   * Must be an S3 ARN, e.g. arn:aws:s3:::my-bucket/environments.json
   */
  readonly configFile: string;
}

/**
 * @summary The AwsCostBot class.
 */
export class AwsCostBot extends cdk.Construct {
  public readonly lambdaFunction: lambdaNodejs.NodejsFunction;

  constructor(scope: cdk.Construct, id: string, props: AwsSnsToDiscordProps) {
    super(scope, id);

    // Validation
    if (!props.configFile) {
      throw new Error(`The configFile prop is required`);
    }
    if (
      !cdk.Token.isUnresolved(props.configFile) &&
      !props.configFile.startsWith("arn:aws:s3:::")
    ) {
      throw new Error(
        `The configFile prop must be an S3 ARN, but was "${props.configFile}"`
      );
    }

    // Lambda function bundled using esbuild
    this.lambdaFunction = new lambdaNodejs.NodejsFunction(this, "lambda", {
      functionName: "aws-cost-bot",
      runtime: lambda.Runtime.NODEJS_14_X,
      environment: {
        CONFIG_FILE: props.configFile,
        NODE_OPTIONS: "--enable-source-maps"
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: cdk.Duration.minutes(5),
      bundling: {
        sourceMap: true,
        target: "es2020"
      }
    });

    // Read-only access to the config file in S3
    this.lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [
          // S3 object keys can contain any UTF-8 character, including IAM special characters
          this.convertArnToIamResource(props.configFile)
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

  // Convert an ARN to an IAM resource value by escaping special characters such as wildcards
  // https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_variables.html#policy-vars-specialchars
  private convertArnToIamResource(arn: string): string {
    if (
      !cdk.Token.isUnresolved(arn) &&
      IAM_SPECIAL_CHARACTERS.every(c => !arn.includes(c))
    ) {
      return arn; // No special characters
    }
    let resource = cdk.Token.asString(cdk.Token.asAny(arn)); // cdk.Fn.split requires a token
    for (const specialCharacter of IAM_SPECIAL_CHARACTERS) {
      // Escape all occurrences of the special character (find and replace)
      resource = cdk.Fn.join(
        "${" + specialCharacter + "}",
        cdk.Fn.split(specialCharacter, resource)
      );
    }
    return resource;
  }
}

const IAM_SPECIAL_CHARACTERS = ["$", "*", "?"] as const;
