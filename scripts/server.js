const { ethers } = require("ethers");
const axios = require("axios");
require("dotenv").config();
const DataOracleJSON = require("../scripts/ABIs/dataOracle.json");
const OracleCallerJSON = require("../scripts/ABIs/oracleCaller.json");

const dataOracleAddressBTC = "0x7C97Ac9F94186BaFb410169Fe8c477C9C608Fc8C";
const oracleCallerAddressBTC = "0xE2C3793b99da8B0eCFf4cE5aD21D4759c7859C80";

const dataOracleAddressETH = "0x2f18468A23497cBDB760634689c84dD4CAA6f080";
const oracleCallerAddressETH = "0xCdCfaD6c5555D124879c27B91DfA681649EC9772";

const dataOracleAddressSTX = "0x5261E97A0d79873f203c0727F6C903bE8F386878";
const oracleCallerAddressSTX = "0x6DDf9A02F2A913d70f4939f9307d4cb2d2BD8e57";

const dataOracleAddressCKB = "0x3fD7A3120Dd2a55FbCccae62Bf78bf8b38B8329f";
const oracleCallerAddressCKB = "0x01df4883ff3c8dD7D5524E6a7D3f3c62102BeD6e";

const MAX_RETRIES = 5;
const PROCESS_CHUNK = 3;

let pendingRequestQueueBTC = [];
let pendingRequestQueueETH = [];
let pendingRequestQueueSTX = [];
let pendingRequestQueueCKB = [];

async function getPrice(pair) {
  const [baseCurrency, quoteCurrency] = pair.split("-");

  const urls = [
    `https://api.coinbase.com/v2/prices/${baseCurrency}-${quoteCurrency}/spot`,
    `https://min-api.cryptocompare.com/data/price?fsym=${baseCurrency}&tsyms=${quoteCurrency}`,
  ];

  async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await axios.get(url, { timeout: 5000 });
      } catch (error) {
        if (i === retries - 1) throw error; // Rethrow if it's the last attempt
        console.warn(`Retrying... (${i + 1})`);
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, i))
        ); // Exponential backoff
      }
    }
  }

  try {
    const responses = await Promise.all(urls.map((url) => fetchWithRetry(url)));

    const coinbasePrice = parseFloat(responses[0].data.data.amount);
    const cryptocomparePrice = parseFloat(responses[1].data[quoteCurrency]);

    console.log(`Coinbase price for ${pair} is ---->`, coinbasePrice);
    console.log(`CryptoCompare price for ${pair} is ---->`, cryptocomparePrice);

    return [coinbasePrice, cryptocomparePrice];
  } catch (error) {
    console.error(
      `Error fetching ${pair} data:`,
      error.response ? error.response.data : error.message
    );
    return null;
  }
}

function calculateAverage(prices) {
  if (!Array.isArray(prices) || prices.length === 0) {
    console.error("Invalid prices array:", prices);
    return null;
  }

  const sum = prices.reduce((acc, price) => acc + price, 0);
  return sum / prices.length;
}

async function setLatestData(dataOracle, id, data, oracleCallerAddress) {
  try {
    const gasPrice = await dataOracle.provider.getGasPrice();

    const txOptions = {
      gasPrice: gasPrice,
      // You can also specify gasLimit if needed, e.g., gasLimit: 100000
    };

    const tx = await dataOracle.setLatestData(
      data.toString(),
      oracleCallerAddress,
      id,
      txOptions
    );

    await tx.wait();
  } catch (error) {
    console.log("Error encountered while calling setLatestData");
    console.log(error);
  }
}

async function processRequest(dataOracle, id, oracleCaller, pair) {
  console.log("pair and oracle caller address is--->", pair, oracleCaller);
  let retries = 0;
  while (retries < MAX_RETRIES) {
    console.log("here in process request is------>", retries);
    try {
      const priceData = await getPrice(pair);

      console.log("price data is--->", priceData);
      if (!priceData) {
        throw new Error(`Failed to fetch ${pair} data`);
      }

      const averagePrice = calculateAverage(priceData);
      if (averagePrice === null) {
        throw new Error("Failed to calculate average price");
      }

      console.log("average price is---->", averagePrice);
      const data = averagePrice.toString();

      await setLatestData(dataOracle, id, data, oracleCaller);
      return;
    } catch (error) {
      console.log("error is----->", error);
      if (retries === MAX_RETRIES - 1) {
        await setLatestData(dataOracle, id, "", oracleCaller);
        return;
      }
      retries++;
    }
  }
}

async function processRequestQueue(dataOracle, oracleCaller, pair, queue) {
  console.log(">> processRequestQueue 123");

  let processedRequests = 0;
  try {
    while (queue.length > 0 && processedRequests < PROCESS_CHUNK) {
      console.log("in while loop is");
      const reqId = queue.shift();
      console.log("req id is---->", reqId);
      await processRequest(dataOracle, reqId, oracleCaller, pair);
      processedRequests++;
    }
  } catch (e) {
    console.log("error is,", e);
  }
  console.log(">> processRequestQueue ends 456");
}

(async () => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(
      process.env.PROVIDER_URL
    );
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    console.log("Wallet address:", wallet.address);

    const dataOracleBTC = new ethers.Contract(
      dataOracleAddressBTC,
      DataOracleJSON,
      wallet
    );
    const oracleCallerBTC = new ethers.Contract(
      oracleCallerAddressBTC,
      OracleCallerJSON,
      wallet
    );

    const dataOracleETH = new ethers.Contract(
      dataOracleAddressETH,
      DataOracleJSON,
      wallet
    );
    const oracleCallerETH = new ethers.Contract(
      oracleCallerAddressETH,
      OracleCallerJSON,
      wallet
    );

    const dataOracleSTX = new ethers.Contract(
      dataOracleAddressSTX,
      DataOracleJSON,
      wallet
    );
    const oracleCallerSTX = new ethers.Contract(
      oracleCallerAddressSTX,
      OracleCallerJSON,
      wallet
    );

    const dataOracleCKB = new ethers.Contract(
      dataOracleAddressCKB,
      DataOracleJSON,
      wallet
    );
    const oracleCallerCKB = new ethers.Contract(
      oracleCallerAddressCKB,
      OracleCallerJSON,
      wallet
    );

    try {
      oracleCallerBTC.on("ReceivedNewRequestIdEvent", (_id, event) => {
        console.log("NEW EVENT - ReceivedNewRequestIdEvent:", _id);
        pendingRequestQueueBTC.push(_id);
        console.log("Event details:", event);
      });

      oracleCallerBTC.on("DataUpdatedEvent", (_id, _data) => {
        console.log("NEW EVENT - DataUpdatedEvent: id =", _id, "data =", _data);
      });

      oracleCallerETH.on("ReceivedNewRequestIdEvent", (_id, event) => {
        console.log("NEW EVENT - ReceivedNewRequestIdEvent:", _id);
        pendingRequestQueueETH.push(_id);
        console.log("Event details:", event);
      });

      oracleCallerETH.on("DataUpdatedEvent", (_id, _data) => {
        console.log("NEW EVENT - DataUpdatedEvent: id =", _id, "data =", _data);
      });

      oracleCallerSTX.on("ReceivedNewRequestIdEvent", (_id, event) => {
        console.log("NEW EVENT - ReceivedNewRequestIdEvent:", _id);
        pendingRequestQueueSTX.push(_id);
        console.log("Event details:", event);
      });

      oracleCallerSTX.on("DataUpdatedEvent", (_id, _data) => {
        console.log("NEW EVENT - DataUpdatedEvent: id =", _id, "data =", _data);
      });

      oracleCallerCKB.on("ReceivedNewRequestIdEvent", (_id, event) => {
        console.log("NEW EVENT - ReceivedNewRequestIdEvent:", _id);
        pendingRequestQueueCKB.push(_id);
        console.log("Event details:", event);
      });

      oracleCallerCKB.on("DataUpdatedEvent", (_id, _data) => {
        console.log("NEW EVENT - DataUpdatedEvent: id =", _id, "data =", _data);
      });
    } catch (e) {
      console.log("error is---->", e);
    }

    setInterval(async () => {
      console.log(pendingRequestQueueBTC);
      await processRequestQueue(
        dataOracleBTC,
        oracleCallerAddressBTC,
        "BTC-USDT",
        pendingRequestQueueBTC
      );
    }, 4000);

    setInterval(async () => {
      console.log(pendingRequestQueueETH);
      await processRequestQueue(
        dataOracleETH,
        oracleCallerAddressETH,
        "ETH-USDT",
        pendingRequestQueueETH
      );
    }, 4000);

    setInterval(async () => {
      console.log(pendingRequestQueueSTX);
      await processRequestQueue(
        dataOracleSTX,
        oracleCallerAddressSTX,
        "STX-USDT",
        pendingRequestQueueSTX
      );
    }, 4000);

    setInterval(async () => {
      console.log(pendingRequestQueueCKB);
      await processRequestQueue(
        dataOracleCKB,
        oracleCallerAddressCKB,
        "CKB-USDT",
        pendingRequestQueueCKB
      );
    }, 4000);
  } catch (e) {
    console.log("error is ----->", e);
  }
})();
