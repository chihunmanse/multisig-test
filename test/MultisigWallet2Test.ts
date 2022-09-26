/** @format */

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract, BigNumber } from "ethers";
import { ethers, expect } from "hardhat";

import { Interface } from "ethers/lib/utils";

describe("MultisigWallet2", () => {
  interface Transaction {
    to: string;
    value: BigNumber;
    data: string;
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

    const MultisigWallet = await ethers.getContractFactory("MultisigWallet2");
    wallet = await MultisigWallet.deploy(
      [owner1.address, owner2.address, owner3.address, owner4.address],
      3 // txRequirement 3
    );
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
        value: ethers.utils.parseEther("1"),
      });
      await sendEtherTx.wait();

      const walletBalance = await wallet.getBalance();
      expect(walletBalance).to.equal(ethers.utils.parseEther("1"));

      tx = {
        to: receiver.address,
        value: ethers.utils.parseEther("1"),
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
          ethers.utils.parseEther("1"),
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
        value: ethers.utils.parseEther("1"),
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
        value: ethers.utils.parseEther("1"),
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

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(1);
      await lastConfirmTx.wait();

      const isConfirmed = await wallet.isConfirmedTx(1);
      expect(isConfirmed).to.equal(true);

      const beforeReceiverBalance = await receiver.getBalance();

      const executeTx = await wallet.connect(owner1).executeTransaction(1);
      await expect(executeTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner1.address, "1");

      const walletBalance = await wallet.getBalance();
      expect(walletBalance).to.equal("0");

      const receiverBalance = await receiver.getBalance();
      expect(receiverBalance).to.equal(
        beforeReceiverBalance.add(ethers.utils.parseEther("1"))
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
        value: ethers.utils.parseEther("0"),
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
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(owner2).executeTransaction(2);
      await expect(executeTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner2.address, "2");

      const tokenOnwer = await erc721.ownerOf(1);
      expect(tokenOnwer).to.equal(receiver.address);
    });

    it("Execute Transaction Tx 3 : Success : Contract Call : Add Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("addOwner", [
        newOwner.address,
      ]);

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
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
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(owner3).executeTransaction(3);
      await expect(executeTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner3.address, "3");
      await expect(executeTx)
        .to.emit(wallet, "OwnerAdded")
        .withArgs(newOwner.address);

      const isOwner = await wallet.isOwner(newOwner.address);
      expect(isOwner).to.equal(true);
    });

    it("Execute Transaction Tx 4 : Success : Contract Call : Transfer ERC20", async () => {
      const transferTx = await erc20
        .connect(owner1)
        .transfer(wallet.address, ethers.utils.parseEther("50"));
      await transferTx.wait();

      const encodeData = erc20.interface.encodeFunctionData("transfer", [
        receiver.address,
        ethers.utils.parseEther("50"),
      ]);

      tx = {
        to: erc20.address,
        value: ethers.utils.parseEther("0"),
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
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(owner3).executeTransaction(4);
      await expect(executeTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner3.address, "4");

      const balance = await erc20.balanceOf(receiver.address);
      expect(balance).to.equal(ethers.utils.parseEther("50"));
    });

    it("Execute Transaction Tx 5 : Success : Contract Call : TransferFrom ERC20", async () => {
      const approveTx = await erc20
        .connect(owner1)
        .approve(wallet.address, ethers.utils.parseEther("50"));
      await approveTx.wait();

      const encodeData = erc20.interface.encodeFunctionData("transferFrom", [
        owner1.address,
        owner2.address,
        ethers.utils.parseEther("50"),
      ]);

      tx = {
        to: erc20.address,
        value: ethers.utils.parseEther("0"),
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
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(owner3).executeTransaction(5);
      await expect(executeTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner3.address, "5");

      const balance = await erc20.balanceOf(owner2.address);
      expect(balance).to.equal(ethers.utils.parseEther("50"));
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
        value: ethers.utils.parseEther("0"),
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
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(owner3).executeTransaction(6);
      await expect(executeTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(owner3.address, "6");

      const owner = await erc721.ownerOf(1);
      expect(owner).to.equal(wallet.address);
    });

    it("Execute Transaction Tx 7 : Failed : Only Owner", async () => {
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
        value: ethers.utils.parseEther("0"),
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
      await lastConfirmTx.wait();

      const executeTx = wallet.connect(notOwner).executeTransaction(7);
      await expect(executeTx).to.revertedWithCustomError(wallet, "OnlyOwner");
    });

    it("Execute Transaction : Failed : Does Not Exist Tx", async () => {
      const executeTx = wallet.connect(owner1).executeTransaction(100);
      await expect(executeTx).to.revertedWithCustomError(
        wallet,
        "DoesNotExistTx"
      );
    });

    it("Execute Transaction : Failed : Already Executed Tx", async () => {
      const executeTx = wallet.connect(owner1).executeTransaction(1);
      await expect(executeTx).to.revertedWithCustomError(
        wallet,
        "AlreadyExecutedTx"
      );
    });

    it("Execute Transaction Tx 7 : Failed : Failed Tx", async () => {
      const executeTx = await wallet.connect(owner1).executeTransaction(7);
      await expect(executeTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner1.address, 7);
    });

    it("Execute Transaction Tx 8 : Failed : Can Not Execute Tx", async () => {
      tx = {
        to: receiver.address,
        value: ethers.utils.parseEther("1"),
        data: "0x",
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const executeTx = wallet.connect(owner1).executeTransaction(8);
      await expect(executeTx).to.revertedWithCustomError(
        wallet,
        "CanNotExecuteTx"
      );
    });
  });

  describe("Wallet", () => {
    it("Add Owner : Failed : Only Wallet", async () => {
      const addOwnerTx = wallet.connect(owner1).addOwner(notOwner.address);
      await expect(addOwnerTx).to.revertedWithCustomError(wallet, "OnlyWallet");
    });

    it("Add Owner Tx 9 : Failed : Invalid Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("addOwner", [
        ZERO_ADDRESS,
      ]);

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(9);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(9);
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(owner3).executeTransaction(9);
      await expect(executeTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner3.address, 9);
    });

    it("Add Owner Tx 10 : Failed : Already Exsit Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("addOwner", [
        owner1.address,
      ]);

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(10);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(10);
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(owner3).executeTransaction(10);
      await expect(executeTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner3.address, 10);
    });

    it("Remove Owner Tx 11 : Success", async () => {
      const encodeData = wallet.interface.encodeFunctionData("removeOwner", [
        owner4.address,
      ]);

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(11);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(11);
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(owner3).executeTransaction(11);
      await expect(executeTx)
        .to.emit(wallet, "OwnerRemoved")
        .withArgs(owner4.address);
    });

    it("Remove Owner : Failed : OnlyWallet", async () => {
      const removeOwnerTx = wallet.connect(owner3).removeOwner(owner1.address);
      await expect(removeOwnerTx).to.revertedWithCustomError(
        wallet,
        "OnlyWallet"
      );
    });

    it("Remove Owner Tx 12 : Failed : Does Not Exist Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("removeOwner", [
        notOwner.address,
      ]);

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(12);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(12);
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(owner3).executeTransaction(12);
      await expect(executeTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner3.address, 12);
    });

    it("Remove Owner Tx 13(success), 14 : Failed : Invalid Tx Requirement", async () => {
      const encodeData = wallet.interface.encodeFunctionData("removeOwner", [
        newOwner.address,
      ]);

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(13);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(13);
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(owner3).executeTransaction(13);
      await executeTx.wait(); // ownerCount 3

      const encodeData2 = wallet.interface.encodeFunctionData("removeOwner", [
        owner3.address,
      ]);

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
        data: encodeData2,
      };

      const submitTx2 = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx2.wait();

      const confirmTx2 = await wallet.connect(owner2).confirmTransaction(14);
      await confirmTx2.wait();

      const lastConfirmTx2 = await wallet
        .connect(owner3)
        .confirmTransaction(14);
      await lastConfirmTx2.wait();

      const executeTx2 = wallet.connect(owner3).executeTransaction(14);
      await expect(executeTx2)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(owner3.address, 14);
    });

    it("Change Owner Tx 15 : Success", async () => {
      const encodeData = wallet.interface.encodeFunctionData("changeOwner", [
        owner3.address,
        newOwner.address,
      ]);

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(15);
      await confirmTx.wait();

      const lastConfirmTx = await wallet.connect(owner3).confirmTransaction(15);
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(owner3).executeTransaction(15);
      await expect(executeTx)
        .to.emit(wallet, "OwnerRemoved")
        .withArgs(owner3.address);
      await expect(executeTx)
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

    it("Change Owner Tx 16 : Failed : Invalid Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("changeOwner", [
        newOwner.address,
        ZERO_ADDRESS,
      ]);

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
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
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(newOwner).executeTransaction(16);
      await expect(executeTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(newOwner.address, 16);
    });

    it("Change Owner Tx 17 : Failed : Does Not Exist Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("changeOwner", [
        notOwner.address,
        owner4.address,
      ]);

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
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
      await lastConfirmTx.wait();

      const executeTx = await wallet.connect(newOwner).executeTransaction(17);
      await expect(executeTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(newOwner.address, 17);

      const failedTx = await wallet.getTxById(17);
      expect(failedTx.executed).to.equal(false);
    });

    it("Change Owner Tx 18 : Failed : Already Exist Owner", async () => {
      const encodeData = wallet.interface.encodeFunctionData("changeOwner", [
        owner1.address,
        owner2.address,
      ]);

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(18);
      await confirmTx.wait();

      const lastConfirmTx = await wallet
        .connect(newOwner)
        .confirmTransaction(18);
      await lastConfirmTx.wait();

      const executeTx = wallet.connect(newOwner).executeTransaction(18);
      await expect(executeTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(newOwner.address, 18);
    });

    it("Change TxRequirement Tx 19 : Success", async () => {
      const encodeData = wallet.interface.encodeFunctionData(
        "changeTxRequirement",
        [2]
      );

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(19);
      await confirmTx.wait();

      const lastConfirmTx = await wallet
        .connect(newOwner)
        .confirmTransaction(19);
      await lastConfirmTx.wait();

      const executeTx = wallet.connect(newOwner).executeTransaction(19);
      await expect(executeTx)
        .to.emit(wallet, "ExecuteTransaction")
        .withArgs(newOwner.address, 19);
      await expect(executeTx)
        .to.emit(wallet, "TxRequirementChanged")
        .withArgs(2);
    });

    it("Change TxRequirement : Failed : OnlyWallet", async () => {
      const changeTxRequirementTx = wallet
        .connect(owner1)
        .changeTxRequirement(3);
      await expect(changeTxRequirementTx).to.revertedWithCustomError(
        wallet,
        "OnlyWallet"
      );
    });

    it("Change TxRequirement Tx 20 : Failed : Invalid TxRequirement", async () => {
      const encodeData = wallet.interface.encodeFunctionData(
        "changeTxRequirement",
        [4]
      );

      tx = {
        to: wallet.address,
        value: ethers.utils.parseEther("0"),
        data: encodeData,
      };

      const submitTx = await wallet
        .connect(owner1)
        .submitTransaction(tx.to, tx.value, tx.data);
      await submitTx.wait();

      const confirmTx = await wallet.connect(owner2).confirmTransaction(20);
      await confirmTx.wait();

      const lastConfirmTx = await wallet
        .connect(newOwner)
        .confirmTransaction(20);
      await lastConfirmTx.wait();

      const executeTx = wallet.connect(newOwner).executeTransaction(20);
      await expect(executeTx)
        .to.emit(wallet, "FailedTransaction")
        .withArgs(newOwner.address, 20);
    });
  });
});
