// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract FakeERC20 is ERC20 {
    constructor() ERC20("name", "symbol") {}

    function mint(uint256 amount, address beneficiary) public {
        _mint(beneficiary, amount);
    }
}