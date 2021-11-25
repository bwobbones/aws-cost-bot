# aws-cost-bot

## Pre-requisites

The current code requires a `environments.json` file in an s3 bucket called `generalresourceful`, obviously change the bucket to something appropriate for you.

This is the structure of that file.

```
{
  "awsKeys": [
    {
      "environment": "<aws environent name>",
      "accountNumber: "<aws account number>",
      "accessKeyId": "<aws access key>",
      "secretAccessKey": "<aws secret key>"
    }
  ],
  "slackKey": "<slack boy key>"
}
```

Note that its an array, you can have multiple aws environments involved

## Execution

Make sure you have your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables set before running

```
npm install
npm start
```

## Deployment

Make sure you have your AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_REGION environment variables set before running

```
npm install
npm run bootstrap
npm run deploy
```
