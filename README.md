# Smart contract for bidding ERC721 tokens

Bid contract for ERC721 tokens

## How it works

- Bidders should approve the Bid Contract to operate MANA on their behalf.
- Bids are placed on-chain calling `bid(tokenAddress, tokenId, price, expiresIn)` or `bid(tokenAddress, tokenId, price, expiresIn, fingerPrint)` for composable tokens.
- Bids can be placed for published & unpublished tokens.
- Bids can be cancelled.
- A token can have multiple bids, but _only one_ per address.
- If the token owner wants to accept a bid, he should transfer the token to the Bid Contract using `safeTransferFrom(owner, bid_contract, tokenId, bidId)`.
  Once the Bid Contract receives the token (onERC721Received) it will check if the bid is valid and will transfer the MANA from the bidder to the token owner
  and the token from the Bid Contract to the bidder.
- Fees, if present, are going to be payed by the bidder
- The bid will remain invalid if:
  - Expired.
  - A bid for the same token is accepted.
  - Fingerprint changed (Only Composable tokens).
- If the token has an active publication in the Decentraland Marketplace when a bid is accepted, the order will become invalid because the owner changed.

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

    // Bid id by token address => token id => bid index => bid
    mapping(address => mapping(uint256 => mapping(uint256 => Bid))) internal bidsByToken;
    // Bid id by token address => token id => bid counts
    mapping(address => mapping(uint256 => uint256)) public bidCounterByToken;
    // Index of the bid at bidsByToken mapping
    mapping(bytes32 => uint256) public bidIndexByBidId;
    // Bid id by token address => token id => bidder address => bidId
    mapping(address => mapping(uint256 => mapping(address => bytes32))) public bidByTokenAndBidder;


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
      address indexed _buyer,
      uint256 _totalPrice
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

}
```
