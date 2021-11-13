// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "../bid/ERC721Bid.sol";


contract FakeBid is ERC721Bid {

    constructor(address _manaToken, address _owner, uint256 _ownerCutPerMillion) ERC721Bid(_manaToken, _owner, _ownerCutPerMillion) {}

    function placeBidWithFingerprint(
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _price,
        uint256 _duration,
        bytes memory _fingerprint
    )
      external
    {
        placeBid(
            _tokenAddress,
            _tokenId,
            _price,
            _duration,
            _fingerprint
        );
    }
}