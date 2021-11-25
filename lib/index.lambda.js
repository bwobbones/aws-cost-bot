const AWS = require("aws-sdk");
const S3 = require("aws-sdk/clients/s3");
const axios = require("axios");
const moment = require("moment");
const { WebClient } = require("@slack/web-api");
const { Client, Intents } = require("discord.js");

let accountNameLookup = [];
let accountCosts = {};

exports.handler = async (event, context) => {
  //eslint-disable-line

  context.callbackWaitsForEmptyEventLoop = false;

  const todaysConversionRate = await tryGetTodaysConversionRate();

  const environmentFiles = [
    "rsfl-environments.json",
    "stockphoto-environments.json"
  ];

  for (const envFile of environmentFiles) {
    accountNameLookup = [];
    accountCosts = {};
    const environments = await getEnvironments(envFile);
    var awsCredentials = environments.awsKeys;
    const token = environments.slackKey;
    for (var i = 0; i < awsCredentials.length; i++) {
      var cred = awsCredentials[i];
      console.log("processing", cred.environment, "...");
      accountNameLookup[cred.accountNumber] = cred.environment;
      accountCosts[cred.environment] = {};

      var costs = await getCosts(cred.accessKeyId, cred.secretAccessKey);
    }
    const message = generateMessage(costs, todaysConversionRate) + "\n\n";
    if ((process.env.DRY_RUN || "").toLowerCase() === "true") {
      console.log({ message, channel: environments.slackChannel, token });
    } else {
      await sendToSlack(message, environments.slackChannel, token);
      await sendToDiscord(message, environments.discordChannel);
    }
  }
  context.done(null, "All done");
};

const getEnvironments = async envFile => {
  const client = new S3({
    apiVersion: "2006-03-01"
  });

  const params = {
    Bucket: "generalresourceful",
    Key: envFile
  };
  const environmentsFile = await client.getObject(params).promise();
  return JSON.parse(environmentsFile.Body.toString());
};

const getTodaysConversionRate = async () => {
  console.log("gathering exchange rates...");
  // https://exchangerate.host
  const todaysRates = await axios.get(
    "https://api.exchangerate.host/latest?base=USD&symbols=AUD"
  );
  console.log("todays rate", todaysRates.data.rates.AUD);
  return todaysRates.data.rates.AUD;
};

const tryGetTodaysConversionRate = async () => {
  try {
    return await getTodaysConversionRate();
  } catch (e) {
    console.warn(e);
    return null;
  }
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
    console.error(
      "there was a problem gathering costs",
      err.message,
      err.stack
    );
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

const sendToSlack = async (message, channel, token) => {
  try {
    const web = new WebClient(token);
    console.log("Sending message to slack...");
    return await web.chat.postMessage({
      channel: channel,
      text: message,
      icon_emoji: ":cat:",
      as_user: false,
      username: "CostBot"
    });
  } catch (err) {
    console.log(err);
  }
};

const sendToDiscord = async (message, channel, token) => {
  try {
    const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

    client.once("ready", () => {
      client.channels.fetch(channel).then(channel => {
        channel.send(message).then(res => {
          console.log("message sent.");
          client.destroy();
        });
      });
    });

    // Log our bot in
    client.login(process.env.DISCORD_BACKUP_SECRET);
  } catch (err) {
    console.log(err);
  }
};

const generateMessage = (accountCosts, todaysConversionRate) => {
  let message = "";
  if (todaysConversionRate) {
    message +=
      "*Today's conversion rate:* 1 USD = " + todaysConversionRate + " AUD\n";
  }
  Object.keys(accountCosts).forEach(accountName => {
    const accountAggregate = accountCosts[accountName];
    if (accountAggregate == null) {
      return;
    }
    message += `*${accountName}*\n`;
    Object.keys(accountAggregate).forEach(costType => {
      const amount = accountAggregate[costType].Amount;
      const usdAmount = amount.toFixed(2);
      message += `${costType}: ${usdAmount} USD`;
      if (todaysConversionRate) {
        const audAmount = (amount * todaysConversionRate).toFixed(2);
        message += ` = ${audAmount} AUD`;
      }
      message += "\n";
    });
  });
  return message;
};
