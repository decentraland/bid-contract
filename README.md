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
contract bidStorage {
}

contract Bid is Ownable {

}
```
