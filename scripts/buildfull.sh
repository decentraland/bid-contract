#! /bin/bash

BID=ERC721Bid.sol

OUTPUT=full

npx truffle-flattener contracts/bid/$BID > $OUTPUT/$BID