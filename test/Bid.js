import { assertRevert } from 'openzeppelin-eth/test/helpers/assertRevert'
import { increaseTime, duration } from './helpers/increaseTime'

const BigNumber = web3.BigNumber
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const BidContract = artifacts.require('FakeBid')
const erc20 = artifacts.require('FakeERC20')
const Token = artifacts.require('Token')
const ComposableToken = artifacts.require('ComposableToken')
const TokenWithoutInterface = artifacts.require('TokenWithoutInterface')

function assertEvent(log, expectedEventName, expectedArgs) {
  const { event, args } = log
  event.should.be.eq(expectedEventName)

  if (expectedArgs) {
    for (let key in expectedArgs) {
      let value = args[key]
      if (value instanceof BigNumber) {
        value = value.toString()
      }
      value.should.be.equal(expectedArgs[key], `[assertEvent] ${key}`)
    }
  }
}

function getBlock(blockNumber = 'latest') {
  return web3.eth.getBlock(blockNumber)
}

async function getEvents(contract, eventName) {
  return new Promise((resolve, reject) => {
    contract[eventName]().get(function(err, logs) {
      if (err) reject(new Error(`Error fetching the ${eventName} events`))
      resolve(logs)
    })
  })
}

contract('Bid', function([
  _,
  owner,
  holder,
  bidder,
  anotherBidder,
  oneMoreBidder,
  bidderWithoutFunds,
  hacker
]) {
  let bidContract
  let mana
  let token
  let composableToken
  let tokenWithoutInterface

  const fromOwner = { from: owner }
  const fromHolder = { from: holder }
  const fromBidder = { from: bidder }
  const fromAnotherBidder = { from: anotherBidder }
  const fromOneMoreBidder = { from: oneMoreBidder }
  const fromBidderWithoutFunds = { from: bidderWithoutFunds }
  const fromHacker = { from: hacker }
  const tokenOne = '1'
  const tokenTwo = '2'
  const unownedToken = '100'
  const price = web3.toWei(100, 'ether').toString()
  const initialBalance = web3.toWei(10000, 'ether')

  const creationParams = {
    ...fromOwner,
    gas: 6e6,
    gasPrice: 21e9
  }

  async function placeAndCheckBid(
    tokenId,
    bidder,
    price,
    expectedCounter,
    expetectedIndex
  ) {
    const blockTime = (await getBlock()).timestamp
    await bidContract.placeBid(token.address, tokenId, price, blockTime, {
      from: bidder
    })
    let bidCounter = await bidContract.bidCounterByToken(token.address, tokenId)
    bidCounter.should.be.bignumber.equal(expectedCounter)
    let bidData = await bidContract.getBidByToken(
      token.address,
      tokenId,
      expetectedIndex
    )
    bidData[1].should.be.equal(bidder)
    bidData[2].should.be.bignumber.equal(price)
  }

  async function placeMultipleBidsAndCheck(
    tokenId,
    bidders,
    expectedCounters,
    expectedIndexes
  ) {
    for (let i = 0; i < bidders.length; i++) {
      const [bidder, expectedCounter, expectedIndex] = [
        bidders[i],
        expectedCounters[i],
        expectedIndexes[i]
      ]
      await placeAndCheckBid(
        tokenId,
        bidder,
        price,
        expectedCounter,
        expectedIndex
      )
    }
  }

  beforeEach(async function() {
    // Create tokens
    mana = await erc20.new(creationParams)
    token = await Token.new(creationParams)
    composableToken = await ComposableToken.new(creationParams)
    tokenWithoutInterface = await TokenWithoutInterface.new(creationParams)
    bidContract = await BidContract.new(mana.address, creationParams)

    mana.mint(initialBalance, bidder)
    mana.mint(initialBalance, anotherBidder)
    mana.mint(initialBalance, oneMoreBidder)

    token.mint(holder, tokenOne)
    token.mint(holder, tokenTwo)

    composableToken.mint(holder, tokenOne)
    composableToken.mint(holder, tokenTwo)

    mana.approve(bidContract.address, initialBalance, fromBidder)
    mana.approve(bidContract.address, initialBalance, fromAnotherBidder)
    mana.approve(bidContract.address, initialBalance, fromOneMoreBidder)
  })

  describe('Place bids', function() {
    it('should bid an erc721 token', async function() {
      const blockTime = (await getBlock()).timestamp
      const { logs } = await bidContract.placeBid(
        token.address,
        tokenOne,
        price,
        blockTime,
        fromBidder
      )

      const [
        bidId,
        bidBidder,
        bidPrice,
        expiresAt
      ] = await bidContract.getBidByToken(token.address, tokenOne, 0)

      bidPrice.toString().should.be.equal(price)
      bidBidder.should.be.equal(bidder)

      logs.length.should.be.equal(1)
      assertEvent(logs[0], 'BidCreated', {
        _id: bidId,
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: bidder,
        _price: price,
        _expiresAt: expiresAt.toString(),
        _fingerprint: '0x'
      })
    })

    it('should bid a composable erc721 token', async function() {
      const blockTime = (await getBlock()).timestamp
      const fingerprint = await composableToken.getFingerprint(tokenOne)
      const { logs } = await bidContract.placeBidWithFingerprint(
        composableToken.address,
        tokenOne,
        price,
        blockTime,
        fingerprint,
        fromBidder
      )

      const [
        bidId,
        bidBidder,
        bidPrice,
        expiresAt
      ] = await bidContract.getBidByToken(composableToken.address, tokenOne, 0)

      bidPrice.toString().should.be.equal(price)
      bidBidder.should.be.equal(bidder)

      logs.length.should.be.equal(1)
      assertEvent(logs[0], 'BidCreated', {
        _id: bidId,
        _tokenAddress: composableToken.address,
        _tokenId: tokenOne,
        _bidder: bidder,
        _price: price,
        _expiresAt: expiresAt.toString(),
        _fingerprint: fingerprint
      })
    })

    it('should increment bid counter', async function() {
      await placeAndCheckBid(tokenOne, bidder, price, 1, 0)
      await placeAndCheckBid(tokenOne, anotherBidder, price, 2, 1)
    })

    it('should re-use bid slot when bidder bid and previously has an active bid', async function() {
      await placeAndCheckBid(tokenOne, bidder, price, 1, 0)

      const newPrice = parseInt(price) + parseInt(web3.toWei(10, 'ether'))
      await placeAndCheckBid(tokenOne, bidder, newPrice, 1, 0)

      await placeAndCheckBid(tokenOne, anotherBidder, price, 2, 1)

      await placeAndCheckBid(tokenOne, bidder, price, 2, 0)

      await placeAndCheckBid(tokenOne, oneMoreBidder, price, 3, 2)

      await placeAndCheckBid(tokenOne, bidder, newPrice, 3, 0)

      await placeAndCheckBid(tokenTwo, anotherBidder, price, 1, 0)
      await placeAndCheckBid(tokenTwo, bidder, price, 2, 1)
    })

    it('should bid an erc721 token with fingerprint', async function() {
      const blockTime = (await getBlock()).timestamp
      const fingerprint = await composableToken.getFingerprint(tokenOne)
      await bidContract.placeBidWithFingerprint(
        token.address,
        tokenOne,
        price,
        blockTime,
        fingerprint,
        fromBidder
      )
    })

    it('reverts when bidding a composable erc721 token with changed fingerprint', async function() {
      const blockTime = (await getBlock()).timestamp
      const fingerprint = await composableToken.getFingerprint(tokenTwo)
      await assertRevert(
        bidContract.placeBidWithFingerprint(
          composableToken.address,
          tokenOne,
          price,
          blockTime,
          fingerprint,
          fromBidder
        ),
        'Token fingerprint is not valid'
      )
    })

    it('reverts when bidding an erc721 token with different interface', async function() {
      const blockTime = (await getBlock()).timestamp
      await assertRevert(
        bidContract.placeBid(
          tokenWithoutInterface.address,
          tokenOne,
          price,
          blockTime,
          fromBidder
        ),
        'Token has an invalid ERC721 implementation'
      )
    })

    it('reverts when bidding an address', async function() {
      const blockTime = (await getBlock()).timestamp
      await assertRevert(
        bidContract.placeBid(bidder, tokenOne, price, blockTime, fromBidder),
        'Token should be a contract'
      )
    })

    it('reverts when bidder has not funds', async function() {
      const blockTime = (await getBlock()).timestamp
      await assertRevert(
        bidContract.placeBid(
          token.address,
          tokenOne,
          price,
          blockTime,
          fromBidderWithoutFunds
        ),
        'Insufficient funds'
      )
    })

    it('reverts when bidder did not authorize bid contract on his behalf', async function() {
      const blockTime = (await getBlock()).timestamp
      await assertRevert(
        bidContract.placeBid(
          token.address,
          tokenOne,
          price,
          blockTime,
          fromHolder
        ),
        'The contract is not authorized to use MANA on bidder behalf'
      )
    })

    it('reverts when bid with 0', async function() {
      const blockTime = (await getBlock()).timestamp
      await assertRevert(
        bidContract.placeBid(token.address, tokenOne, 0, blockTime, fromBidder),
        'Price should be bigger than 0'
      )
    })

    it('reverts when bid expires in one minute or less', async function() {
      const oneMinuteInSeconds = duration.minutes(1)
      await assertRevert(
        bidContract.placeBid(
          token.address,
          tokenOne,
          price,
          oneMinuteInSeconds,
          fromBidder
        ),
        'Bid should be more than 1 minute in the future'
      )
    })

    it('reverts when bid an unowned token', async function() {
      const blockTime = (await getBlock()).timestamp
      await assertRevert(
        bidContract.placeBid(
          token.address,
          unownedToken,
          price,
          blockTime,
          fromBidder
        ),
        'Token should have an owner'
      )
    })
  })

  describe('Cancel Bids', function() {
    beforeEach(async function() {
      const blockTime = (await getBlock()).timestamp
      await bidContract.placeBid(
        token.address,
        tokenOne,
        price,
        blockTime,
        fromBidder
      )
    })
    it('should cancel bid', async function() {
      const [bidId] = await bidContract.getBidByToken(
        token.address,
        tokenOne,
        0
      )

      let bidCounter = await bidContract.bidCounterByToken(
        token.address,
        tokenOne
      )
      bidCounter.should.be.bignumber.equal(1)

      const { logs } = await bidContract.cancelBid(
        token.address,
        tokenOne,
        fromBidder
      )
      logs.length.should.be.equal(1)

      assertEvent(logs[0], 'BidCancelled', {
        _id: bidId,
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: bidder
      })

      bidCounter = await bidContract.bidCounterByToken(token.address, tokenOne)
      bidCounter.should.be.bignumber.equal(0)
    })

    it('should cancel bid in the middle', async function() {
      await placeMultipleBidsAndCheck(
        tokenOne,
        [bidder, anotherBidder, oneMoreBidder],
        [1, 2, 3],
        [0, 1, 2]
      )

      await bidContract.cancelBid(token.address, tokenOne, fromAnotherBidder)

      const bidCounter = await bidContract.bidCounterByToken(
        token.address,
        tokenOne
      )
      bidCounter.should.be.bignumber.equal(2)

      let bidData = await bidContract.getBidByToken(token.address, tokenOne, 0)
      bidData[1].should.be.equal(bidder)
      bidData[2].should.be.bignumber.equal(price)

      bidData = await bidContract.getBidByToken(token.address, tokenOne, 1)
      bidData[1].should.be.equal(oneMoreBidder)
      bidData[2].should.be.bignumber.equal(price)
    })

    it('reverts when cancel invalid bid', async function() {
      await assertRevert(
        bidContract.cancelBid(token.address, tokenOne, fromAnotherBidder),
        'Bidder has not an active bid for this token'
      )
    })

    it('reverts when cancelling by hacker', async function() {
      await assertRevert(
        bidContract.cancelBid(token.address, tokenOne, fromHacker),
        'Bidder has not an active bid for this token'
      )
    })
  })

  describe('Accept Bids', function() {
    beforeEach(async function() {
      const blockTime = (await getBlock()).timestamp
      await bidContract.placeBid(
        token.address,
        tokenOne,
        price,
        blockTime,
        fromBidder
      )

      const fingerprint = await composableToken.getFingerprint(tokenOne)
      await bidContract.placeBidWithFingerprint(
        composableToken.address,
        tokenOne,
        price,
        blockTime,
        fingerprint,
        fromBidder
      )
    })

    it('should accept a bid for an ERC721', async function() {
      let holderBalance = await mana.balanceOf(holder)
      holderBalance.should.be.bignumber.equal(0)

      let bidderBalance = await mana.balanceOf(bidder)
      bidderBalance.should.be.bignumber.equal(initialBalance)

      let ownerOfTokenOne = await token.ownerOf(tokenOne)
      ownerOfTokenOne.should.be.equal(holder)

      const [bidId] = await bidContract.getBidByToken(
        token.address,
        tokenOne,
        0
      )
      await token.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenOne,
        bidId,
        fromHolder
      )

      const logs = await getEvents(bidContract, 'BidAccepted')

      logs.length.should.be.equal(1)
      assertEvent(logs[0], 'BidAccepted', {
        _id: bidId,
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: bidder,
        _buyer: holder,
        _totalPrice: price
      })

      holderBalance = await mana.balanceOf(holder)
      holderBalance.should.be.bignumber.equal(price)

      bidderBalance = await mana.balanceOf(bidder)
      bidderBalance.should.be.bignumber.equal(initialBalance - price)

      ownerOfTokenOne = await token.ownerOf(tokenOne)
      ownerOfTokenOne.should.be.equal(bidder)
    })

    it('should accept a bid for a composable ERC721', async function() {
      let holderBalance = await mana.balanceOf(holder)
      holderBalance.should.be.bignumber.equal(0)

      let bidderBalance = await mana.balanceOf(bidder)
      bidderBalance.should.be.bignumber.equal(initialBalance)

      let ownerOfTokenOne = await composableToken.ownerOf(tokenOne)
      ownerOfTokenOne.should.be.equal(holder)

      const [bidId] = await bidContract.getBidByToken(
        composableToken.address,
        tokenOne,
        0
      )
      await composableToken.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenOne,
        bidId,
        fromHolder
      )

      const logs = await getEvents(bidContract, 'BidAccepted')

      logs.length.should.be.equal(1)
      assertEvent(logs[0], 'BidAccepted', {
        _id: bidId,
        _tokenAddress: composableToken.address,
        _tokenId: tokenOne,
        _bidder: bidder,
        _buyer: holder,
        _totalPrice: price
      })

      holderBalance = await mana.balanceOf(holder)
      holderBalance.should.be.bignumber.equal(price)

      bidderBalance = await mana.balanceOf(bidder)
      bidderBalance.should.be.bignumber.equal(initialBalance - price)

      ownerOfTokenOne = await composableToken.ownerOf(tokenOne)
      ownerOfTokenOne.should.be.equal(bidder)
    })

    it('reverts when accepting invalid tokenId', async function() {
      const [bidId] = await bidContract.getBidByToken(
        token.address,
        tokenOne,
        0
      )
      await assertRevert(
        token.safeTransferFromWithBytes(
          holder,
          bidContract.address,
          tokenTwo,
          bidId,
          fromHolder
        )
      )
    })

    it('reverts when accepting invalid bidId', async function() {
      const [bidId] = await bidContract.getBidByToken(
        token.address,
        tokenOne,
        0
      )

      await bidContract.cancelBid(token.address, tokenOne, fromBidder)

      await assertRevert(
        token.safeTransferFromWithBytes(
          holder,
          bidContract.address,
          tokenOne,
          bidId,
          fromHolder
        )
      )
    })

    it('reverts when accepting with insufficient funds', async function() {
      const [bidId] = await bidContract.getBidByToken(
        token.address,
        tokenOne,
        0
      )

      await mana.transfer(holder, initialBalance, fromBidder)

      await assertRevert(
        token.safeTransferFromWithBytes(
          holder,
          bidContract.address,
          tokenOne,
          bidId,
          fromHolder
        )
      )
    })

    it('reverts when accepting without approved contract', async function() {
      const [bidId] = await bidContract.getBidByToken(
        token.address,
        tokenOne,
        0
      )

      await mana.approve(bidContract.address, 0, fromBidder)

      await assertRevert(
        token.safeTransferFromWithBytes(
          holder,
          bidContract.address,
          tokenOne,
          bidId,
          fromHolder
        )
      )
    })

    it('reverts when accepting bid for another token with the same index and id', async function() {
      const [bidId] = await bidContract.getBidByToken(
        composableToken.address,
        tokenOne,
        0
      )

      await assertRevert(
        token.safeTransferFromWithBytes(
          holder,
          bidContract.address,
          tokenOne,
          bidId,
          fromHolder
        )
      )
    })

    it.skip('reverts when accepting with fingerprint changed', async function() {
      const [bidId] = await bidContract.getBidByToken(
        token.address,
        tokenOne,
        0
      )
      await assertRevert(
        token.safeTransferFromWithBytes(
          holder,
          bidContract.address,
          tokenTwo,
          bidId,
          fromHolder
        )
      )
    })
  })
})
