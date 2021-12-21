// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../bid/ERC721Bid.sol";


contract FakeBid is ERC721Bid {

    constructor(
        address _owner,
        address _feesCollector,
        address _manaToken,
        IRoyaltiesManager _royaltiesManager,
        uint256 _feesCollectorCutPerMillion,
        uint256 _royaltiesCutPerMillion
    ) ERC721Bid(
        _owner,
        _feesCollector,
        _manaToken,
        _royaltiesManager,
        _feesCollectorCutPerMillion,
        _royaltiesCutPerMillion
    ) {}

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