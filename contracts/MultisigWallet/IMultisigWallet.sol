// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IMultisigWallet {
    /*
     *  Event
     */
    event Deposit(address indexed sender, uint256 amount, uint256 balance);
    event SubmitTransaction(
        address indexed owner,
        uint256 indexed txId,
        address indexed to,
        uint256 value,
        bytes data
    );
    event ConfirmTransaction(address indexed owner, uint256 indexed txId);
    event RevokeConfirmation(address indexed owner, uint256 indexed txId);
    event ExecuteTransaction(address indexed owner, uint256 indexed txId);
    event FailedTransaction(address indexed owner, uint256 indexed txId);
    event OwnerAdded(address indexed owner);
    event OwnerRemoved(address indexed owner);
    event TxRequirementChanged(uint256 txRequirement);

    /*
     *  Error
     */
    error OnlyOwner();
    error OnlyWallet();
    error DoesNotExistTx();
    error AlreadyExecutedTx();
    error AlreadyConfirmedTx();
    error AlreadyExistOwner();
    error DoesNotExistOwner();
    error CanNotExecuteTx();
    error DoesNotConfirmedTx();
    error InvalidOwner();
    error InvalidOwnerCount();
    error InvalidTxRequirement();
    error InvalidArgument();

    /*
     *  Struct
     */
    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
    }

    /*
     *  Owner Func
     */
    function submitTransaction(
        address _to,
        uint256 _value,
        bytes memory _data
    ) external;

    function confirmTransaction(uint256 _txId) external;

    function executeTransaction(uint256 _txId) external;

    function revokeConfirmation(uint256 _txId) external;

    /*
     *  Wallet Func
     */
    function addOwner(address _owner) external;

    function removeOwner(address _owner) external;

    function changeOwner(address _owner, address _newOwner) external;

    function changeTxRequirement(uint256 _txRequirement) external;

    /*
     *  Read Func
     */

    function isOwner(address _owner) external view returns (bool);

    function getOwnerCount() external view returns (uint256);

    function getOwners() external view returns (address[] memory);

    function isExistTx(uint256 _txId) external view returns (bool);

    function getTxCount() external view returns (uint256);

    function getTxs(
        uint256 _start,
        uint256 _limit,
        bool _pending,
        bool _executed
    ) external view returns (Transaction[] memory);

    function getTxById(uint256 _txId)
        external
        view
        returns (Transaction memory);

    function isConfirmedTx(uint256 _txId) external view returns (bool);

    function isConfirmedByOwner(uint256 _txId, address _owner)
        external
        view
        returns (bool);

    function getConfirmCount(uint256 _txId) external view returns (uint256);

    function getConfirmOwnerOfTx(uint256 _txId)
        external
        view
        returns (address[] memory);

    function getTxRequirement() external view returns (uint256);

    function getBalance() external view returns (uint256);
}
