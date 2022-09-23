// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WalletFT is ERC20 {
    constructor(uint256 _amount) ERC20("WalletFT", "WFT") {
        _mint(msg.sender, _amount);
    }
}
