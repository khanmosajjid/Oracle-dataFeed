
require("dotenv").config();

require("@nomicfoundation/hardhat-verify");
require("@nomiclabs/hardhat-waffle");

const ownerPrivateKey = process.env.PRIVATE_KEY;

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1200,
      },
    },
  },
  networks: {
    mumbai: {
      url: "https://polygon-mumbai.g.alchemy.com/v2/rfCruuBJ6-ND7sPx8qfywX0PjKWcmIQq",
      accounts: [ownerPrivateKey],
    },
    testnet: {
      url: "https://data-seed-prebsc-1-s2.binance.org:8545/",
      chainId: 97,
      // gasLimit: 500000,
      accounts: [ownerPrivateKey],
    },
    smartchain: {
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56,
      // gasLimit: 500000,
      accounts: [ownerPrivateKey],
    },
    amoy: {
      url: "https://rpc-amoy.polygon.technology/",
      accounts: [ownerPrivateKey],
      chainId: 80002
    },
  },
  etherscan: {
    apiKey: "NET91B9KDU24AS39FRIKRDNYIQ9UUYJ51K",
  },
};

//mumbai api key - NET91B9KDU24AS39FRIKRDNYIQ9UUYJ51K
// bsc api key - MF2AM8D1Q77SX1TTFACVHMUKUC8BN4GB6Y
