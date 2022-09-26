// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {IMultisigWallet3} from "./IMultisigWallet3.sol";

contract MultisigWallet3 is IMultisigWallet3, IERC721Receiver, IERC1155Receiver {
    using Counters for Counters.Counter;
    using EnumerableSet for EnumerableSet.AddressSet;

    /*
     *  Storage
     */
    Counters.Counter private txIds;
    EnumerableSet.AddressSet private owners;
    mapping(uint256 => Transaction) private transactions;
    mapping(uint256 => EnumerableSet.AddressSet) private confirmOwnerOfTx;
    MaxRequirementType private maxRequirementType;
    uint256 private txRequirement;

    /*
     *  Modifier
     */
    modifier onlyOwner() {
        if (!isOwner(msg.sender)) {
            revert OnlyOwner();
        }
        _;
    }

    modifier onlyWallet() {
        if (msg.sender != address(this)) {
            revert OnlyWallet();
        }
        _;
    }

    modifier txExists(uint256 _txId) {
        if (!isExistTx(_txId)) {
            revert DoesNotExistTx();
        }
        _;
    }

    modifier notExecuted(uint256 _txId) {
        if (transactions[_txId].executed) {
            revert AlreadyExecutedTx();
        }
        _;
    }

    /*
     *  constructor
     */
    constructor(address[] memory _owners) {
        if (_owners.length < 3) {
            revert InvalidOwnerCount();
        }

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];

            if (owner == address(0)) {
                revert InvalidOwner();
            }

            owners.add(owner);
        }

        maxRequirementType = MaxRequirementType.Under; // default maxRequirementType
        txRequirement = _owners.length - 1; // default txRequirement (3 - 1)
        txIds.increment(); // set txId 1
    }

    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    /*
     *  Owner Func
     */
    function submitTransaction(
        address _to,
        uint256 _value,
        bytes memory _data
    ) public onlyOwner {
        if (_to == address(0)) {
            revert InvalidArgument();
        }

        uint256 txId = txIds.current();
        txIds.increment();

        transactions[txId] = Transaction({
            id: txId,
            to: _to,
            value: _value,
            executed: false,
            data: _data
        });

        confirmOwnerOfTx[txId].add(msg.sender);

        emit SubmitTransaction(msg.sender, txId, _to, _value, _data);
        emit ConfirmTransaction(msg.sender, txId);
    }

    function confirmTransaction(uint256 _txId)
        public
        onlyOwner
        txExists(_txId)
        notExecuted(_txId)
    {
        if (isConfirmedByOwner(_txId, msg.sender)) {
            revert AlreadyConfirmedTx();
        }

        confirmOwnerOfTx[_txId].add(msg.sender);

        emit ConfirmTransaction(msg.sender, _txId);

        if (isConfirmedTx(_txId)) {
            _executeTransaction(_txId);
        }
    }

    function revokeConfirmation(uint256 _txId)
        public
        onlyOwner
        txExists(_txId)
        notExecuted(_txId)
    {
        if (!isConfirmedByOwner(_txId, msg.sender)) {
            revert DoesNotConfirmedTx();
        }

        confirmOwnerOfTx[_txId].remove(msg.sender);

        emit RevokeConfirmation(msg.sender, _txId);
    }

    function _executeTransaction(uint256 _txId) private {
        Transaction storage transaction = transactions[_txId];

        transaction.executed = true;

        (bool success, ) = transaction.to.call{value: transaction.value}(
            transaction.data
        );

        if (success) {
            emit ExecuteTransaction(msg.sender, _txId);
        } else {
            transaction.executed = false;
            emit FailedTransaction(msg.sender, _txId);
        }
    }

    /*
     *  Wallet Func
     */
    function addOwner(address _owner) public onlyWallet {
        if (_owner == address(0)) {
            revert InvalidOwner();
        }

        if (isOwner(_owner)) {
            revert AlreadyExistOwner();
        }

        owners.add(_owner);
        emit OwnerAdded(_owner);
    }

    function removeOwner(address _owner) public onlyWallet {
        if (
            !_isValidTxRequirement(
                maxRequirementType,
                txRequirement,
                getOwnerCount() - 1
            )
        ) {
            revert InvalidTxRequirement();
        }

        if (!isOwner(_owner)) {
            revert DoesNotExistOwner();
        }

        owners.remove(_owner);
        emit OwnerRemoved(_owner);
    }

    function changeOwner(address _owner, address _newOwner) public onlyWallet {
        if (_newOwner == address(0)) {
            revert InvalidOwner();
        }

        if (!isOwner(_owner)) {
            revert DoesNotExistOwner();
        }

        if (isOwner(_newOwner)) {
            revert AlreadyExistOwner();
        }

        owners.remove(_owner);
        owners.add(_newOwner);

        emit OwnerRemoved(_owner);
        emit OwnerAdded(_newOwner);
    }

    function changeTxRequirement(
        MaxRequirementType _maxRequirementType,
        uint256 _txRequirement
    ) public onlyWallet {
        if (
            !_isValidTxRequirement(
                _maxRequirementType,
                _txRequirement,
                getOwnerCount()
            )
        ) {
            revert InvalidTxRequirement();
        }

        maxRequirementType = _maxRequirementType;
        txRequirement = _txRequirement;
        emit TxRequirementChanged(_maxRequirementType, _txRequirement);
    }

    /*
     *  Read Func
     */

    function isOwner(address _owner) public view returns (bool) {
        return owners.contains(_owner);
    }

    function getOwnerCount() public view returns (uint256) {
        return owners.length();
    }

    function getOwners() external view returns (address[] memory) {
        return owners.values();
    }

    function isExistTx(uint256 _txId) public view returns (bool) {
        return _txId <= txIds.current() && transactions[_txId].to != address(0);
    }

    function getTxCount() public view returns (uint256) {
        return txIds.current() - 1;
    }

    function getTxs(
        uint256 _start,
        uint256 _limit,
        bool _pending,
        bool _executed
    ) external view returns (Transaction[] memory) {
        if (_start == 0) {
            revert InvalidArgument();
        }

        Transaction[] memory txs = new Transaction[](_limit);

        uint256 txCount;

        for (uint256 i = _start; i <= getTxCount(); i++) {
            bool executed = transactions[i].executed;

            if ((_pending && !executed) || (_executed && executed)) {
                txs[txCount] = transactions[i];
                txCount += 1;
            }

            if (txCount == _limit) {
                return txs;
            }
        }

        Transaction[] memory newTxs = new Transaction[](txCount);

        for (uint256 i = 0; i < txCount; i++) {
            newTxs[i] = txs[i];
        }

        return newTxs;
    }

    function getTxById(uint256 _txId)
        external
        view
        returns (Transaction memory)
    {
        if (!isExistTx(_txId)) {
            revert DoesNotExistTx();
        }

        return transactions[_txId];
    }

    function isConfirmedTx(uint256 _txId) public view returns (bool) {
        return getConfirmCount(_txId) >= txRequirement;
    }

    function isConfirmedByOwner(uint256 _txId, address _owner)
        public
        view
        returns (bool)
    {
        return confirmOwnerOfTx[_txId].contains(_owner);
    }

    function getConfirmCount(uint256 _txId) public view returns (uint256) {
        return confirmOwnerOfTx[_txId].length();
    }

    function getConfirmOwnerOfTx(uint256 _txId)
        external
        view
        returns (address[] memory)
    {
        if (!isExistTx(_txId)) {
            revert DoesNotExistTx();
        }

        return confirmOwnerOfTx[_txId].values();
    }

    function getMaxRequirementType()
        external
        view
        returns (MaxRequirementType)
    {
        return maxRequirementType;
    }

    function getTxRequirement() external view returns (uint256) {
        return txRequirement;
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function _isValidTxRequirement(
        MaxRequirementType _maxRequirementType,
        uint256 _txRequirement,
        uint256 _ownerCount
    ) private pure returns (bool) {
        if (_txRequirement == 0) {
            return false;
        }

        if (_maxRequirementType == MaxRequirementType.Under) {
            if (_ownerCount <= _txRequirement) {
                return false;
            }
        } else {
            if (_ownerCount < _txRequirement) {
                return false;
            }
        }

        return true;
    }

    /*
     *  Receiver
     */
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function supportsInterface(bytes4 interfaceId)
        external
        pure
        override
        returns (bool)
    {
        return
            interfaceId == type(IERC1155Receiver).interfaceId ||
            interfaceId == type(IERC721Receiver).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }
}
