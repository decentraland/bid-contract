# Smart contract for bidding ERC721 tokens

Bid contract for ERC721 tokens

## How it works

- Bidders should approve the Bid Contract to operate MANA on their behalf.
- Bids are placed on-chain calling `bid(tokenAddress, tokenId, price, duration)` or `bid(tokenAddress, tokenId, price, duration, fingerPrint)` for composable tokens.
- Bids can be placed for published & unpublished tokens.
- Bids can be cancelled.
- A token can have multiple bids, but _only one_ per address.
- If the token owner wants to accept a bid, he should transfer the token to the Bid Contract using `safeTransferFrom(owner, bid_contract, tokenId, bidId)`.
  Once the Bid Contract receives the token (onERC721Received) it will check if the bid is valid and will transfer the MANA from the bidder to the token owner
  and the token from the Bid Contract to the bidder.
- Fees, if present, are going to be deducted by the bid price.
- The bid will remain invalid if:
  - Expired.
  - A bid for the same token is accepted.
  - Fingerprint changed (Only Composable tokens).
- If the token has an active publication in the Decentraland Marketplace when a bid is accepted, the order will become invalid because the owner changed.
- If the contract is paused, place, cancel and accept bids can not be performed.

# Contract Interface

```solidity
contract ERC721BidStorage {
    uint256 public constant MIN_BID_DURATION = 1 minutes;
    uint256 public constant MAX_BID_DURATION = 24 weeks;
    uint256 public constant ONE_MILLION = 1000000;
    bytes4 public constant ERC721_Interface = 0x80ac58cd;
    bytes4 public constant ERC721_Received = 0x150b7a02;
    bytes4 public constant ERC721Composable_ValidateFingerprint = 0x8f9f4b63;

    struct Bid {
        // Bid Id
        bytes32 id;
        // Bidder address
        address bidder;
        // ERC721 address
        address tokenAddress;
        // ERC721 token id
        uint256 tokenId;
        // Price for the bid in wei
        uint256 price;
        // Time when this bid ends
        uint256 expiresAt;
        // Fingerprint for composable
        bytes fingerprint;
    }

    // MANA token
    ERC20Interface public manaToken;

    // Bid by token address => token id => bid index => bid
    mapping(address => mapping(uint256 => mapping(uint256 => Bid))) internal bidsByToken;
    // Bid count by token address => token id => bid counts
    mapping(address => mapping(uint256 => uint256)) public bidCounterByToken;
    // Index of the bid at bidsByToken mapping by bid id => bid index
    mapping(bytes32 => uint256) public bidIndexByBidId;
    // Bid id by token address => token id => bidder address => bidId
    mapping(address => mapping(uint256 => mapping(address => bytes32)))
    public
    bidIdByTokenAndBidder;

    uint256 public ownerCutPerMillion;

    // EVENTS
    event BidCreated(
      bytes32 _id,
      address indexed _tokenAddress,
      uint256 indexed _tokenId,
      address indexed _bidder,
      uint256 _price,
      uint256 _expiresAt,
      bytes _fingerprint
    );

    event BidAccepted(
      bytes32 _id,
      address indexed _tokenAddress,
      uint256 indexed _tokenId,
      address _bidder,
      address indexed _seller,
      uint256 _price
    );

    event BidCancelled(
      bytes32 _id,
      address indexed _tokenAddress,
      uint256 indexed _tokenId,
      address indexed _bidder
    );

    event ChangedOwnerCutPerMillion(uint256 _ownerCutPerMillion);
}

contract Bid is Ownable {
   /**
    * @dev Constructor of the contract.
    * @param _manaToken - address of the mana token
    * @param _owner - address of the owner for the contract
    */
    constructor(address _manaToken, address _owner) Ownable() Pausable() public;

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
        public;

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
        bytes _fingerprint
    )
        public;

    /**
    * @dev Place a bid for an ERC721 token with fingerprint.
    * @notice Tokens can have multiple bids by different users.
    * Users can have only one bid per token.
    * If the user place a bid and has an active bid for that token,
    * the old bid will be replaced with the new one.
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
        whenNotPaused();

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
        returns (bytes4);

    /**
    * @dev Remove expired bids
    * @param _tokenAddresses - address[] of the ERC721 tokens
    * @param _tokenIds - uint256[] of the token ids
    * @param _bidders - address[] of the bidders
    */
    function removeExpiredBids(address[] _tokenAddresses, uint256[] _tokenIds, address[] _bidders)
    public;

    /**
    * @dev Remove expired bid
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    * @param _bidder - address of the bidder
    */
    function _removeExpiredBid(address _tokenAddress, uint256 _tokenId, address _bidder)
    internal;

    /**
    * @dev Cancel a bid for an ERC721 token
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the token id
    */
    function cancelBid(address _tokenAddress, uint256 _tokenId) public whenNotPaused();

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
        internal ;

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
        returns (bool);

    /**
    * @dev Get the active bid id and index by a bidder and an specific token.
    * @notice If the bidder has not a valid bid, it will revert.
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
        );

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
        returns (bytes32, address, uint256, uint256);

    /**
    * @dev Get the active bid id and index by a bidder and an specific token.
    * @notice If the index is not valid, it will revert.
    * @param _tokenAddress - address of the ERC721 token
    * @param _tokenId - uint256 of the index
    * @param _index - address of the bidder
    * @return Bid
    */
    function _getBid(address _tokenAddress, uint256 _tokenId, uint256 _index)
        internal
        view
        returns (Bid memory);

    /**
    * @dev Sets the share cut for the owner of the contract that's
    * charged to the seller on a successful sale
    * @param _ownerCutPerMillion - Share amount, from 0 to 999,999
    */
    function setOwnerCutPerMillion(uint256 _ownerCutPerMillion) external onlyOwner;

    /**
    * @dev Convert bytes to bytes32
    * @param _data - bytes
    * @return bytes32
    */
    function _bytesToBytes32(bytes memory _data) internal pure returns (bytes32);

    /**
    * @dev Check if the token has a valid ERC721 implementation
    * @param _tokenAddress - address of the token
    */
    function _requireERC721(address _tokenAddress) internal view;

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
        view;

    /**
    * @dev Check if the bidder has balance and the contract has enough allowance
    * to use bidder MANA on his belhalf
    * @param _bidder - address of bidder
    * @param _amount - uint256 of amount
    */
    function _requireBidderBalance(address _bidder, uint256 _amount) internal view;
}
```
