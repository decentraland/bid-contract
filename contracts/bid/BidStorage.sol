pragma solidity ^0.4.24;


/**
 * @title Interface for contracts conforming to ERC-20
 */
contract ERC20Interface {
    function transferFrom(address from, address to, uint tokens) public returns (bool success);
}


/**
 * @title Interface for contracts conforming to ERC-721
 */
contract ERC721Interface {
    // function ownerOf(uint256 _tokenId) public view returns (address _owner);
    // function approve(address _to, uint256 _tokenId) public;
    // function getApproved(uint256 _tokenId) public view returns (address);
    // function isApprovedForAll(address _owner, address _operator) public view returns (bool);
    function transferFrom(address _from, address _to, uint256 _tokenId) public;
    function supportsInterface(bytes4) public view returns (bool);
}


contract ERC721Verifiable is ERC721Interface {
    function verifyFingerprint(uint256, bytes memory) public view returns (bool);
}


contract BidStorage {
    bytes4 public constant ERC721_Interface = 0x80ac58cd;
    bytes4 public constant ERC721_Received = 0x150b7a02;
    bytes4 public constant ERC721Composable_ValidateFingerprint = 0x8f9f4b63;
    ERC20Interface public constant manaToken = 
    ERC20Interface(0x0F5D2fB29fb7d3CFeE444a200298f468908cC942);

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
        bytes fingerPrint;
    }

    // Bid by token address => token id => bid index
    mapping(address => mapping(uint256 => Bid[])) public bidsByToken;
    // Index of the bid of the bidsByToken mapping
    mapping(bytes32 => uint256) public bidIndexByBidId;
    // Bid id by token address => token id => bidder address
    mapping(address => mapping(uint256 => mapping(address => bytes32))) public bidIdByBidder;

    uint256 public ownerCutPerMillion;
    uint256 public publicationFeePerMillion;

    // EVENTS
    event BidCreated(
      bytes32 id,
      address tokenAddress,
      uint256 indexed tokenId,
      address indexed bidder,
      uint256 priceInWei,
      uint256 expiresAt
    );
    
    event BidAccepted(
      bytes32 id,
      uint256 indexed tokenId,
      address indexed bidder,
      address tokenAddress,
      uint256 totalPrice,
      address indexed buyer
    );

    event BidCancelled(
      bytes32 id,
      uint256 indexed tokenId,
      address indexed bidder,
      address tokenAddress
    );

    event ChangedPublicationFee(uint256 publicationFeePerMillion);
    event ChangedOwnerCutPerMillion(uint256 ownerCutPerMillion);
}
