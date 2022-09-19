/** @format */

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-truffle5";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      { version: "0.8.0" },
      { version: "0.4.15" },
      { version: "0.6.5" },
      { version: "0.5.9" },
      { version: "^0.8.0" },
    ],
  },
};

export default config;
