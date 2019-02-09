pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import "openzeppelin-solidity/contracts/lifecycle/Pausable.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "openzeppelin-solidity/contracts/utils/Address.sol";
import "./ERC721BidStorage.sol";


contract ERC721Bid is Ownable, Pausable, ERC721BidStorage {
    using SafeMath for uint256;
    using Address for address;

    /**
    * @dev Constructor of the contract.
    * @param _manaToken - address of the mana token
    * @param _owner - address of the owner for the contract
    */
    constructor(address _manaToken, address _owner) Ownable() Pausable() public {
        manaToken = ERC20Interface(_manaToken);
        // Set owner
        transferOwnership(_owner);
    }

    /**
    * @dev Place a bid for an ERC721 token.
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _price - uint256 of the price for the bid
    * @param _expiresIn - uint256 of the duration in seconds for the bid
    */
    function placeBid(
        address _tokenAddress, 
        uint256 _tokenId,
        uint256 _price,
        uint256 _expiresIn
    )
        public
    {
        _placeBid(
            _tokenAddress, 
            _tokenId,
            _price,
            _expiresIn,
            ""
        );
    }

    /**
    * @dev Place a bid for an ERC721 token with fingerprint.
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _price - uint256 of the price for the bid
    * @param _expiresIn - uint256 of the duration in seconds for the bid
    * @param _fingerprint - bytes of ERC721 token fingerprint 
    */
    function placeBid(
        address _tokenAddress, 
        uint256 _tokenId,
        uint256 _price,
        uint256 _expiresIn,
        bytes _fingerprint
    )
        public
    {
        _placeBid(
            _tokenAddress, 
            _tokenId,
            _price,
            _expiresIn,
            _fingerprint 
        );
    }

    /**
    * @dev Place a bid for an ERC721 token with fingerprint.
    * @notice Tokens can have multiple bids by different users.
    * Users can have only one bid per token.
    * If the user places a bid and has an active bid for that token,
    * the older one will be replaced with the new one.
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _price - uint256 of the price for the bid
    * @param _expiresIn - uint256 of the duration in seconds for the bid
    * @param _fingerprint - bytes of ERC721 token fingerprint 
    */
    function _placeBid(
        address _tokenAddress, 
        uint256 _tokenId,
        uint256 _price,
        uint256 _expiresIn,
        bytes memory _fingerprint
    )
        private
        whenNotPaused()
    {
        _requireERC721(_tokenAddress);
        _requireComposableERC721(_tokenAddress, _tokenId, _fingerprint);

        require(_price > 0, "Price should be bigger than 0");

        _requireBidderBalance(msg.sender, _price);       

        require(
            _expiresIn > MIN_BID_DURATION, 
            "The bid should be last longer than a minute"
        );

        require(
            _expiresIn <= MAX_BID_DURATION, 
            "The bid can not last longer than 6 months"
        );

        ERC721Interface token = ERC721Interface(_tokenAddress);
        address tokenOwner = token.ownerOf(_tokenId);
        require(
            tokenOwner != address(0) && tokenOwner != msg.sender,
            "The token should have an owner different from the sender"
        );

        uint256 expiresAt = block.timestamp.add(_expiresIn);

        bytes32 bidId = keccak256(
            abi.encodePacked(
                block.timestamp,
                msg.sender,
                _tokenAddress,
                _tokenId,
                _price,
                _expiresIn,
                _fingerprint
            )
        );

        uint256 bidIndex;

        if (_bidderHasAnActiveBid(_tokenAddress, _tokenId, msg.sender)) {
            (bidIndex,,,,) = getBidByBidder(_tokenAddress, _tokenId, msg.sender);
        } else {
            // Use the bid counter to assign the index if there is not an active bid. 
            bidIndex = bidCounterByToken[_tokenAddress][_tokenId];  
            // Increase bid counter 
            bidCounterByToken[_tokenAddress][_tokenId]++;
        }

        // Set bid references
        bidIdByTokenAndBidder[_tokenAddress][_tokenId][msg.sender] = bidId;
        bidIndexByBidId[bidId] = bidIndex;

        // Save Bid
        bidsByToken[_tokenAddress][_tokenId][bidIndex] = Bid({
            id: bidId,
            bidder: msg.sender,
            tokenAddress: _tokenAddress,
            tokenId: _tokenId,
            price: _price,
            expiresAt: expiresAt,
            fingerprint: _fingerprint
        });

        emit BidCreated(
            bidId,
            _tokenAddress,
            _tokenId,
            msg.sender,
            _price,
            expiresAt,
            _fingerprint     
        );
    }

    /**
    * @dev The ERC721 smart contract calls this function on the recipient
    * after a `safetransfer`. This function MAY throw to revert and reject the
    * transfer. Return of other than the magic value MUST result in the
    * transaction being reverted.
    * Note: 
    * @notice The contract address is always the message sender.
    * This method should be seen as 'acceptBid'.
    * It is the only way to accept a bid for an ERC721.
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
        whenNotPaused()
        returns (bytes4)
    {
        bytes32 bidId = _bytesToBytes32(_data);
        uint256 bidIndex = bidIndexByBidId[bidId];

        Bid memory bid = _getBid(msg.sender, _tokenId, bidIndex);

        // Check if the bid is valid.
        require(
            // solium-disable-next-line operator-whitespace
            bid.id == bidId &&
            bid.expiresAt >= block.timestamp, 
            "Invalid bid"
        );

        address bidder = bid.bidder;
        uint256 price = bid.price;
        
        // Check fingerprint if necessary
        _requireComposableERC721(msg.sender, _tokenId, bid.fingerprint);

        // Check if bidder has funds
        _requireBidderBalance(bidder, price);

        // Delete bid references from contract storage
        delete bidIndexByBidId[bidId];
        delete bidIdByTokenAndBidder[msg.sender][_tokenId][bidder];

        // Reset bid counter to invalidate other bids placed for the token
        delete bidCounterByToken[msg.sender][_tokenId];
        
        // Transfer token to bidder
        ERC721Interface(msg.sender).transferFrom(address(this), bidder, _tokenId);

        uint256 saleShareAmount = 0;
        if (ownerCutPerMillion > 0) {
            // Calculate sale share
            saleShareAmount = price.mul(ownerCutPerMillion).div(ONE_MILLION);
            // Transfer share amount to the bid conctract Owner
            require(
                manaToken.transferFrom(bidder, owner(), saleShareAmount),
                "Transfering the cut to the bid contract owner failed"
            );
        }

        // Transfer MANA from bidder to seller
        require(
            manaToken.transferFrom(bidder, _from, price.sub(saleShareAmount)),
            "Transfering MANA to owner failed"
        );
       
        emit BidAccepted(
            bidId,
            msg.sender,
            _tokenId,
            bidder,
            _from,
            price,
            saleShareAmount
        );

        return ERC721_Received;
    }

    /**
    * @dev Cancel a bid for an ERC721 token
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    */
    function cancelBid(address _tokenAddress, uint256 _tokenId) public whenNotPaused() {
        // Get active bid
        (uint256 bidIndex, bytes32 bidId,,,) = getBidByBidder(
            _tokenAddress, 
            _tokenId,
            msg.sender
        );


        // Delete bid references
        delete bidIndexByBidId[bidId];
        delete bidIdByTokenAndBidder[_tokenAddress][_tokenId][msg.sender];
        
        // Check if the bid is at the end of the mapping
        uint256 lastBidIndex = bidCounterByToken[_tokenAddress][_tokenId].sub(1);
        if (lastBidIndex != bidIndex) {
            // Move last bid to the removed place
            Bid storage lastBid = bidsByToken[_tokenAddress][_tokenId][lastBidIndex];
            bidsByToken[_tokenAddress][_tokenId][bidIndex] = lastBid;
        }
        
        // Delete empty index
        delete bidsByToken[_tokenAddress][_tokenId][lastBidIndex];

        // Decrease bids counter
        bidCounterByToken[_tokenAddress][_tokenId]--;

        // emit BidCancelled event
        emit BidCancelled(
            bidId,
            _tokenAddress,
            _tokenId,
            msg.sender
        );
    }

     /**
    * @dev Check if the bidder has an active bid for an specific token.
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _bidder - address of the bidder
    * @return bool whether the bidder has an active bid
    */
    function _bidderHasAnActiveBid(address _tokenAddress, uint256 _tokenId, address _bidder) 
        internal
        view 
        returns (bool)
    {
        bytes32 bidId = bidIdByTokenAndBidder[_tokenAddress][_tokenId][_bidder];
        uint256 bidIndex = bidIndexByBidId[bidId];
        // Bid index should be inside bounds
        if (bidIndex < bidCounterByToken[_tokenAddress][_tokenId]) {
            Bid memory bid = bidsByToken[_tokenAddress][_tokenId][bidIndex];
            return bid.bidder == _bidder;
        }
        return false;
    }

    /**
    * @dev Get the active bid id and index by a bidder and an specific token. 
    * @notice If the bidder has not a valid bid, the transaction will be reverted.
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _bidder - address of the bidder
    * @return uint256 of the bid index to be used within bidsByToken mapping
    * @return bytes32 of the bid id
    * @return address of the bidder address
    * @return uint256 of the bid price
    * @return uint256 of the expiration time
    */
    function getBidByBidder(address _tokenAddress, uint256 _tokenId, address _bidder) 
        public
        view 
        returns (
            uint256 bidIndex, 
            bytes32 bidId, 
            address bidder, 
            uint256 price, 
            uint256 expiresAt
        ) 
    {
        bidId = bidIdByTokenAndBidder[_tokenAddress][_tokenId][_bidder];
        bidIndex = bidIndexByBidId[bidId];
        (bidId, bidder, price, expiresAt) = getBidByToken(_tokenAddress, _tokenId, bidIndex);
        if (_bidder != bidder) {
            revert("Bidder has not an active bid for this token");
        }
    }

    /**
    * @dev Get an ERC721 token bid by index
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _index - uint256 of the index
    * @return uint256 of the bid index to be used within bidsByToken mapping
    * @return bytes32 of the bid id
    * @return address of the bidder address
    * @return uint256 of the bid price
    * @return uint256 of the expiration time
    */
    function getBidByToken(address _tokenAddress, uint256 _tokenId, uint256 _index) 
        public 
        view
        returns (bytes32, address, uint256, uint256) 
    {
        
        Bid memory bid = _getBid(_tokenAddress, _tokenId, _index);
        return (
            bid.id,
            bid.bidder,
            bid.price,
            bid.expiresAt
        );
    }

    /**
    * @dev Get the active bid id and index by a bidder and an specific token. 
    * @notice If the index is not valid, it will revert.
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the index
    * @param _index - uint256 of the index
    * @return Bid
    */
    function _getBid(address _tokenAddress, uint256 _tokenId, uint256 _index) 
        internal 
        view 
        returns (Bid memory)
    {
        require(_index < bidCounterByToken[_tokenAddress][_tokenId], "Invalid index");
        return bidsByToken[_tokenAddress][_tokenId][_index];
    }

    /**
    * @dev Sets the share cut for the owner of the contract that's
    * charged to the seller on a successful sale
    * @param _ownerCutPerMillion - Share amount, from 0 to 999,999
    */
    function setOwnerCutPerMillion(uint256 _ownerCutPerMillion) external onlyOwner {
        require(_ownerCutPerMillion < ONE_MILLION, "The owner cut should be between 0 and 999,999");

        ownerCutPerMillion = _ownerCutPerMillion;
        emit ChangedOwnerCutPerMillion(ownerCutPerMillion);
    }

    /**
    * @dev Convert bytes to bytes32
    * @param _data - bytes
    * @return bytes32
    */
    function _bytesToBytes32(bytes memory _data) internal pure returns (bytes32) {
        require(_data.length == 32, "The data should be 32 bytes length");

        bytes32 bidId;
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            bidId := mload(add(_data, 0x20))
        }
        return bidId;
    }

    /**
    * @dev Check if the token has a valid ERC721 implementation
    * @param _tokenAddress - address of the token
    */
    function _requireERC721(address _tokenAddress) internal view {
        require(_tokenAddress.isContract(), "Token should be a contract");

        ERC721Interface token = ERC721Interface(_tokenAddress);
        require(
            token.supportsInterface(ERC721_Interface),
            "Token has an invalid ERC721 implementation"
        );
    }

    /**
    * @dev Check if the token has a valid Composable ERC721 implementation
    * And its fingerprint is valid
    * @param _tokenAddress - address of the token
    * @param _tokenId - uint256 of the index
    * @param _fingerprint - bytes of the fingerprint
    */
    function _requireComposableERC721(
        address _tokenAddress,
        uint256 _tokenId,
        bytes memory _fingerprint
    )
        internal
        view
    {
        ERC721Verifiable composableToken = ERC721Verifiable(_tokenAddress);
        if (composableToken.supportsInterface(ERC721Composable_ValidateFingerprint)) {
            require(
                composableToken.verifyFingerprint(_tokenId, _fingerprint),
                "Token fingerprint is not valid"
            );
        }
    }

    /**
    * @dev Check if the bidder has balance and the contract has enough allowance
    * to use bidder MANA on his belhalf
    * @param _bidder - address of bidder
    * @param _amount - uint256 of amount
    */
    function _requireBidderBalance(address _bidder, uint256 _amount) internal view {
        require(
            manaToken.balanceOf(_bidder) >= _amount,
            "Insufficient funds"
        );
        require(
            manaToken.allowance(_bidder, address(this)) >= _amount,
            "The contract is not authorized to use MANA on bidder behalf"
        );        
    }
}
