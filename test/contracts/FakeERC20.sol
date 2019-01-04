pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";


contract FakeERC20 is ERC20 {
    function mint(uint256 amount, address beneficiary) public {
        _mint(beneficiary, amount);
    }
}