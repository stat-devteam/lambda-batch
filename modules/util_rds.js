"use strict";

var AWS = require('aws-sdk');
var mysql2 = require('mysql2'); //https://www.npmjs.com/package/mysql2
const smHandler = require('./util_SM.js');

const connectRDS = async function(dbendpoint, dbport, dbname, dbuser) {

  // const connection = await dbHandler.connectRDS(process.env.PROXY_ENDPOINT, process.env.DB_PORT, process.env.DB_NAME, process.env.DB_USER)
  console.log('dbendpoint', dbendpoint)
  console.log('dbport', dbport)
  console.log('dbname', dbname)
  console.log('dbuser', dbuser)
  const secretValue = await smHandler.getSecretValue(process.env.DB_SM_ID);

  console.log('connectRDS secretValue', secretValue)


  let connectionConfig = {
    host: dbendpoint, // Store your endpoint as an env var
    user: dbuser,
    port: parseInt(dbport),
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

module.exports = { connectRDS }
