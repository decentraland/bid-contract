#! /bin/bash

BID=Bid.sol

OUTPUT=full

npx truffle-flattener contracts/bid/$BID > $OUTPUT/$BID