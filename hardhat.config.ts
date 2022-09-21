/** @format */

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-truffle5";
import "@nomicfoundation/hardhat-network-helpers";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [{ version: "0.8.16" }, { version: "0.4.15" }],
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      accounts: { count: 10, accountsBalance: "100000000000000000000" }, // 100 ether
    },
  },
};

export default config;
