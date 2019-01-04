pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721.sol";


contract TokenWithoutInterface is ERC721 {
    constructor() ERC721() public {}

    function mint(address _to, uint256 _id) external {
        return super._mint(_to, _id);
    }

    function supportsInterface(bytes4) external view returns (bool) {
        return false;
    }    
}