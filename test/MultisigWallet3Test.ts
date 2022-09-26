/** @format */

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "ethers";
import { ethers, expect } from "hardhat";
import { Interface } from "ethers/lib/utils";
import { converter } from "../helpers/coverter";

describe("MultisigWallet3", () => {
  interface Transaction {
    to: string;
    value: number;
    data: string;
  }
  enum MaxRequirementType {
    UNDER,
    EQUAL,
  }
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  let owner1: SignerWithAddress,
    owner2: SignerWithAddress,
    owner3: SignerWithAddress,
    owner4: SignerWithAddress,
    notOwner: SignerWithAddress,
    newOwner: SignerWithAddress,
    receiver: SignerWithAddress;

  let wallet: Contract, erc721: Contract, erc20: Contract;

  let tx: Transaction;

  before(async () => {
    [owner1, owner2, owner3, owner4, notOwner, newOwner, receiver] =
      await ethers.getSigners();
    console.log("Deploying contracts with the account: " + owner1.address);

    const MultisigWallet = await ethers.getContractFactory("MultisigWallet3");
    wallet = await MultisigWallet.deploy([
      owner1.address,
      owner2.address,
      owner3.address,
      owner4.address,
    ]);
    await wallet.deployed();
    console.log(`MultiSigWallet deployed to: ${wallet.address}`);

    const WalletNFT = await ethers.getContractFactory("WalletNFT");
    erc721 = await WalletNFT.deploy("Test", "Test", wallet.address); // owner is wallet contract
    await erc721.deployed();

    const WalletFT = await ethers.getContractFactory("WalletFT");
    erc20 = await WalletFT.deploy(ethers.utils.parseEther("1000"));
  });

  describe("Transaction", () => {
    it("Submit Transaction 1 : Success : Transfer Ether", async () => {
      const sendEtherTx = await owner1.sendTransaction({
        to: wallet.address,
        value: converter(1, "ether", "wei"),
      });
      await sendEtherTx.wait();

      const walletBalance = await wallet.getBalance();
      expect(walletBalance).to.equal(converter(1, "ether", "wei"));

      tx = {
        to: receiver.address,
        value: converter(1, "ether", "wei"),
        data: "0x",
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await expect(submitTx)
        .to.emit(wallet, "SubmitTransaction")
        .withArgs(
          owner1.address,
          "1",
          receiver.address,
          converter(1, "ether", "wei"),
          "0x"
        );
      await expect(submitTx)
        .to.emit(wallet, "ConfirmTransaction")
        .withArgs(owner1.address, "1");

      const newTx = await wallet.getTxById(1);
      expect(newTx.to).to.equal(receiver.address);
    });

    it("Submit Transaction : Failed : Only Owner", async () => {
      tx = {
        to: receiver.address,
        value: converter(1, "ether", "wei"),
        data: "0x",
      };

      const submitTx = wallet
        .connect(notOwner)
        .submitTransaction(tx.to, tx.value, tx.data);

      await expect(submitTx).to.revertedWithCustomError(wallet, "OnlyOwner");
    });

    it("Submit Transaction : Failed : Invalid Argument", async () => {
      tx = {
        to: ZERO_ADDRESS,
        value: converter(1, "ether", "wei"),
        data: "0x",
      };

      const submitTx = wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);

      await expect(submitTx).to.revertedWithCustomError(
        wallet,
        "InvalidArgument"
      );
    });

    it("Revoke Confirmation Tx 1 : Success", async () => {
      const revokeTx = await wallet.connect(owner1).revokeConfirmation(1);

      await expect(revokeTx)
        .to.emit(wallet, "RevokeConfirmation")
        .withArgs(owner1.address, 1);
    });

    it("Revoke Confirmation Tx 1 : Failed : Only Owner", async () => {
      const revokeTx = wallet.connect(notOwner).revokeConfirmation(1);

      await expect(revokeTx).to.revertedWithCustomError(wallet, "OnlyOwner");
    });

    it("Revoke Confirmation Tx 1 : Failed : Does Not Confirmed Tx", async () => {
      const revokeTx = wallet.connect(owner1).revokeConfirmation(1);

      await expect(revokeTx).to.revertedWithCustomError(
        wallet,
        "DoesNotConfirmedTx"
      );
    });

    it("Revoke Confirmation Tx 1 : Failed : Does Not Exist Tx", async () => {
      const revokeTx = wallet.connect(owner1).revokeConfirmation(100);

      await expect(revokeTx).to.revertedWithCustomError(
        wallet,
        "DoesNotExistTx"
      );
    });

    it("Confirm Transaction Tx 1 : Success", async () => {
      const confirmTx = await wallet.connect(owner2).confirmTransaction(1);

      await expect(confirmTx)
        .to.emit(wallet, "ConfirmTransaction")
        .withArgs(owner2.address, 1);

      const confirmCount = await wallet.getConfirmCount(1);
      expect(confirmCount).to.equal(1);
    });

    it("Confirm Transaction : Failed : Only Owner", async () => {
      const confirmTx = wallet.connect(notOwner).confirmTransaction(1);

      await expect(confirmTx).to.revertedWithCustomError(wallet, "OnlyOwner");
    });

    it("Confirm Transaction : Failed : Does Not Exist Tx", async () => {
      const confirmTx = wallet.connect(owner3).confirmTransaction(100);

      await expect(confirmTx).to.revertedWithCustomError(
        wallet,
        "DoesNotExistTx"
      );
    });

    it("Confirm Transaction : Failed : Already Confirmed Tx", async () => {
      const confirmTx = wallet.connect(owner2).confirmTransaction(1);

      await expect(confirmTx).to.revertedWithCustomError(
        wallet,
        "AlreadyConfirmedTx"
      );
    });

    it("Execute Transaction Tx 1 : Success", async () => {
      const confirmTx = await wallet.connect(owner1).confirmTransaction(1);
      await confirmTx.wait();

      const beforeReceiverBalance = await receiver.getBalance();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(1);
      await lastConfirmTx.wait();

      const isConfirmed = await wallet.isConfirmedTx(1);
      expect(isConfirmed).to.equal(true);

      await expect(lastConfirmTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner3.address, "1");

      const walletBalance = await wallet.getBalance();
      expect(walletBalance).to.equal("0");

      const receiverBalance = await receiver.getBalance();
      expect(receiverBalance).to.equal(
        beforeReceiverBalance.add(converter(1, "ether", "wei"))
      );
    });

    it("Revoke Confirmation Tx 1 : Failed : Already Executed Tx", async () => {
      const revokeTx = wallet.connect(owner1).revokeConfirmation(1);

      await expect(revokeTx).to.revertedWithCustomError(
        wallet,
        "AlreadyExecutedTx"
      );
    });

    it("Confirm Transaction Tx 1 : Failed : Already Executed Tx", async () => {
      const confirmTx = wallet.connect(owner4).confirmTransaction(1);

      await expect(confirmTx).to.revertedWithCustomError(
        wallet,
        "AlreadyExecutedTx"
      );
    });

    it("Execute Transaction Tx 2 : Success : Contract Call : ERC721 Mint", async () => {
      const encodeData = erc721.interface.encodeFunctionData("mint", [
        receiver.address,
      ]);

      tx = {
        to: erc721.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const newTx = await wallet.getTxById(2);
      expect(newTx.to).to.equal(erc721.address);

      const confirmTx = await wallet.connect(owner2).confirmTransaction(2);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(2);
      await expect(lastConfirmTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner3.address, "2");

      const tokenOnwer = await erc721.ownerOf(1);
      expect(tokenOnwer).to.equal(receiver.address);
    });

    it("Execute Transaction Tx 3 : Success : Contract Call : Add Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("addOwner", [
        newOwner.address,
      ]);

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const newTx = await wallet.getTxById(3);
      expect(newTx.to).to.equal(wallet.address);

      const confirmTx = await wallet.connect(owner2).confirmTransaction(3);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(3);
      await expect(lastConfirmTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner3.address, "3");
      await expect(lastConfirmTx)
        .to.emit(wallet, "OwnerAdded")
        .withArgs(newOwner.address);

      const isOwner = await wallet.isOwner(newOwner.address);
      expect(isOwner).to.equal(true); // owner 5 txRequirement 3
    });

    it("Execute Transaction Tx 4 : Success : Contract Call : Transfer ERC20", async () => {
      const transferTx = await erc20
        .connect(owner1)
        .transfer(wallet.address, converter(50, "ether", "wei"));
      await transferTx.wait();

      const encodeData = erc20.interface.encodeFunctionData("transfer", [
        receiver.address,
        converter(50, "ether", "wei"),
      ]);

      tx = {
        to: erc20.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const newTx = await wallet.getTxById(4);
      expect(newTx.to).to.equal(erc20.address);

      const confirmTx = await wallet.connect(owner2).confirmTransaction(4);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(4);
      await expect(lastConfirmTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner3.address, "4");

      const balance = await erc20.balanceOf(receiver.address);
      expect(balance).to.equal(converter(50, "ether", "wei"));
    });

    it("Execute Transaction Tx 5 : Success : Contract Call : TransferFrom ERC20", async () => {
      const approveTx = await erc20
        .connect(owner1)
        .approve(wallet.address, converter(50, "ether", "wei"));
      await approveTx.wait();

      const encodeData = erc20.interface.encodeFunctionData("transferFrom", [
        owner1.address,
        owner2.address,
        converter(50, "ether", "wei"),
      ]);

      tx = {
        to: erc20.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const newTx = await wallet.getTxById(5);
      expect(newTx.to).to.equal(erc20.address);

      const confirmTx = await wallet.connect(owner2).confirmTransaction(5);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(5);
      await expect(lastConfirmTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner3.address, "5");

      const balance = await erc20.balanceOf(owner2.address);
      expect(balance).to.equal(converter(50, "ether", "wei"));
    });

    it("Execute Transaction Tx 6 : Success : Contract Call : SafeTransferFrom ERC721", async () => {
      const approveTx = await erc721
        .connect(receiver)
        .approve(wallet.address, 1);
      await approveTx.wait();

      const ERC721 = new Interface([
        "function safeTransferFrom(address from, address from, uint256 amount)",
      ]);

      const encodeData = ERC721.encodeFunctionData("safeTransferFrom", [
        receiver.address,
        wallet.address,
        1,
      ]);

      tx = {
        to: erc721.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const newTx = await wallet.getTxById(6);
      expect(newTx.to).to.equal(erc721.address);

      const confirmTx = await wallet.connect(owner2).confirmTransaction(6);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(6);
      await expect(lastConfirmTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner3.address, "6");

      const owner = await erc721.ownerOf(1);
      expect(owner).to.equal(wallet.address);
    });

    it("Execute Transaction Tx 7 : Failed : Failed Tx", async () => {
      const ERC721 = new Interface([
        "function safeTransferFrom(address from, address from, uint256 amount)",
      ]);

      const encodeData = ERC721.encodeFunctionData("safeTransferFrom", [
        receiver.address,
        wallet.address,
        1,
      ]);

      tx = {
        to: erc721.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const newTx = await wallet.getTxById(7);
      expect(newTx.to).to.equal(erc721.address);

      const confirmTx = await wallet.connect(owner2).confirmTransaction(7);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(7);
      await expect(lastConfirmTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner3.address, 7);
    });
  });

  describe("Wallet", () => {
    it("Add Owner : Failed : Only Wallet", async () => {
      const addOwnerTx = wallet.connect(owner1).addOwner(notOwner.address);
      await expect(addOwnerTx).to.revertedWithCustomError(wallet, "OnlyWallet");
    });

    it("Add Owner Tx 8 : Failed : Invalid Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("addOwner", [
        ZERO_ADDRESS,
      ]);

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(8);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(8);
      await expect(lastConfirmTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner3.address, 8);
    });

    it("Add Owner Tx 9 : Failed : Already Exsit Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("addOwner", [
        owner1.address,
      ]);

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(9);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(9);
      await expect(lastConfirmTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner3.address, 9);
    });

    // owner 5 - 1 txRequirement 3, UNDER
    it("Remove Owner Tx 10 : Success : UNDER", async () => {
      const encodeData = wallet.interface.encodeFunctionData("removeOwner", [
        newOwner.address,
      ]);

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(10);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(10);
      await expect(lastConfirmTx)
        .to.emit(wallet, "OwnerRemoved")
        .withArgs(newOwner.address); // owner 4, txRequirement 3
    });

    it("Remove Owner : Failed : OnlyWallet", async () => {
      const removeOwnerTx = wallet.connect(owner3).removeOwner(owner1.address);
      await expect(removeOwnerTx).to.revertedWithCustomError(
        wallet,
        "OnlyWallet"
      );
    });

    it("Remove Owner Tx 11 : Failed : Does Not Exist Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("removeOwner", [
        notOwner.address,
      ]);

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(11);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(11);
      await expect(lastConfirmTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner3.address, 11);
    });

    it("Remove Owner Tx 12 : Failed : Invalid Tx Requirement : UNDER", async () => {
      const encodeData = wallet.interface.encodeFunctionData("removeOwner", [
        owner4.address,
      ]);

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(12);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(12);
      await expect(lastConfirmTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner3.address, 12);
    });

    it("Change Owner Tx 13 : Success", async () => {
      const encodeData = wallet.interface.encodeFunctionData("changeOwner", [
        owner4.address,
        newOwner.address,
      ]);

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(13);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner4).confirmTransaction(13);
      await expect(lastConfirmTx)
        .to.emit(wallet, "OwnerRemoved")
        .withArgs(owner4.address);
      await expect(lastConfirmTx)
        .to.emit(wallet, "OwnerAdded")
        .withArgs(newOwner.address);
    });

    it("Change Owner : Failed : OnlyWallet", async () => {
      const changeOwnerTx = wallet
        .connect(owner1)
        .changeOwner(owner1.address, receiver.address);
      await expect(changeOwnerTx).to.revertedWithCustomError(
        wallet,
        "OnlyWallet"
      );
    });

    it("Change Owner Tx 14 : Failed : Invalid Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("changeOwner", [
        newOwner.address,
        ZERO_ADDRESS,
      ]);

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(14);
      await confirmTx.wait();

      const lastConfirmTx = await wallet
        .connect(newOwner)
        .confirmTransaction(14);
      await expect(lastConfirmTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(newOwner.address, 14);
    });

    it("Change Owner Tx 15 : Failed : Does Not Exist Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("changeOwner", [
        notOwner.address,
        owner4.address,
      ]);

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(15);
      await confirmTx.wait();

      const lastConfirmTx = await wallet
        .connect(newOwner)
        .confirmTransaction(15);

      await expect(lastConfirmTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(newOwner.address, 15);

      const failedTx = await wallet.getTxById(15);
      expect(failedTx.executed).to.equal(false);
    });

    it("Change Owner Tx 16 : Failed : Already Exist Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("changeOwner", [
        owner1.address,
        owner2.address,
      ]);

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(16);
      await confirmTx.wait();

      const lastConfirmTx = await wallet
        .connect(newOwner)
        .confirmTransaction(16);
      await expect(lastConfirmTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(newOwner.address, 16);
    });

    it("Change TxRequirement Tx 17 : Success : UNDER", async () => {
      const encodeData = wallet.interface.encodeFunctionData(
        "changeTxRequirement",
        [MaxRequirementType.UNDER, 2]
      );

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(17);
      await confirmTx.wait();

      const lastConfirmTx = await wallet
        .connect(newOwner)
        .confirmTransaction(17);
      await expect(lastConfirmTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(newOwner.address, 17);
      await expect(lastConfirmTx)
        .to.emit(wallet, "TxRequirementChanged")
        .withArgs(MaxRequirementType.UNDER, 2);
      // owner 4, txRequirement 2
    });

    it("Change TxRequirement : Failed : OnlyWallet", async () => {
      const changeTxRequirementTx = wallet
        .connect(owner1)
        .changeTxRequirement(MaxRequirementType.UNDER, 3);
      await expect(changeTxRequirementTx).to.revertedWithCustomError(
        wallet,
        "OnlyWallet"
      );
    });

    it("Change TxRequirement Tx 18 : Failed : Invalid TxRequirement : UNDER", async () => {
      const encodeData = wallet.interface.encodeFunctionData(
        "changeTxRequirement",
        [MaxRequirementType.UNDER, 4]
      );

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const lastConfirmTx = await wallet.connect(owner2).confirmTransaction(18);
      await expect(lastConfirmTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner2.address, 18);
    });

    it("Change TxRequirement Tx 19 : Failed : Invalid TxRequirement : EQUAL", async () => {
      const encodeData = wallet.interface.encodeFunctionData(
        "changeTxRequirement",
        [MaxRequirementType.EQUAL, 5]
      );

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const lastConfirmTx = await wallet.connect(owner2).confirmTransaction(19);
      await expect(lastConfirmTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner2.address, 19);
    });

    it("Change TxRequirement Tx 20 : Success : EQUAL", async () => {
      const encodeData = wallet.interface.encodeFunctionData(
        "changeTxRequirement",
        [MaxRequirementType.EQUAL, 4]
      );

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const lastConfirmTx = await wallet.connect(owner2).confirmTransaction(20);
      await expect(lastConfirmTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner2.address, 20);
      await expect(lastConfirmTx)
        .to.emit(wallet, "TxRequirementChanged")
        .withArgs(MaxRequirementType.EQUAL, 4);
      // owner 4, txRequirement 4
    });

    it("Change TxRequirement Tx 21 : Success : EQUAL 2", async () => {
      const encodeData = wallet.interface.encodeFunctionData(
        "changeTxRequirement",
        [MaxRequirementType.EQUAL, 3]
      );

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx1 = await wallet.connect(owner2).confirmTransaction(21);
      await confirmTx1.wait();

      const confirmTx2 = await wallet.connect(owner3).confirmTransaction(21);
      await confirmTx2.wait();

      const lastConfirmTx = await wallet
        .connect(newOwner)
        .confirmTransaction(21);
      await expect(lastConfirmTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(newOwner.address, 21);
      await expect(lastConfirmTx)
        .to.emit(wallet, "TxRequirementChanged")
        .withArgs(MaxRequirementType.EQUAL, 3);
      // owner 4, txRequirement 3
    });

    it("Remove Owner Tx 22 : Success : EQUAL", async () => {
      const encodeData = wallet.interface.encodeFunctionData("removeOwner", [
        newOwner.address,
      ]);

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx1 = await wallet.connect(owner2).confirmTransaction(22);
      await confirmTx1.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(22);
      await expect(lastConfirmTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner3.address, 22);
      await expect(lastConfirmTx)
        .to.emit(wallet, "OwnerRemoved")
        .withArgs(newOwner.address);
      // owner 3, txRequirement 3
    });

    it("Remove Owner Tx 23 : Failed : Invalid Tx Requirement : EQUAL", async () => {
      const encodeData = wallet.interface.encodeFunctionData("removeOwner", [
        owner3.address,
      ]);

      tx = {
        to: wallet.address,
        value: 0,
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx1 = await wallet.connect(owner2).confirmTransaction(23);
      await confirmTx1.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(23);
      await expect(lastConfirmTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner3.address, 23);
    });

    it("Read Func : Success", async () => {
      const isOwner1 = await wallet.isOwner(owner1.address);
      expect(isOwner1).to.equal(true);
      const isOwner2 = await wallet.isOwner(notOwner.address);
      expect(isOwner2).to.equal(false);

      const ownerCount = await wallet.getOwnerCount();
      expect(ownerCount).to.equal(3);

      const owners = await wallet.getOwners();
      expect(owners[0]).to.equal(owner1.address);
      expect(owners[1]).to.equal(owner2.address);
      expect(owners[2]).to.equal(owner3.address);

      const isExistTx1 = await wallet.isExistTx(1);
      expect(isExistTx1).to.equal(true);
      const isExistTx2 = await wallet.isExistTx(100);
      expect(isExistTx2).to.equal(false);

      const txCount = await wallet.getTxCount();
      expect(txCount).to.equal(23);

      const tx = await wallet.getTxById(23);
      expect(tx.to).to.equal(wallet.address);
      expect(tx.value).to.equal(0);
      expect(tx.executed).to.equal(false);

      const isConfirmedTx = await wallet.isConfirmedTx(23);
      expect(isConfirmedTx).to.equal(true);

      const isConfirmedByOwner1 = await wallet.isConfirmedByOwner(
        22,
        owner1.address
      );
      expect(isConfirmedByOwner1).to.equal(true);
      const isConfirmedByOwner2 = await wallet.isConfirmedByOwner(
        22,
        newOwner.address
      );
      expect(isConfirmedByOwner2).to.equal(false);

      const confirmCount = await wallet.getConfirmCount(23);
      expect(confirmCount).to.equal(3);

      const confirmOwnerOfTx = await wallet.getConfirmOwnerOfTx(23);
      expect(confirmOwnerOfTx[0]).to.equal(owner1.address);
      expect(confirmOwnerOfTx[1]).to.equal(owner2.address);
      expect(confirmOwnerOfTx[2]).to.equal(owner3.address);

      const maxRequirementType = await wallet.getMaxRequirementType();
      expect(maxRequirementType).to.equal(MaxRequirementType.EQUAL);

      const txRequirement = await wallet.getTxRequirement();
      expect(txRequirement).to.equal(3);

      // 7, 8, 9, 11, 12, 14, 15, 16, 18, 19, 23
      const pendingTxs = await wallet.getTxs(1, 30, true, false);
      expect(pendingTxs.length).to.equal(11);
      expect(pendingTxs[0].id).to.equal(7);
      expect(pendingTxs[10].id).to.equal(23);

      // 1, 2, 3, 4, 5, 6, 10, 13, 17, 20, 21, 22
      const executedTxs = await wallet.getTxs(1, 30, false, true);
      expect(executedTxs.length).to.equal(12);
      expect(executedTxs[0].id).to.equal(1);
      expect(executedTxs[11].id).to.equal(22);

      // 7, 8, 9, 11, 12
      const pendingTxs2 = await wallet.getTxs(1, 5, true, false);
      expect(pendingTxs2.length).to.equal(5);
      expect(pendingTxs2[0].id).to.equal(7);
      expect(pendingTxs2[4].id).to.equal(12);

      // 5, 6, 10, 13, 17
      const executedTxs2 = await wallet.getTxs(5, 5, false, true);
      expect(executedTxs2.length).to.equal(5);
      expect(executedTxs2[0].id).to.equal(5);
      expect(executedTxs2[4].id).to.equal(17);
    });
  });
});
