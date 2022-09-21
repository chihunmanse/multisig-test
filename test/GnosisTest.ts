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
    newOwner: SignerWithAddress,
    receiver: SignerWithAddress;

  let multisig: Contract, erc721: Contract, tx: TX;

  before(async () => {
    [owner1, owner2, owner3, owner4, notOwner, newOwner, receiver] =
      await ethers.getSigners();
    console.log("Deploying contracts with the account: " + owner1.address);

    const MultiSigWallet = await ethers.getContractFactory("MultiSigWallet");
    multisig = await MultiSigWallet.deploy(
      [owner1.address, owner2.address, owner3.address, owner4.address],
      3 // required 3
    );
    await multisig.deployed();
    console.log(`MultiSigWallet deployed to: ${multisig.address}`);

    const Test721 = await ethers.getContractFactory("Test721");
    erc721 = await Test721.deploy("Test", "Test", multisig.address); // owner is multisig contract
    await erc721.deployed();
  });

  describe("Transaction", () => {
    it("submitTransaction 0 : success : transfer ether", async () => {
      const sendEtherTx = await owner1.sendTransaction({
        to: multisig.address,
        value: ethers.utils.parseEther("1"),
      });
      await sendEtherTx.wait();

      const multisigBalance = await multisig.getBalance();
      expect(multisigBalance).to.equal(ethers.utils.parseEther("1"));

      tx = {
        destination: receiver.address,
        value: ethers.utils.parseEther("1"),
        data: "0x",
      };

      const submitTx = await multisig
        .connect(owner1)
        .submitTransaction(tx.destination, tx.value, tx.data);
      await submitTx.wait();

      const newTx = await multisig.transactions(0);
      expect(newTx.destination).to.equal(receiver.address);
    });

    it("submitTransaction : failed : not owner", async () => {
      tx = {
        destination: receiver.address,
        value: ethers.utils.parseEther("1"),
        data: "0x",
      };

      const submitTx = multisig
        .connect(notOwner)
        .submitTransaction(tx.destination, tx.value, tx.data);

      await expect(submitTx).to.revertedWithoutReason();
    });

    it("submitTransaction : failed : destination is null address", async () => {
      tx = {
        destination: "0x0000000000000000000000000000000000000000",
        value: ethers.utils.parseEther("1"),
        data: "0x",
      };

      const submitTx = multisig
        .connect(owner1)
        .submitTransaction(tx.destination, tx.value, tx.data);

      await expect(submitTx).to.revertedWithoutReason();
    });

    it("revokeConfirmation tx 0 : success", async () => {
      const revokeTx = await multisig.connect(owner1).revokeConfirmation(0);

      await expect(revokeTx)
        .to.emit(multisig, "Revocation")
        .withArgs(owner1.address, 0);
    });

    it("revokeConfirmation tx 0 : failed : not owner", async () => {
      const revokeTx = multisig.connect(notOwner).revokeConfirmation(0);

      await expect(revokeTx).to.revertedWithoutReason();
    });

    it("revokeConfirmation tx 0 : failed : not confirmation", async () => {
      const revokeTx = multisig.connect(owner1).revokeConfirmation(0);

      await expect(revokeTx).to.revertedWithoutReason();
    });

    it("confirmTransaction tx 0 : success", async () => {
      const confirmTx = await multisig.connect(owner2).confirmTransaction(0);

      await expect(confirmTx)
        .to.emit(multisig, "Confirmation")
        .withArgs(owner2.address, 0);

      const confirmCount = await multisig.getConfirmationCount(0);
      expect(confirmCount).to.equal(1);
    });

    it("excuteTransaction tx 0 : success", async () => {
      await multisig.connect(owner1).confirmTransaction(0);
      const lastConfirmTx = await multisig
        .connect(owner3)
        .confirmTransaction(0);

      await expect(lastConfirmTx).to.emit(multisig, "Execution").withArgs("0");

      const multisigBalance = await multisig.getBalance();
      expect(multisigBalance).to.equal("0");

      const receiverBalance = await receiver.getBalance();
      expect(receiverBalance).to.equal(ethers.utils.parseEther("101"));
    });

    it("revokeConfirmation tx 0 : failed : already excute", async () => {
      const revokeTx = multisig.connect(owner1).revokeConfirmation(0);

      await expect(revokeTx).to.revertedWithoutReason();
    });

    it("excuteTransaction tx 1 : contract call : success", async () => {
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

      const confirmTx = await multisig.connect(owner2).confirmTransaction(1);
      await confirmTx.wait();

      const lastConfirmTx = await multisig
        .connect(owner3)
        .confirmTransaction(1);
      await lastConfirmTx.wait();

      await expect(lastConfirmTx).to.emit(multisig, "Execution").withArgs("1");

      const tokenOnwer = await erc721.ownerOf(1);
      expect(tokenOnwer).to.equal(notOwner.address);
    });

    it("excuteTransaction tx 2 : add owner : success", async () => {
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

      const confirmTx = await multisig.connect(owner2).confirmTransaction(2);
      await confirmTx.wait();

      const lastConfirmTx = await multisig
        .connect(owner3)
        .confirmTransaction(2);
      await lastConfirmTx.wait();

      await expect(lastConfirmTx).to.emit(multisig, "Execution").withArgs("2");
      await expect(lastConfirmTx)
        .to.emit(multisig, "OwnerAddition")
        .withArgs(newOwner.address);

      const isOwner = await multisig.isOwner(newOwner.address);
      expect(isOwner).to.equal(true);
    });
  });
});
