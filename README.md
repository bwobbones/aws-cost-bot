# aws-cost-bot

## Pre-requisites

1. Create a configuration file in S3.

   This is the structure of that file.

   ```
   {
     "awsKeys": [
       {
         "environment": "<aws environment name>",
         "accountNumber: "<aws account number>",
         "accessKeyId": "<aws access key>",
         "secretAccessKey": "<aws secret key>"
       }
     ],
     "slackChannel": "<slack channel>",
     "slackKey": "<slack bot key>",
     "discordWebhook": "<discord webhook URL>"
   }
   ```

   Note that its an array, you can have multiple aws environments involved.

2. Set the `CONFIG_FILE` environment variable to the ARN of this configuration file in S3.

3. Configure your AWS credentials and region.  
   https://docs.aws.amazon.com/cdk/latest/guide/cli.html#cli-environment

## Execution

```
npm install
npm start
```

## Deployment

```
npm install
npm run bootstrap
npm run deploy
```
