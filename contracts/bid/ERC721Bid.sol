// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Address.sol";

import "../commons/Ownable.sol";
import "../commons/Pausable.sol";
import "../commons/ContextMixin.sol";
import "../commons/NativeMetaTransaction.sol";
import "./ERC721BidStorage.sol";


contract ERC721Bid is Ownable, Pausable, ERC721BidStorage, NativeMetaTransaction {
    using Address for address;

    /**
    * @dev Constructor of the contract.
    * @param _owner - owner
    * @param _feesCollector - fees collector
    * @param _manaToken - Address of the ERC20 accepted for this marketplace
    * @param _royaltiesManager - Royalties manager contract
    * @param _feesCollectorCutPerMillion - fees collector cut per million
    * @param _royaltiesCutPerMillion - royalties cut per million
    */
    constructor(
        address _owner,
        address _feesCollector,
        address _manaToken,
        IRoyaltiesManager _royaltiesManager,
        uint256 _feesCollectorCutPerMillion,
        uint256 _royaltiesCutPerMillion
    ) Pausable() {
         // EIP712 init
        _initializeEIP712('Decentraland Bid', '2');

        // Address init
        setFeesCollector(_feesCollector);
        setRoyaltiesManager(_royaltiesManager);

        // Fee init
        setFeesCollectorCutPerMillion(_feesCollectorCutPerMillion);
        setRoyaltiesCutPerMillion(_royaltiesCutPerMillion);

        manaToken = ERC20Interface(_manaToken);
        // Set owner
        transferOwnership(_owner);
    }

    /**
    * @dev Place a bid for an ERC721 token.
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _price - uint256 of the price for the bid
    * @param _duration - uint256 of the duration in seconds for the bid
    */
    function placeBid(
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _price,
        uint256 _duration
    )
        public
    {
        _placeBid(
            _tokenAddress,
            _tokenId,
            _price,
            _duration,
            ""
        );
    }

    /**
    * @dev Place a bid for an ERC721 token with fingerprint.
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _price - uint256 of the price for the bid
    * @param _duration - uint256 of the duration in seconds for the bid
    * @param _fingerprint - bytes of ERC721 token fingerprint
    */
    function placeBid(
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _price,
        uint256 _duration,
        bytes memory _fingerprint
    )
        public
    {
        _placeBid(
            _tokenAddress,
            _tokenId,
            _price,
            _duration,
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
    * @param _duration - uint256 of the duration in seconds for the bid
    * @param _fingerprint - bytes of ERC721 token fingerprint
    */
    function _placeBid(
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _price,
        uint256 _duration,
        bytes memory _fingerprint
    )
        private
        whenNotPaused()
    {
        _requireERC721(_tokenAddress);
        _requireComposableERC721(_tokenAddress, _tokenId, _fingerprint);
        address sender = _msgSender();

        require(_price > 0, "ERC721Bid#_placeBid: PRICE_MUST_BE_GT_0");

        _requireBidderBalance(sender, _price);

        require(
            _duration >= MIN_BID_DURATION,
            "ERC721Bid#_placeBid: DURATION_MUST_BE_GTE_MIN_BID_DURATION"
        );

        require(
            _duration <= MAX_BID_DURATION,
            "ERC721Bid#_placeBid: DURATION_MUST_BE_LTE_MAX_BID_DURATION"
        );

        ERC721Interface token = ERC721Interface(_tokenAddress);
        address tokenOwner = token.ownerOf(_tokenId);
        require(
            tokenOwner != address(0) && tokenOwner != sender,
            "ERC721Bid#_placeBid: ALREADY_OWNED_TOKEN"
        );

        uint256 expiresAt = block.timestamp + _duration;

        bytes32 bidId = keccak256(
            abi.encodePacked(
                block.timestamp,
                sender,
                _tokenAddress,
                _tokenId,
                _price,
                _duration,
                _fingerprint
            )
        );

        uint256 bidIndex;

        if (_bidderHasABid(_tokenAddress, _tokenId, sender)) {
            bytes32 oldBidId;
            (bidIndex, oldBidId,,,) = getBidByBidder(_tokenAddress, _tokenId, sender);

            // Delete old bid reference
            delete bidIndexByBidId[oldBidId];
        } else {
            // Use the bid counter to assign the index if there is not an active bid.
            bidIndex = bidCounterByToken[_tokenAddress][_tokenId];
            // Increase bid counter
            bidCounterByToken[_tokenAddress][_tokenId]++;
        }

        // Set bid references
        bidIdByTokenAndBidder[_tokenAddress][_tokenId][sender] = bidId;
        bidIndexByBidId[bidId] = bidIndex;

        // Save Bid
        bidsByToken[_tokenAddress][_tokenId][bidIndex] = Bid({
            id: bidId,
            bidder: sender,
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
            sender,
            _price,
            expiresAt,
            _fingerprint
        );
    }

    /**
    * @dev Used as the only way to accept a bid.
    * The token owner should send the token to this contract using safeTransferFrom.
    * The last parameter (bytes) should be the bid id.
    * @notice  The ERC721 smart contract calls this function on the recipient
    * after a `safetransfer`. This function MAY throw to revert and reject the
    * transfer. Return of other than the magic value MUST result in the
    * transaction being reverted.
    * Note:
    * Contract address is always the message sender.
    * This method should be seen as 'acceptBid'.
    * It validates that the bid id matches an active bid for the bid token.
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
            "ERC721Bid#onERC721Received: INVALID_BID"
        );

        address bidder = bid.bidder;
        uint256 price = bid.price;

        // Check fingerprint if necessary
        _requireComposableERC721(msg.sender, _tokenId, bid.fingerprint);

        // Check if bidder has funds
        _requireBidderBalance(bidder, price);

        // Delete bid references from contract storage
        delete bidsByToken[msg.sender][_tokenId][bidIndex];
        delete bidIndexByBidId[bidId];
        delete bidIdByTokenAndBidder[msg.sender][_tokenId][bidder];

        // Reset bid counter to invalidate other bids placed for the token
        delete bidCounterByToken[msg.sender][_tokenId];

        // Transfer token to bidder
        ERC721Interface(msg.sender).transferFrom(address(this), bidder, _tokenId);

        uint256 feesCollectorShareAmount;
        uint256 royaltiesShareAmount;
        address royaltiesReceiver;

        // Royalties share
        if (royaltiesCutPerMillion > 0) {
            royaltiesShareAmount = (price * royaltiesCutPerMillion) / ONE_MILLION;

            (bool success, bytes memory res) = address(royaltiesManager).staticcall(
                abi.encodeWithSelector(
                    royaltiesManager.getRoyaltiesReceiver.selector,
                    address(this),
                    _tokenId
                )
            );

            if (success) {
                (royaltiesReceiver) = abi.decode(res, (address));
                if (royaltiesReceiver != address(0)) {
                require(
                    manaToken.transferFrom(bidder, royaltiesReceiver, royaltiesShareAmount),
                    "ERC721Bid#onERC721Received: TRANSFER_FEES_TO_ROYALTIES_RECEIVER_FAILED"
                );
                }
            }
        }

        // Fees collector share
        {
            feesCollectorShareAmount = (price * feesCollectorCutPerMillion) / ONE_MILLION;
            uint256 totalFeeCollectorShareAmount = feesCollectorShareAmount;

            if (royaltiesShareAmount > 0 && royaltiesReceiver == address(0)) {
                totalFeeCollectorShareAmount += royaltiesShareAmount;
            }

            if (totalFeeCollectorShareAmount > 0) {
                require(
                    manaToken.transferFrom(bidder, feesCollector, totalFeeCollectorShareAmount),
                    "ERC721Bid#onERC721Received: TRANSFER_FEES_TO_FEES_COLLECTOR_FAILED"
                );
            }
        }

        // Transfer MANA from bidder to seller
        require(
            manaToken.transferFrom(bidder, _from, price - royaltiesShareAmount - feesCollectorShareAmount),
            "ERC721Bid#onERC721Received:: TRANSFER_AMOUNT_TO_TOKEN_OWNER_FAILED"
        );

        emit BidAccepted(
            bidId,
            msg.sender,
            _tokenId,
            bidder,
            _from,
            price,
            royaltiesShareAmount + feesCollectorShareAmount
        );

        return ERC721_Received;
    }

    /**
    * @dev Remove expired bids
    * @param _tokenAddresses - address[] of the ERC721 tokens
    * @param _tokenIds - uint256[] of the token ids
    * @param _bidders - address[] of the bidders
    */
    function removeExpiredBids(address[] memory _tokenAddresses, uint256[] memory _tokenIds, address[] memory _bidders)
    public
    {
        uint256 loopLength = _tokenAddresses.length;

        require(
            loopLength == _tokenIds.length && loopLength == _bidders.length ,
            "ERC721Bid#removeExpiredBids: LENGHT_MISMATCH"
        );

        for (uint256 i = 0; i < loopLength; i++) {
            _removeExpiredBid(_tokenAddresses[i], _tokenIds[i], _bidders[i]);
        }
    }

    /**
    * @dev Remove expired bid
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _bidder - address of the bidder
    */
    function _removeExpiredBid(address _tokenAddress, uint256 _tokenId, address _bidder)
    internal
    {
        (uint256 bidIndex, bytes32 bidId,,,uint256 expiresAt) = getBidByBidder(
            _tokenAddress,
            _tokenId,
            _bidder
        );

        require(expiresAt < block.timestamp, "ERC721Bid#_removeExpiredBid: BID_NOT_EXPIRED");

        _cancelBid(
            bidIndex,
            bidId,
            _tokenAddress,
            _tokenId,
            _bidder
        );
    }

    /**
    * @dev Cancel a bid for an ERC721 token
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    */
    function cancelBid(address _tokenAddress, uint256 _tokenId) public whenNotPaused() {
        address sender = _msgSender();
        // Get active bid
        (uint256 bidIndex, bytes32 bidId,,,) = getBidByBidder(
            _tokenAddress,
            _tokenId,
            sender
        );

        _cancelBid(
            bidIndex,
            bidId,
            _tokenAddress,
            _tokenId,
            sender
        );
    }

    /**
    * @dev Cancel a bid for an ERC721 token
    * @param _bidIndex - uint256 of the index of the bid
    * @param _bidId - bytes32 of the bid id
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _bidder - address of the bidder
    */
    function _cancelBid(
        uint256 _bidIndex,
        bytes32 _bidId,
        address _tokenAddress,
        uint256 _tokenId,
        address _bidder
    )
        internal
    {
        // Delete bid references
        delete bidIndexByBidId[_bidId];
        delete bidIdByTokenAndBidder[_tokenAddress][_tokenId][_bidder];

        // Check if the bid is at the end of the mapping
        uint256 lastBidIndex = bidCounterByToken[_tokenAddress][_tokenId] - 1;
        if (lastBidIndex != _bidIndex) {
            // Move last bid to the removed place
            Bid storage lastBid = bidsByToken[_tokenAddress][_tokenId][lastBidIndex];
            bidsByToken[_tokenAddress][_tokenId][_bidIndex] = lastBid;
            bidIndexByBidId[lastBid.id] = _bidIndex;
        }

        // Delete empty index
        delete bidsByToken[_tokenAddress][_tokenId][lastBidIndex];

        // Decrease bids counter
        bidCounterByToken[_tokenAddress][_tokenId]--;

        // emit BidCancelled event
        emit BidCancelled(
            _bidId,
            _tokenAddress,
            _tokenId,
            _bidder
        );
    }

     /**
    * @dev Check if the bidder has a bid for an specific token.
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _bidder - address of the bidder
    * @return bool whether the bidder has an active bid
    */
    function _bidderHasABid(address _tokenAddress, uint256 _tokenId, address _bidder)
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
    * @return bidIndex - uint256 of the bid index to be used within bidsByToken mapping
    * @return bidId - bytes32 of the bid id
    * @return bidder - address of the bidder address
    * @return price - uint256 of the bid price
    * @return expiresAt - uint256 of the expiration time
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
            revert("ERC721Bid#getBidByBidder: BIDDER_HAS_NOT_ACTIVE_BIDS_FOR_TOKEN");
        }
    }

    /**
    * @dev Get an ERC721 token bid by index
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _index - uint256 of the index
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
        require(_index < bidCounterByToken[_tokenAddress][_tokenId], "ERC721Bid#_getBid: INVALID_INDEX");
        return bidsByToken[_tokenAddress][_tokenId][_index];
    }

    /**
    * @dev Sets the share cut for the fees collector of the contract that's
    *  charged to the seller on a successful sale
    * @param _feesCollectorCutPerMillion - fees for the collector
    */
    function setFeesCollectorCutPerMillion(uint256 _feesCollectorCutPerMillion) public onlyOwner {
        feesCollectorCutPerMillion = _feesCollectorCutPerMillion;

        require(
            feesCollectorCutPerMillion + royaltiesCutPerMillion < 1000000,
            "ERC721Bid#setFeesCollectorCutPerMillion: TOTAL_FEES_MUST_BE_BETWEEN_0_AND_999999"
        );

        emit ChangedFeesCollectorCutPerMillion(feesCollectorCutPerMillion);
    }

    /**
    * @dev Sets the share cut for the royalties that's
    *  charged to the seller on a successful sale
    * @param _royaltiesCutPerMillion - fees for royalties
    */
    function setRoyaltiesCutPerMillion(uint256 _royaltiesCutPerMillion) public onlyOwner {
        royaltiesCutPerMillion = _royaltiesCutPerMillion;

        require(
            feesCollectorCutPerMillion + royaltiesCutPerMillion < 1000000,
            "ERC721Bid#setRoyaltiesCutPerMillion: TOTAL_FEES_MUST_BE_BETWEEN_0_AND_999999"
        );

        emit ChangedRoyaltiesCutPerMillion(royaltiesCutPerMillion);
    }

    /**
    * @notice Set the fees collector
    * @param _newFeesCollector - fees collector
    */
    function setFeesCollector(address _newFeesCollector) onlyOwner public {
        require(_newFeesCollector != address(0), "ERC721Bid#setFeesCollector: INVALID_FEES_COLLECTOR");

        emit FeesCollectorSet(feesCollector, _newFeesCollector);
        feesCollector = _newFeesCollector;
    }

    /**
    * @notice Set the royalties manager
    * @param _newRoyaltiesManager - royalties manager
    */
    function setRoyaltiesManager(IRoyaltiesManager _newRoyaltiesManager) onlyOwner public {
        require(address(_newRoyaltiesManager).isContract(), "ERC721Bid#setRoyaltiesManager: INVALID_ROYALTIES_MANAGER");


        emit RoyaltiesManagerSet(royaltiesManager, _newRoyaltiesManager);
        royaltiesManager = _newRoyaltiesManager;
    }

     /**
    * @dev Pause the contract
    */
    function pause() external onlyOwner {
        _pause();
    }

    /**
    * @dev Convert bytes to bytes32
    * @param _data - bytes
    * @return bytes32
    */
    function _bytesToBytes32(bytes memory _data) internal pure returns (bytes32) {
        require(_data.length == 32, "ERC721Bid#_bytesToBytes32: DATA_LENGHT_SHOULD_BE_32");

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
        require(_tokenAddress.isContract(), "ERC721Bid#_requireERC721: ADDRESS_NOT_A_CONTRACT");

        ERC721Interface token = ERC721Interface(_tokenAddress);
        require(
            token.supportsInterface(ERC721_Interface),
            "ERC721Bid#_requireERC721: INVALID_CONTRACT_IMPLEMENTATION"
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
                "ERC721Bid#_requireComposableERC721: INVALID_FINGERPRINT"
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
            "ERC721Bid#_requireBidderBalance: INSUFFICIENT_FUNDS"
        );
        require(
            manaToken.allowance(_bidder, address(this)) >= _amount,
            "ERC721Bid#_requireBidderBalance: CONTRACT_NOT_AUTHORIZED"
        );
    }
}
