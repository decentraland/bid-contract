#! /bin/bash

BID=ERC721Bid.sol

OUTPUT=full

npx hardhat flatten contracts/bid/$BID > $OUTPUT/$BID