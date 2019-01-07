pragma solidity ^0.4.24;

import "../../contracts/bid/ERC721Bid.sol";


contract FakeBid is ERC721Bid {
    
    constructor(address _manaToken, address _owner) public ERC721Bid(_manaToken, _owner) {}

    function placeBidWithFingerprint(
        address _tokenAddress, 
        uint256 _tokenId,
        uint256 _price,
        uint256 _expiresIn,
        bytes _fingerprint
    )
      external 
    {
        placeBid( 
            _tokenAddress, 
            _tokenId,
            _price,
            _expiresIn,
            _fingerprint 
        );
    }
}