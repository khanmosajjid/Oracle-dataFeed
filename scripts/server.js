const { ethers } = require("ethers");
const axios = require("axios");
require("dotenv").config();
const DataOracleJSON = require(__dirname +
  "/../artifacts/contracts/DataOracle.sol/DataOracle.json");
const OracleCallerJSON = require(__dirname +
  "/../artifacts/contracts/OracleCaller.sol/OracleCaller.json");

const dataOracleAddress = "0x7C97Ac9F94186BaFb410169Fe8c477C9C608Fc8C";
const oracleCallerAddress = "0xE2C3793b99da8B0eCFf4cE5aD21D4759c7859C80";

const MAX_RETRIES = 5;
const PROCESS_CHUNK = 3;

let pendingRequestQueue = [];

async function getBtcUsdtData() {
  const urls = [
    // "https://api.coinbase.com/v2/prices/spot?currency=USD",
    "https://api.kraken.com/0/public/Ticker?pair=XBTUSD",
  ];

  const requests = urls.map(
    (url) => axios.get(url, { timeout: 5000 }) // Set a timeout of 5 seconds
  );

  async function fetchWithRetry(request, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await request;
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
    const responses = await Promise.all(
      requests.map((req) => fetchWithRetry(req))
    );
     console.log("responses of kraken is",responses);
    // const coinbasePrice = parseFloat(responses[0].data.data.amount);
    const krakenPrice = parseFloat(responses[0].data.result.XXBTZUSD.c[0]);

    // console.log("Coinbase price is---->", coinbasePrice);
    console.log("Kraken price is---->", krakenPrice);

    return [krakenPrice];
  } catch (error) {
    console.error("Error fetching BTC/USDT data:", error);
    return null;
  }
}

function calculateAverage(prices) {
  if (!prices || prices.length === 0) {
    console.error("Invalid prices array:", prices);
    return null;
  }

  const sum = prices.reduce((acc, price) => acc + price, 0);
  return sum / prices.length;
}

async function setLatestData(dataOracle, id, data) {
  try {
    const gasPrice = await dataOracle.provider.getGasPrice();

    const txOptions = {
      gasPrice: gasPrice,
      // You can also specify gasLimit if needed, e.g., gasLimit: 100000
    };

    const tx = await dataOracle.setLatestData(
      data,
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

async function processRequest(dataOracle, id) {
  let retries = 0;
  while (retries < MAX_RETRIES) {
    console.log("here in process request is------>", retries);
    try {
      const btcUsdtData = await getBtcUsdtData();
      if (!btcUsdtData) {
        throw new Error("Failed to fetch BTC/USDT data");
      }

      const averagePrice = calculateAverage(btcUsdtData);
      if (averagePrice === null) {
        throw new Error("Failed to calculate average price");
      }

      console.log("average price is---->", averagePrice);
      const data = averagePrice;

      await setLatestData(dataOracle, id, data);
      return;
    } catch (error) {
      console.log("error is----->", error);
      if (retries === MAX_RETRIES - 1) {
        await setLatestData(dataOracle, id, "");
        return;
      }
      retries++;
    }
  }
}

async function processRequestQueue(dataOracle) {
  console.log(">> processRequestQueue 123");

  let processedRequests = 0;
  try {
    while (
      pendingRequestQueue.length > 0 &&
      processedRequests < PROCESS_CHUNK
    ) {
      console.log("in while loop is");
      const reqId = pendingRequestQueue.shift();
      console.log("req id is---->", reqId);
      await processRequest(dataOracle, reqId);
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

    const dataOracle = new ethers.Contract(
      dataOracleAddress,
      DataOracleJSON.abi,
      wallet
    );
    const oracleCaller = new ethers.Contract(
      oracleCallerAddress,
      OracleCallerJSON.abi,
      wallet
    );

    try {
      oracleCaller.on("ReceivedNewRequestIdEvent", (_id, event) => {
        console.log("NEW EVENT - ReceivedNewRequestIdEvent:", _id);
        pendingRequestQueue.push(_id);
        console.log("Event details:", event);
      });

      oracleCaller.on("DataUpdatedEvent", (_id, _data) => {
        console.log("NEW EVENT - DataUpdatedEvent: id =", _id, "data =", _data);
      });
    } catch (e) {
      console.log("error is---->", e);
    }

    setInterval(async () => {
      console.log(pendingRequestQueue);
      await getBtcUsdtData();
      // await processRequestQueue(dataOracle);
    }, 2000);
  } catch (e) {
    console.log("error is ----->", e);
  }
})();
