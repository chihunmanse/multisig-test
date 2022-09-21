/** @format */

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, BigNumber } from "ethers";
import { ethers, expect } from "hardhat";

describe("Gnosis Test", () => {
  interface TX {
    destination: string;
    value: BigNumber;
    data: string;
  }

  let owner1: SignerWithAddress,
    owner2: SignerWithAddress,
    owner3: SignerWithAddress,
    owner4: SignerWithAddress,
    notOwner: SignerWithAddress,
    newOwner: SignerWithAddress;

  let multisig: Contract, erc721: Contract, tx: TX;

  before(async () => {
    [owner1, owner2, owner3, owner4, notOwner, newOwner] =
      await ethers.getSigners();
    console.log("Deploying contracts with the account: " + owner1.address);

    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    multisig = await MultiSigWallet.deploy(
      [owner1.address, owner2.address, owner3.address, owner4.address],
      2
    );
    await multisig.deployed();
    console.log(`MultiSigWallet deployed to: ${multisig.address}`);

    const Test721 = await ethers.getContractFactory("Test721");
    erc721 = await Test721.deploy("Test", "Test", multisig.address); // owner is multisig contract
    await erc721.deployed();
  });

  describe("Transaction", () => {
    it("transfer ether : success", async () => {
      const sendEtherTx = await owner1.sendTransaction({
        to: multisig.address,
        value: ethers.utils.parseEther("1"),
      });
      await sendEtherTx.wait();

      const multisigBalance1 = await multisig.getBalance();
      expect(multisigBalance1).to.equal(ethers.utils.parseEther("1"));

      tx = {
        destination: notOwner.address,
        value: ethers.utils.parseEther("1"),
        data: "0x",
      };

      const submitTx = await multisig
        .connect(owner1)
        .submitTransaction(tx.destination, tx.value, tx.data);
      await submitTx.wait();

      const newTx = await multisig.transactions(0);
      expect(newTx.destination).to.equal(notOwner.address);

      const submitTx2 = await multisig.connect(owner2).confirmTransaction(0);
      await submitTx2.wait();

      await expect(submitTx2).to.emit(multisig, "Execution").withArgs("0");

      const multisigBalance2 = await multisig.getBalance();
      expect(multisigBalance2).to.equal("0");

      const notOnwerBalance = await notOwner.getBalance();
      expect(notOnwerBalance).to.equal(ethers.utils.parseEther("101"));
    });

    it("contract call : success", async () => {
      const encodeData = erc721.interface.encodeFunctionData("mint", [
        notOwner.address,
      ]);

      tx = {
        destination: erc721.address,
        value: BigNumber.from("0"),
        data: encodeData,
      };

      const submitTx = await multisig
        .connect(owner1)
        .submitTransaction(tx.destination, tx.value, tx.data);
      await submitTx.wait();

      const newTx = await multisig.transactions(1);
      expect(newTx.destination).to.equal(erc721.address);

      const submitTx2 = await multisig.connect(owner2).confirmTransaction(1);
      await submitTx2.wait();

      await expect(submitTx2).to.emit(multisig, "Execution").withArgs("1");

      const tokenOnwer = await erc721.ownerOf(1);
      expect(tokenOnwer).to.equal(notOwner.address);
    });

    it("add owner : success", async () => {
      const encodeData = multisig.interface.encodeFunctionData("addOwner", [
        newOwner.address,
      ]);

      tx = {
        destination: multisig.address,
        value: BigNumber.from("0"),
        data: encodeData,
      };

      const submitTx = await multisig
        .connect(owner1)
        .submitTransaction(tx.destination, tx.value, tx.data);
      await submitTx.wait();

      const newTx = await multisig.transactions(2);
      expect(newTx.destination).to.equal(multisig.address);

      const submitTx2 = await multisig.connect(owner2).confirmTransaction(2);
      await submitTx2.wait();

      await expect(submitTx2).to.emit(multisig, "Execution").withArgs("2");

      const isOwner = await multisig.isOwner(newOwner.address);
      expect(isOwner).to.equal(true);
    });
  });
});
