var AWS = require("aws-sdk");
var request = require("request");
var moment = require("moment");

const environments = require("./environments.json");

const { WebClient } = require("@slack/client");
const web = new WebClient(
  environments.slackKey
);

// TODO: put these into a config file
var awsCredentials = environments.awsKeys;

const getCostsAndSendToSlack = async awsCredentials => {
  var message = "";
  for (var i = 0; i < awsCredentials.length; i++) {
    var cred = awsCredentials[i];
    message += `### ${cred.environment} ###\n`;
    var costs = await getCosts(cred.accessKeyId, cred.secretAccessKey);
    message += generateSlackMessage(costs) + "\n\n";
  }
  sendToSlack(message);
};

const getCosts = async (accessKeyId, secretAccessKey) => {
  var config = {
    apiVersion: "2017-10-25",
    accessKeyId,
    secretAccessKey,
    region: "us-east-1"
  };

  var costexplorer = new AWS.CostExplorer(config);
  var orgs = new AWS.Organizations(config);

  var costAggregate = await fetchAndProcessCosts(costexplorer, orgs);
  console.log("costagg", costAggregate);
  trimEmptyCosts(costAggregate);
  return costAggregate;
};

const fetchAndProcessCosts = async (costexplorer, orgs) => {
  var accountResult = await orgs.listAccounts().promise();
  var accountNameLookup = [];
  var accountCosts = {};
  accountResult.Accounts.forEach(account => {
    accountNameLookup[account.Id] = account.Name;
    accountCosts[account.Name] = {};
  });

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
  var monthToDateConfig = monthlyBlendedCostByAccountConfig(startDate, endDate);
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

  console.log(costsObj);
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

const sendToSlack = async message => {
  try {
    await web.chat.postMessage({
      channel: "gregtest",
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
      message += `${costType}: ${accountAggregate[costType].Amount} ${
        accountAggregate[costType].Unit
      }\n`;
    });
  });
  return message;
};

getCostsAndSendToSlack(awsCredentials);
