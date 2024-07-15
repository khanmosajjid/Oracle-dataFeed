const { ethers } = require("ethers");
const axios = require("axios");
require("dotenv").config();
const DataOracleJSON = require(__dirname +
  "/../scripts/ABIs/dataOracle.json");
const OracleCallerJSON = require(__dirname +
  "/../scripts/ABIs/oracleCaller.json");

const dataOracleAddress = "0x7C97Ac9F94186BaFb410169Fe8c477C9C608Fc8C";
const oracleCallerAddress = "0xE2C3793b99da8B0eCFf4cE5aD21D4759c7859C80";

const MAX_RETRIES = 5;
const PROCESS_CHUNK = 3;

let pendingRequestQueue = [];

async function getBtcUsdtData() {
  const urls = [
    "https://api.coinbase.com/v2/prices/spot?currency=USD",
    // "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    "https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD",
    // "https://api-pub.bitfinex.com/v2/ticker/tBTCUSD",
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
    // const coingeckoPrice = parseFloat(responses[1].data.bitcoin.usd);
    const cryptocomparePrice = parseFloat(responses[1].data.USD);
   

    console.log("Coinbase price is ---->", coinbasePrice);
    // console.log("CoinGecko price is ---->", coingeckoPrice);
    console.log("CryptoCompare price is ---->", cryptocomparePrice);


    return [coinbasePrice,cryptocomparePrice];
  } catch (error) {
    console.error(
      "Error fetching BTC/USD data:",
      error.response ? error.response.data : error.message
    );
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
      console.log("btc usd data is--->",btcUsdtData)
      if (!btcUsdtData) {
        throw new Error("Failed to fetch BTC/USDT data");
      }

      const averagePrice = calculateAverage(btcUsdtData);
      if (averagePrice === null) {
        throw new Error("Failed to calculate average price");
      }

      console.log("average price is---->", averagePrice);
      const data = averagePrice.toString();

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
 
      await processRequestQueue(dataOracle);
    }, 4000);
  } catch (e) {
    console.log("error is ----->", e);
  }
})();
