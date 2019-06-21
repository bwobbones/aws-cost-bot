const AWS = require("aws-sdk");
const S3 = require("aws-sdk/clients/s3");
const axios = require("axios");
const moment = require("moment");
const { WebClient } = require("@slack/web-api");

var accountNameLookup = [];
var accountCosts = {};

var todaysConversionRate = 0;

// AWS.config.update({
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
// });

exports.handler = async (event, context) => {
  //eslint-disable-line

  const environments = await getEnvironments();
  var awsCredentials = environments.awsKeys;
  const token = environments.slackKey;
  await getTodaysConversionRate();
  for (var i = 0; i < awsCredentials.length; i++) {
    var cred = awsCredentials[i];
    console.log("processing", cred.environment, "...");
    accountNameLookup[cred.accountNumber] = cred.environment;
    accountCosts[cred.environment] = {};

    var costs = await getCosts(cred.accessKeyId, cred.secretAccessKey);
  }
  sendToSlack(generateSlackMessage(costs) + "\n\n", token);
  context.done(null, "All done");
};

const getEnvironments = async () => {
  const client = new S3({
    apiVersion: "2006-03-01"
  });

  const params = {
    Bucket: "generalresourceful",
    Key: "environments.json"
  };
  const environmentsFile = await client.getObject(params).promise();
  console.log(environmentsFile.Body.toString());
  return JSON.parse(environmentsFile.Body.toString());
};

const getTodaysConversionRate = async () => {
  console.log("gathering exchange rates...");
  const todaysRates = await axios.get(
    "https://api.exchangeratesapi.io/latest?base=USD"
  );
  console.log("todays rate", todaysRates.data.rates.AUD);
  todaysConversionRate = todaysRates.data.rates.AUD;
  return todaysRates;
};

const getCosts = async (accessKeyId, secretAccessKey) => {
  var config = {
    apiVersion: "2017-10-25",
    accessKeyId,
    secretAccessKey,
    region: "us-east-1"
  };

  var costexplorer = new AWS.CostExplorer(config);

  var costAggregate = await fetchAndProcessCosts(costexplorer);
  trimEmptyCosts(costAggregate);
  return costAggregate;
};

const fetchAndProcessCosts = async costexplorer => {
  var date = new Date();
  var today = moment(date).add(1, "d");
  var startOfMonth = moment().startOf("month");
  await addCosts(
    accountCosts,
    "Month to date",
    startOfMonth,
    today,
    accountNameLookup,
    costexplorer
  );

  var lastMonth = moment(date).subtract(1, "months");
  await addCosts(
    accountCosts,
    "Last month",
    moment(lastMonth).startOf("month"),
    moment(lastMonth).endOf("month"),
    accountNameLookup,
    costexplorer
  );

  var startOfYear = moment(date)
    .startOf("year")
    .startOf("month");
  await addCosts(
    accountCosts,
    "Year to date",
    startOfYear,
    today,
    accountNameLookup,
    costexplorer
  );

  return accountCosts;
};

// TODO: make this function nicer to consume
const addCosts = async (
  costsObj,
  costName,
  startDate,
  endDate,
  accountNameLookup,
  costexplorer
) => {
  try {
    var monthToDateConfig = monthlyBlendedCostByAccountConfig(
      startDate,
      endDate
    );
    var monthToDateResult = await costexplorer
      .getCostAndUsage(monthToDateConfig)
      .promise();
    var monthToDateAggregate = getAggregatedCosts(
      monthToDateResult,
      accountNameLookup
    );
    Object.keys(monthToDateAggregate).forEach(accountName => {
      costsObj[accountName][costName] = monthToDateAggregate[accountName];
    });
  } catch (err) {
    console.error("there was a problem gathering costs", err.message);
  }
};

const monthlyBlendedCostByAccountConfig = (startDate, endDate) => {
  var metrics = "BlendedCost";
  var granularity = "MONTHLY";

  var costParams = {
    TimePeriod: {
      Start: startDate.format("YYYY-MM-DD") /* required */,
      End: endDate.format("YYYY-MM-DD") /* required */
    },
    Granularity: granularity,
    Metrics: [metrics],
    GroupBy: [
      {
        Key: "LINKED_ACCOUNT",
        Type: "DIMENSION"
      }
    ]
  };

  return costParams;
};

const getAggregatedCosts = (costData, accountNameLookup) => {
  var costPerAccount = {};
  var cost;
  var accountNum;
  var accountName;
  var sum;
  Object.keys(costData.ResultsByTime).forEach(function(timeKey) {
    Object.keys(costData.ResultsByTime[timeKey].Groups).forEach(function(
      groupKey
    ) {
      cost =
        costData.ResultsByTime[timeKey].Groups[groupKey].Metrics.BlendedCost;
      accountNum = costData.ResultsByTime[timeKey].Groups[groupKey].Keys[0];
      accountName = accountNameLookup[accountNum];
      sum = 0;
      if (costPerAccount[accountName]) {
        sum = costPerAccount[accountName].Amount;
      }
      costPerAccount[accountName] = {
        Amount: sum + parseInt(cost.Amount),
        Unit: cost.Unit
      };
    });
  });

  return costPerAccount;
};

const trimEmptyCosts = accountCosts => {
  var hasCost = false;
  Object.keys(accountCosts).forEach(accountName => {
    hasCost = false;
    accountAggregate = accountCosts[accountName];
    if (accountAggregate == null) {
      if (accountAggregate === {}) {
        delete accountCosts[accountName];
      }
      return;
    }
    Object.keys(accountAggregate).forEach(costType => {
      if (accountAggregate[costType].Amount > 0) {
        hasCost = true;
      }
    });
    if (!hasCost) {
      delete accountCosts[accountName];
    }
  });
};

const sendToSlack = async (message, token) => {
  try {
    const web = new WebClient(token);
    await web.chat.postMessage({
      channel: "aws-costs",
      text: message,
      icon_emoji: ":cat:",
      as_user: false,
      username: "CostBot"
    });
  } catch (err) {
    console.log(err);
  }
};

const generateSlackMessage = accountCosts => {
  var accountAggregate;
  var message = "";
  Object.keys(accountCosts).forEach(accountName => {
    accountAggregate = accountCosts[accountName];
    if (accountAggregate == null) {
      return;
    }
    message += `*${accountName}*\n`;
    Object.keys(accountAggregate).forEach(costType => {
      message += `${costType}: ${(
        accountAggregate[costType].Amount * todaysConversionRate
      ).toFixed(2)} AUD\n`;
    });
  });
  return message;
};
