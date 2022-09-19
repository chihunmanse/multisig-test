/** @format */

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "ethers";
import { ethers, expect } from "hardhat";

describe("Proxy", () => {
  const VERSION = 1;

  let owner1: SignerWithAddress,
    owner2: SignerWithAddress,
    owner3: SignerWithAddress,
    owner4: SignerWithAddress,
    notOwner: SignerWithAddress;

  let multisig: Contract;

  before(async () => {
    [owner1, owner2, owner3, owner4, notOwner] = await ethers.getSigners();
    console.log("Deploying contracts with the account: " + owner1.address);

    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    multisig = await MultiSigWallet.deploy(
      [owner1.address, owner2.address, owner3.address, owner4.address],
      3
    );
    await multisig.deployed();
    console.log(`MultiSigWallet deployed to: ${multisig.address}`);
  });

  describe("ContractType", () => {
    it("Add ContractType : Success", async () => {
      console.log("hi");
    });
  });
});
