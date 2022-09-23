// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";

contract WalletNFT is ERC721Enumerable {
    using Counters for Counters.Counter;

    Counters.Counter private tokenIds;
    address public owner;

    constructor(
        string memory _name,
        string memory _symbol,
        address _owner
    ) ERC721(_name, _symbol) {
        owner = _owner;
    }

    function mint(address _to) public {
        require(msg.sender == owner);

        tokenIds.increment();
        uint256 tokenId = tokenIds.current();

        _safeMint(_to, tokenId);
    }
}
