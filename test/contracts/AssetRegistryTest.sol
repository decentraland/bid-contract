pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";


contract AssetRegistryTest is ERC721 {
    constructor() ERC721() public {}

    function mint(address to, uint256 id) external {
        return super._mint(to, id);
    }

    // EstateRegistry methods

    function transferLand(
        uint256 /*estateId*/,
        uint256 tokenId,
        address destinatary
    )
        public
    {
        return transferFrom(msg.sender, destinatary, tokenId);
    }

    function transferManyLands(
        uint256 estateId,
        uint256[] tokenIds,
        address destinatary
    )
    external
    {
        uint length = tokenIds.length;
        for (uint i = 0; i < length; i++) {
            transferLand(estateId, tokenIds[i], destinatary);
        }
    }

    function safeTransferManyFrom(address from, address to, uint256[] tokenIds) public {
        uint length = tokenIds.length;
        for (uint i = 0; i < length; i++) {
            transferFrom(from, to, tokenIds[i]);
        }
    }

    function bar() external pure { }
}