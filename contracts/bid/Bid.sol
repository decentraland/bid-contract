pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "./BidStorage.sol";


contract Bid is Ownable, BidStorage {
    /**
    * @dev Constructor of the contract.
    */
    constructor() Ownable() public {}

    function placeBid(
        address _tokenAddress, 
        uint256 _tokenId,
        uint256 _price,
        uint256 _expiresIn
    )
        external
    {
        _placeBid(
            _tokenAddress, 
            _tokenId,
            _price,
            _expiresIn,
            ""
        );
    }

    function placeBid(
        address _tokenAddress, 
        uint256 _tokenId,
        uint256 _price,
        uint256 _expiresIn,
        bytes _fingerPrint
    )
        external
    {
        _placeBid(
            _tokenAddress, 
            _tokenId,
            _price,
            _expiresIn,
            _fingerPrint 
        );
    }

    function _placeBid(
        address _tokenAddress, 
        uint256 _tokenId,
        uint256 _price,
        uint256 _expiresIn,
        bytes memory _fingerPrint
    )
        internal
    {
        bytes32 bidId = keccak256(
            abi.encodePacked(
                block.timestamp,
                msg.sender,
                _tokenAddress,
                _tokenId,
                _price,
                _expiresIn,
                _fingerPrint
            )
        );

        bidIndexByBidId[bidId] = bidsByToken[_tokenAddress][_tokenId].length;
        bidIdByBidder[_tokenAddress][_tokenId][msg.sender] = bidId;
        bidsByToken[_tokenAddress][_tokenId].push(
            Bid({
                id: bidId,
                bidder: msg.sender,
                tokenAddress: _tokenAddress,
                tokenId: _tokenId,
                price: _price,
                // TODO: use safeMath
                expiresAt: block.timestamp + _expiresIn,
                fingerPrint: _fingerPrint
            })
        );

        // emit BidCreated
    }

    /**
    * @notice Handle the receipt of an NFT
    * @dev The ERC721 smart contract calls this function on the recipient
    * after a `safetransfer`. This function MAY throw to revert and reject the
    * transfer. Return of other than the magic value MUST result in the
    * transaction being reverted.
    * Note: the contract address is always the message sender.
    * @param _from The address which previously owned the token
    * @param _tokenId The NFT identifier which is being transferred
    * @param _data Additional data with no specified format
    * @return `bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"))`
    */
    function onERC721Received(
        address _from,
        address /*_to*/,
        uint256 _tokenId,
        bytes memory _data
    )
        public
        returns (bytes4)
    {
        bytes32 bidId = bytesToBytes32(_data);
        uint256 bidIndex = bidIndexByBidId[bidId];

        // Sender is the token contract
        Bid storage bid = bidsByToken[msg.sender][_tokenId][bidIndex];
        
        ERC721Interface(bid.tokenAddress).transferFrom(address(this), bid.bidder, _tokenId);
        
        require(
            manaToken.transferFrom(bid.bidder, _from, bid.price),
            "Transfer MANA to owner failed"
        );
       
        delete bidIndexByBidId[bidId];
        delete bidIdByBidder[msg.sender][_tokenId][bid.bidder];
        delete bidsByToken[msg.sender][_tokenId];

        // emit BidAccepted event

        return ERC721_Received;
    }

    function cancelBid(address _tokenAddress, uint256 _tokenId) public {
        bytes32 bidId = bidIdByBidder[_tokenAddress][_tokenId][msg.sender];
        uint256 bidIndex = bidIndexByBidId[bidId];

        delete bidIndexByBidId[bidId];
        delete bidIdByBidder[_tokenAddress][_tokenId][msg.sender];

        // TODO: use safeMath
        uint256 lastBidIndex = bidsByToken[_tokenAddress][_tokenId].length - 1;

        Bid storage lastBid = bidsByToken[_tokenAddress][_tokenId][lastBidIndex];
        bidsByToken[_tokenAddress][_tokenId][bidIndex] = lastBid;
        
        // Remove last element 
        bidsByToken[_tokenAddress][_tokenId].length--;

        // emit BidCancelled event
    }

    function bytesToBytes32(bytes memory _data) internal pure returns (bytes32) {
        require(_data.length == 32, "Data should be 32 bytes length");

        bytes32 bidId;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            bidId := mload(add(_data, 0x20))
        }
        return bidId;
    }




}
