"use strict";

var AWS = require('aws-sdk');
var mysql2 = require('mysql2'); //https://www.npmjs.com/package/mysql2
const smHandler = require('./util_SM.js');

const connectRDSProxy = async function(region_info, proxy_endpoint, proxy_port, dbname, dbuser) {

  // Get IAM Token
  var signer = new AWS.RDS.Signer({
    region: region_info,
    hostname: proxy_endpoint,
    port: parseInt(proxy_port),
    username: dbuser,
  });

  var token = await new Promise((resolve, reject) => {
    let token = signer.getAuthToken({
      username: dbuser,
    });
    resolve(token);
  }).catch((error) => {
    return JSON.stringify(error);
  });

  console.log("IAM Token obtained\n", token);



  let connectionConfig = {
    host: proxy_endpoint, // Store your endpoint as an env var
    user: dbuser,
    port: parseInt(proxy_port),
    database: dbname, // Store your DB schema name as an env var
    ssl: { rejectUnauthorized: false },
    password: token,
    authSwitchHandler: function({ pluginName, pluginData }, cb) {
      console.log("Setting new auth handler.");
    },
  };

  // Adding the mysql_clear_password handler
  connectionConfig.authSwitchHandler = (data, cb) => {
    if (data.pluginName === "mysql_clear_password") {
      // See https://dev.mysql.com/doc/internals/en/clear-text-authentication.html
      console.log("pluginName: " + data.pluginName);
      let password = token + "\0";
      let buffer = Buffer.from(password);
      cb(null, password);
    }
  };
  const connection = await mysql2.createConnection(connectionConfig);

  connection.connect(function(err) {
    if (err) {
      console.log("error connecting: " + err.stack);
      return (new Error("error connecting: " + err.stack));
    }

    console.log("connected as id " + connection.threadId + "\n");
  });

  return connection;
}

const connectRDS = async function(proxy_endpoint, proxy_port, dbname, dbuser) {

  // const connection = await dbHandler.connectRDS(process.env.PROXY_ENDPOINT, process.env.DB_PORT, process.env.DB_NAME, process.env.DB_USER)
  console.log('proxy_endpoint', proxy_endpoint)
  console.log('proxy_port', proxy_port)
  console.log('dbname', dbname)
  console.log('dbuser', dbuser)
  const secretValue = await smHandler.getSecretValue(process.env.DB_SM_ID);

  console.log('connectRDS secretValue', secretValue)


  let connectionConfig = {
    host: proxy_endpoint, // Store your endpoint as an env var
    user: dbuser,
    port: parseInt(proxy_port),
    database: dbname, // Store your DB schema name as an env var
    password: secretValue.password,
  };

  console.log('connectRDS', connectionConfig)
  const connection = await mysql2.createConnection(connectionConfig);

  connection.connect(function(err) {
    if (err) {
      console.log("error connecting: " + err.stack);
      return (new Error("error connecting: " + err.stack));
    }

    console.log("connected as id " + connection.threadId + "\n");
  });

  return connection;
}

module.exports = { connectRDSProxy, connectRDS }
