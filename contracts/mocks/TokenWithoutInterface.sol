// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";


contract TokenWithoutInterface is ERC721 {
    constructor() ERC721("name", "symbol") {}

    function mint(address _to, uint256 _id) external {
        return super._mint(_to, _id);
    }

    function supportsInterface(bytes4) public override pure returns (bool) {
        return false;
    }
}