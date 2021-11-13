// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

contract RoyaltiesManager {

  address[] public beneficiaries;

  constructor(address[]  memory _beneficiaries) {
    beneficiaries = _beneficiaries;
  }

  function getRoyaltiesReceiver(address _contractAddress, uint256 _tokenId) external view returns(address royaltiesReceiver) {
    if (_tokenId == 0) {
      return beneficiaries[0];
    } if (_tokenId == 1) {
      return beneficiaries[1];
    } if (_tokenId == 2) {
      return address(0);
    } else {
      revert();
    }
  }
}
