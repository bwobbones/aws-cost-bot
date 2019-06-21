# aws-cost-bot

## Pre-requisites

Requires a `environments.json` file in the root directory with a file in the format

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

```
npm install
npm start
```
