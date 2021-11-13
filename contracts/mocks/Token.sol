// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import "./ERC721.sol";
import "../commons/ContextMixin.sol";
import "../commons/NativeMetaTransaction.sol";

contract Token is ERC721Initializable, NativeMetaTransaction {
    constructor() {
        _initERC721("name", "symbol");
        _initializeEIP712('Decentraland Token', '1');
    }

    function mint(address to, uint256 id) external {
        return super._mint(to, id);
    }

    function safeTransferFromWithBytes(
        address from,
        address to,
        uint256 tokenId,
        bytes memory _data
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