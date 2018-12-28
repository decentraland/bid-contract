pragma solidity ^0.4.24;

// File: openzeppelin-solidity/contracts/ownership/Ownable.sol

/**
 * @title Ownable
 * @dev The Ownable contract has an owner address, and provides basic authorization control
 * functions, this simplifies the implementation of "user permissions".
 */
contract Ownable {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev The Ownable constructor sets the original `owner` of the contract to the sender
     * account.
     */
    constructor () internal {
        _owner = msg.sender;
        emit OwnershipTransferred(address(0), _owner);
    }

    /**
     * @return the address of the owner.
     */
    function owner() public view returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(isOwner());
        _;
    }

    /**
     * @return true if `msg.sender` is the owner of the contract.
     */
    function isOwner() public view returns (bool) {
        return msg.sender == _owner;
    }

    /**
     * @dev Allows the current owner to relinquish control of the contract.
     * @notice Renouncing to ownership will leave the contract without an owner.
     * It will not be possible to call the functions with the `onlyOwner`
     * modifier anymore.
     */
    function renounceOwnership() public onlyOwner {
        emit OwnershipTransferred(_owner, address(0));
        _owner = address(0);
    }

    /**
     * @dev Allows the current owner to transfer control of the contract to a newOwner.
     * @param newOwner The address to transfer ownership to.
     */
    function transferOwnership(address newOwner) public onlyOwner {
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers control of the contract to a newOwner.
     * @param newOwner The address to transfer ownership to.
     */
    function _transferOwnership(address newOwner) internal {
        require(newOwner != address(0));
        emit OwnershipTransferred(_owner, newOwner);
        _owner = newOwner;
    }
}

// File: contracts/bid/BidStorage.sol

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

// File: contracts/bid/Bid.sol

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
