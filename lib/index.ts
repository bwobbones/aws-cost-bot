import { Construct } from "constructs";
import {
  Duration,
  Fn,
  Token,
  aws_events,
  aws_events_targets,
  aws_iam,
  aws_lambda,
  aws_lambda_nodejs,
  aws_logs
} from "aws-cdk-lib";

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
export class AwsCostBot extends Construct {
  public readonly lambdaFunction: aws_lambda_nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: AwsSnsToDiscordProps) {
    super(scope, id);

    // Validation
    if (!props.configFile) {
      throw new Error(`The configFile prop is required`);
    }
    if (
      !Token.isUnresolved(props.configFile) &&
      !props.configFile.startsWith("arn:aws:s3:::")
    ) {
      throw new Error(
        `The configFile prop must be an S3 ARN, but was "${props.configFile}"`
      );
    }

    // Lambda function bundled using esbuild
    const functionName = "aws-cost-bot";
    this.lambdaFunction = new aws_lambda_nodejs.NodejsFunction(this, "lambda", {
      functionName,
      runtime: aws_lambda.Runtime.NODEJS_20_X,
      environment: {
        CONFIG_FILE: props.configFile,
        NODE_OPTIONS: "--enable-source-maps"
      },
      logGroup: new aws_logs.LogGroup(this, "lambda-logGroup", {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: aws_logs.RetentionDays.ONE_MONTH
      }),
      timeout: Duration.minutes(5),
      bundling: {
        sourceMap: true,
        target: "es2022"
      }
    });

    // Read-only access to the config file in S3
    this.lambdaFunction.addToRolePolicy(
      new aws_iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [
          // S3 object keys can contain any UTF-8 character, including IAM special characters
          this.convertArnToIamResource(props.configFile)
        ]
      })
    );

    // Cloudwatch rule to trigger the lambda daily
    new aws_events.Rule(this, "awscostbot-rule", {
      schedule: aws_events.Schedule.rate(Duration.days(1)),
      targets: [new aws_events_targets.LambdaFunction(this.lambdaFunction)],
      ruleName: "aws-cost-bot",
      description: "Run the AWS Cost Bot daily"
    });
  }

  // Convert an ARN to an IAM resource value by escaping special characters such as wildcards
  // https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_variables.html#policy-vars-specialchars
  private convertArnToIamResource(arn: string): string {
    if (
      !Token.isUnresolved(arn) &&
      IAM_SPECIAL_CHARACTERS.every(c => !arn.includes(c))
    ) {
      return arn; // No special characters
    }
    let resource = Token.asString(Token.asAny(arn)); // Fn.split requires a token
    for (const specialCharacter of IAM_SPECIAL_CHARACTERS) {
      // Escape all occurrences of the special character (find and replace)
      resource = Fn.join(
        "${" + specialCharacter + "}",
        Fn.split(specialCharacter, resource)
      );
    }
    return resource;
  }
}

const IAM_SPECIAL_CHARACTERS = ["$", "*", "?"] as const;
