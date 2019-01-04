pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";


contract Token is ERC721 {
    constructor() ERC721() public {}

    function mint(address to, uint256 id) external {
        return super._mint(to, id);
    }

    function safeTransferFromWithBytes(
        address from,
        address to,
        uint256 tokenId,
        bytes _data
     )
     public 
     {
        super.safeTransferFrom(
            from,
            to, 
            tokenId,
            _data
        );
    }
}