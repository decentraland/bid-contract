pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";


contract ComposableToken is ERC721 {
    bytes4 public constant ERC721Composable_ValidateFingerprint = 0x8f9f4b63;
    bytes4 public constant ERC721_Interface = 0x80ac58cd;

    constructor() ERC721() public {}

    function mint(address _to, uint256 _id) external {
        return super._mint(_to, _id);
    }

    function verifyFingerprint(
        uint256 _tokenId,
        bytes memory _fingerprint
    )
        public
        pure
        returns (bool)
    {
        return getFingerprint(_tokenId) == _bytesToBytes32(_fingerprint);
    }

    function getFingerprint(uint256 _tokenId) public pure returns (bytes32) {
        return bytes32(_tokenId);
    }

    function _bytesToBytes32(bytes memory _data) internal pure returns (bytes32) {
        require(_data.length == 32, "Data should be 32 bytes length");

        bytes32 bidId;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            bidId := mload(add(_data, 0x20))
        }
        return bidId;
    }

    function supportsInterface(bytes4 _interfaceId) external view returns (bool) {
        return _interfaceId == ERC721Composable_ValidateFingerprint ||
        _interfaceId == ERC721_Interface;
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