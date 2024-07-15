const { ethers } = require("ethers");
require("dotenv").config();
const OracleCallerJSON = require(__dirname +
  "/../artifacts/contracts/OracleCaller.sol/OracleCaller.json");

const oracleCallerAddress = "0xE2C3793b99da8B0eCFf4cE5aD21D4759c7859C80";
const MAX_RETRIES = 5;

const main = async () => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(
      process.env.PROVIDER_URL
    );

    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    console.log("Wallet address:", wallet.address);

    const oracleCaller = new ethers.Contract(
      oracleCallerAddress,
      OracleCallerJSON.abi,
      wallet
    );

    console.log("Setting up event listener for ReceivedNewRequestIdEvent...");

    oracleCaller.on("ReceivedNewRequestIdEvent", (id, event) => {
      console.log("NEW EVENT - ReceivedNewRequestIdEvent:", id);
      console.log("Event details:", event);
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("Triggering updateData...");
    const tx = await executeWithRetry(async () => {
      const feeData = await provider.getFeeData();
   

      const gasLimit = await oracleCaller.estimateGas.updateData();
      console.log("Estimated Gas Limit:", gasLimit.toString());

      const tx = await oracleCaller.updateData({
        maxPriorityFeePerGas:
          feeData.maxPriorityFeePerGas*100 || ethers.utils.parseUnits("50", "gwei"),
        maxFeePerGas:
          feeData.maxFeePerGas*100 || ethers.utils.parseUnits("100", "gwei"),
        gasLimit: gasLimit*10,
      });

      return tx;
    });


    await tx.wait();
    console.log("Transaction after success is----->", tx);

    const events = await oracleCaller.queryFilter("ReceivedNewRequestIdEvent");
    console.log("Queried Events:", events);
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
