const { ethers } = require("ethers");
require("dotenv").config();
const OracleCallerJSON = require(__dirname +
  "/../artifacts/contracts/OracleCaller.sol/OracleCaller.json");

const oracleCallerAddressBTC = "0xE2C3793b99da8B0eCFf4cE5aD21D4759c7859C80";
const oracleCallerAddressETH = "0xCdCfaD6c5555D124879c27B91DfA681649EC9772";
const oracleCallerAddressSTX = "0x6DDf9A02F2A913d70f4939f9307d4cb2d2BD8e57";
const oracleCallerAddressCKB = "0x01df4883ff3c8dD7D5524E6a7D3f3c62102BeD6e";

const MAX_RETRIES = 5;

const main = async () => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(
      process.env.PROVIDER_URL
    );
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    console.log("Wallet address:", wallet.address);

    const oracleCallerBTC = new ethers.Contract(
      oracleCallerAddressBTC,
      OracleCallerJSON.abi,
      wallet
    );
    const oracleCallerETH = new ethers.Contract(
      oracleCallerAddressETH,
      OracleCallerJSON.abi,
      wallet
    );
    const oracleCallerSTX = new ethers.Contract(
      oracleCallerAddressSTX,
      OracleCallerJSON.abi,
      wallet
    );
    const oracleCallerCKB = new ethers.Contract(
      oracleCallerAddressCKB,
      OracleCallerJSON.abi,
      wallet
    );

    console.log("Setting up event listener for ReceivedNewRequestIdEvent...");

    // Set up event listeners for each oracleCaller
    const oracleCallers = [
      { name: "BTC", contract: oracleCallerBTC },
      { name: "ETH", contract: oracleCallerETH },
      { name: "STX", contract: oracleCallerSTX },
      { name: "CKB", contract: oracleCallerCKB },
    ];

    for (const { name, contract } of oracleCallers) {
      contract.on("ReceivedNewRequestIdEvent", (id, event) => {
        console.log(`NEW EVENT - ReceivedNewRequestIdEvent for ${name}:`, id);
        console.log("Event details:", event);
      });

      contract.on("DataUpdatedEvent", (id, data) => {
        console.log(
          `NEW EVENT - DataUpdatedEvent for ${name}: id =`,
          id,
          "data =",
          data
        );
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("Triggering updateData for all pairs...");

    // Trigger updateData for each oracleCaller
    for (const { name, contract } of oracleCallers) {
      const tx = await executeWithRetry(async () => {
        const feeData = await provider.getFeeData();
        const gasLimit = await contract.estimateGas.updateData();
        console.log(`Estimated Gas Limit for ${name}:`, gasLimit.toString());

        // Increase the gas price by a buffer to avoid underpriced transactions
        const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas.mul(50);
        const maxFeePerGas = feeData.maxFeePerGas.mul(50);

        const tx = await contract.updateData({
          gasLimit: gasLimit,
          maxPriorityFeePerGas: maxPriorityFeePerGas,
          maxFeePerGas: maxFeePerGas,
        });

        return tx;
      });

      await tx.wait();
      console.log(`Transaction for ${name} after success is----->`, tx);
    }

    // Query events for BTC as an example (repeat for other pairs if needed)
    const eventsBTC = await oracleCallerBTC.queryFilter(
      "ReceivedNewRequestIdEvent"
    );
    console.log("Queried Events for BTC:", eventsBTC);
  } catch (error) {
    console.error("Error in main execution:", error);
  }
};

const executeWithRetry = async (fn) => {
  let retries = 0;
  while (retries < MAX_RETRIES) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === -32005 || error.message.includes("limit exceeded")) {
        retries++;
        const delay = Math.pow(2, retries) * 1000; // Exponential backoff
        console.log(
          `Rate limit exceeded. Retrying in ${delay / 1000} seconds...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (
        error.code === -32000 ||
        error.message.includes("transaction underpriced")
      ) {
        console.log("Transaction underpriced error, retrying...");
        retries++;
        const delay = Math.pow(2, retries) * 1000; // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw new Error("Max retries reached");
};

main();
