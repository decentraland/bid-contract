import assertRevert from './helpers/assertRevert'
import { increaseTime, duration } from './helpers/increaseTime'
import { sendMetaTx } from './helpers/metaTx'

const BigNumber = web3.BigNumber
require('chai')
  .use(require('chai-as-promised'))
  .use(require('chai-bignumber')(BigNumber))
  .should()

const BN = web3.utils.BN
const expect = require('chai').use(require('bn-chai')(BN)).expect

const RoyaltiesManager = artifacts.require('RoyaltiesManager')
const BidContract = artifacts.require('FakeBid')
const erc20 = artifacts.require('FakeERC20')
const Token = artifacts.require('Token')
const ComposableToken = artifacts.require('ComposableToken')
const TokenWithoutInterface = artifacts.require('TokenWithoutInterface')

function assertEvent(log, expectedEventName, expectedArgs) {
  const { event, args } = log
  expect(event).to.be.equal(expectedEventName)

  if (expectedArgs) {
    for (let key in expectedArgs) {
      let value = args[key]
      if (web3.utils.isBN(value)) {
        expect(value).to.be.eq.BN(expectedArgs[key], `[assertEvent] ${key}`)
        continue
      }
      expect(value).to.be.equal(expectedArgs[key], `[assertEvent] ${key}`)
    }
  }
}

async function getEvents(contract, eventName) {
  return new Promise((resolve, reject) => {
    contract.getPastEvents(eventName, function(err, logs) {
      if (err) reject(new Error(`Error fetching the ${eventName} events`))
      resolve(logs)
    })
  })
}

function scientificToDecimal(num) {
  //if the number is in scientific notation remove it
  if (/\d+\.?\d*e[+-]*\d+/i.test(num)) {
    var zero = '0',
      parts = String(num)
        .toLowerCase()
        .split('e'), //split into coeff and exponent
      e = parts.pop(), //store the exponential part
      l = Math.abs(e), //get the number of zeros
      sign = e / l,
      coeff_array = parts[0].split('.')
    if (sign === -1) {
      coeff_array[0] = Math.abs(coeff_array[0])
      num = '-' + zero + '.' + new Array(l).join(zero) + coeff_array.join('')
    } else {
      var dec = coeff_array[1]
      if (dec) l = l - dec.length
      num = coeff_array.join('') + new Array(l + 1).join(zero)
    }
  }

  return num
}

contract('Bid', function([
  _,
  owner,
  holder,
  bidder,
  anotherBidder,
  oneMoreBidder,
  bidderWithoutFunds,
  relayer,
  feesCollector,
  itemCreator,
  itemBeneficiary,
  hacker
]) {
  let bidContract
  let royaltiesManager
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
  const price = web3.utils.toBN(web3.utils.toWei('100', 'ether'))
  const newPrice = web3.utils.toBN(web3.utils.toWei('10', 'ether'))
  const initialBalance = web3.utils.toBN(web3.utils.toWei('10000', 'ether'))
  const twoWeeksInSeconds = duration.weeks(2)
  const moreThanSixMonthInSeconds = duration.weeks(26) + duration.seconds(1)
  const domain = 'Decentraland Bid'
  const version = '2'

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
    await bidContract.placeBid(
      token.address,
      tokenId,
      price,
      twoWeeksInSeconds,
      {
        from: bidder
      }
    )
    let bidCounter = await bidContract.bidCounterByToken(token.address, tokenId)

    expect(bidCounter).to.be.eq.BN(expectedCounter)

    let bidData = await bidContract.getBidByToken(
      token.address,
      tokenId,
      expetectedIndex
    )
    expect(bidData[1]).to.be.equal(bidder)
    expect(bidData[2]).to.be.eq.BN(price)
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

    royaltiesManager = await RoyaltiesManager.new(
      [itemCreator, itemBeneficiary],
      {
        from: owner
      }
    )

    bidContract = await BidContract.new(
      owner,
      feesCollector,
      mana.address,
      royaltiesManager.address,
      0,
      0,
      creationParams
    )

    await mana.mint(initialBalance, bidder)
    await mana.mint(initialBalance, anotherBidder)
    await mana.mint(initialBalance, oneMoreBidder)

    await token.mint(holder, tokenOne)
    await token.mint(holder, tokenTwo)

    await composableToken.mint(holder, tokenOne)
    await composableToken.mint(holder, tokenTwo)

    await mana.approve(bidContract.address, initialBalance, fromBidder)
    await mana.approve(bidContract.address, initialBalance, fromAnotherBidder)
    await mana.approve(bidContract.address, initialBalance, fromOneMoreBidder)
  })

  describe('Place bids', function() {
    it('should bid an erc721 token', async function() {
      const { logs } = await bidContract.placeBid(
        token.address,
        tokenOne,
        price,
        twoWeeksInSeconds,
        fromBidder
      )

      const bidData = await bidContract.getBidByToken(
        token.address,
        tokenOne,
        0
      )

      expect(bidData[1]).to.be.equal(bidder)
      expect(bidData[2]).to.be.eq.BN(price)

      expect(logs.length).to.be.equal(1)

      assertEvent(logs[0], 'BidCreated', {
        _id: bidData[0],
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: bidder,
        _price: price,
        _expiresAt: bidData[3].toString(),
        _fingerprint: null
      })
    })

    it('should bid an erc721 token :: Relayed EIP721', async function() {
      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: '_tokenAddress',
              type: 'address'
            },
            {
              internalType: 'uint256',
              name: '_tokenId',
              type: 'uint256'
            },
            {
              internalType: 'uint256',
              name: '_price',
              type: 'uint256'
            },
            {
              internalType: 'uint256',
              name: '_duration',
              type: 'uint256'
            }
          ],
          name: 'placeBid',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function'
        },
        [token.address, tokenOne, price, twoWeeksInSeconds]
      )

      const { logs } = await sendMetaTx(
        bidContract,
        functionSignature,
        bidder,
        relayer,
        null,
        domain,
        version
      )

      const bidData = await bidContract.getBidByToken(
        token.address,
        tokenOne,
        0
      )

      expect(bidData[1]).to.be.equal(bidder)
      expect(bidData[2]).to.be.eq.BN(price)

      expect(logs.length).to.be.equal(2)

      assertEvent(logs[1], 'BidCreated', {
        _id: bidData[0],
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: bidder,
        _price: price,
        _expiresAt: bidData[3].toString(),
        _fingerprint: null
      })
    })

    it('should bid a composable erc721 token', async function() {
      const fingerprint = await composableToken.getFingerprint(tokenOne)
      const { logs } = await bidContract.placeBidWithFingerprint(
        composableToken.address,
        tokenOne,
        price,
        twoWeeksInSeconds,
        fingerprint,
        fromBidder
      )

      const bidData = await bidContract.getBidByToken(
        composableToken.address,
        tokenOne,
        0
      )

      expect(bidData[1]).to.be.equal(bidder)
      expect(bidData[2]).to.be.eq.BN(price)

      expect(logs.length).to.be.equal(1)
      assertEvent(logs[0], 'BidCreated', {
        _id: bidData[0],
        _tokenAddress: composableToken.address,
        _tokenId: tokenOne,
        _bidder: bidder,
        _price: price,
        _expiresAt: bidData[3].toString(),
        _fingerprint: fingerprint
      })
    })

    it('should increment bid counter', async function() {
      await placeAndCheckBid(
        tokenOne,
        bidder,
        price,
        web3.utils.toBN(web3.utils.toBN(1)),
        web3.utils.toBN(0)
      )
      await placeAndCheckBid(
        tokenOne,
        anotherBidder,
        price,
        web3.utils.toBN(2),
        web3.utils.toBN(web3.utils.toBN(1))
      )
    })

    it('should re-use bid slot when bidder bid and previously has an active bid', async function() {
      await placeAndCheckBid(tokenOne, bidder, price, 1, 0)

      await placeAndCheckBid(tokenOne, bidder, newPrice, 1, 0)

      await placeAndCheckBid(tokenOne, anotherBidder, price, 2, 1)

      await placeAndCheckBid(tokenOne, bidder, price, 2, 0)

      await placeAndCheckBid(tokenOne, oneMoreBidder, price, 3, 2)

      await placeAndCheckBid(tokenOne, bidder, newPrice, 3, 0)

      await placeAndCheckBid(tokenTwo, anotherBidder, price, 1, 0)
      await placeAndCheckBid(tokenTwo, bidder, price, 2, 1)
    })

    it('should clean old bid reference when reusing bid slot', async function() {
      await placeAndCheckBid(
        tokenOne,
        bidder,
        price,
        web3.utils.toBN(web3.utils.toBN(1)),
        web3.utils.toBN(0)
      )
      await placeAndCheckBid(
        tokenOne,
        anotherBidder,
        price,
        web3.utils.toBN(2),
        web3.utils.toBN(web3.utils.toBN(1))
      )
      let bid = await bidContract.getBidByToken(token.address, tokenOne, 1)
      let bidIndex = await bidContract.bidIndexByBidId(bid[0])
      expect(bidIndex).to.be.eq.BN(web3.utils.toBN(web3.utils.toBN(1)))

      await placeAndCheckBid(tokenOne, anotherBidder, newPrice, 2, 1)

      bidIndex = await bidContract.bidIndexByBidId(bid[0])
      expect(bidIndex).to.be.eq.BN(web3.utils.toBN(0))

      bid = await bidContract.getBidByToken(token.address, tokenOne, 1)
      bidIndex = await bidContract.bidIndexByBidId(bid[0])
      expect(bidIndex).to.be.eq.BN(web3.utils.toBN(web3.utils.toBN(1)))
    })

    it('should bid an erc721 token with fingerprint', async function() {
      const fingerprint = await composableToken.getFingerprint(tokenOne)
      await bidContract.placeBidWithFingerprint(
        token.address,
        tokenOne,
        price,
        twoWeeksInSeconds,
        fingerprint,
        fromBidder
      )
    })

    it('reverts when bidding a composable erc721 token whithout fingerprint', async function() {
      await assertRevert(
        bidContract.placeBid(
          composableToken.address,
          tokenOne,
          price,
          twoWeeksInSeconds,
          fromBidder
        )
      )
    })

    it('reverts when bidding a composable erc721 token with changed fingerprint', async function() {
      const fingerprint = await composableToken.getFingerprint(tokenTwo)
      await assertRevert(
        bidContract.placeBidWithFingerprint(
          composableToken.address,
          tokenOne,
          price,
          twoWeeksInSeconds,
          fingerprint,
          fromBidder
        ),
        'Token fingerprint is not valid'
      )
    })

    it('reverts when bidding an erc721 token with different interface', async function() {
      await assertRevert(
        bidContract.placeBid(
          tokenWithoutInterface.address,
          tokenOne,
          price,
          twoWeeksInSeconds,
          fromBidder
        ),
        'Token has an invalid ERC721 implementation'
      )
    })

    it('reverts when bidding an address', async function() {
      await assertRevert(
        bidContract.placeBid(
          bidder,
          tokenOne,
          price,
          twoWeeksInSeconds,
          fromBidder
        ),
        'Token should be a contract'
      )
    })

    it('reverts when bidder has not funds', async function() {
      await assertRevert(
        bidContract.placeBid(
          token.address,
          tokenOne,
          price,
          twoWeeksInSeconds,
          fromBidderWithoutFunds
        ),
        'Insufficient funds'
      )
    })

    it('reverts when bidder did not authorize bid contract on his behalf', async function() {
      await mana.approve(bidContract.address, 0, fromBidder)
      await assertRevert(
        bidContract.placeBid(
          token.address,
          tokenOne,
          price,
          twoWeeksInSeconds,
          fromBidder
        ),
        'The contract is not authorized to use MANA on bidder behalf'
      )
    })

    it('reverts when placing a bid with 0 as price', async function() {
      await assertRevert(
        bidContract.placeBid(
          token.address,
          tokenOne,
          0,
          twoWeeksInSeconds,
          fromBidder
        ),
        'Price should be bigger than 0'
      )
    })

    it('reverts when bid expires in less than a minute', async function() {
      const fiftyNineSeconds = duration.seconds(59)
      await assertRevert(
        bidContract.placeBid(
          token.address,
          tokenOne,
          price,
          fiftyNineSeconds,
          fromBidder
        ),
        'The bid should last at least one minute'
      )
    })

    it('reverts when bid expires in more than 6 months', async function() {
      await assertRevert(
        bidContract.placeBid(
          token.address,
          tokenOne,
          price,
          moreThanSixMonthInSeconds,
          fromBidder
        ),
        'The bid can not last longer than 6 months'
      )
    })

    it('reverts when bidding an unowned token', async function() {
      await assertRevert(
        bidContract.placeBid(
          token.address,
          unownedToken,
          price,
          twoWeeksInSeconds,
          fromBidder
        )
      )
    })

    it('reverts when bidding an owned token', async function() {
      await token.transferFrom(holder, bidder, tokenOne, fromHolder)
      await assertRevert(
        bidContract.placeBid(
          token.address,
          tokenOne,
          price,
          twoWeeksInSeconds,
          fromBidder
        ),
        'The token should have an owner different from the sender'
      )
    })
  })

  describe('Cancel Bids', function() {
    beforeEach(async function() {
      await bidContract.placeBid(
        token.address,
        tokenOne,
        price,
        twoWeeksInSeconds,
        fromBidder
      )
    })

    it('should cancel a bid', async function() {
      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

      let bidCounter = await bidContract.bidCounterByToken(
        token.address,
        tokenOne
      )
      expect(bidCounter).to.be.eq.BN(web3.utils.toBN(1))

      const { logs } = await bidContract.cancelBid(
        token.address,
        tokenOne,
        fromBidder
      )
      expect(logs.length).to.be.equal(1)

      assertEvent(logs[0], 'BidCancelled', {
        _id: bidId,
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: bidder
      })

      bidCounter = await bidContract.bidCounterByToken(token.address, tokenOne)
      expect(bidCounter).to.be.eq.BN(0)
    })

    it('should cancel a bid :: Relayed EIP721', async function() {
      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

      let bidCounter = await bidContract.bidCounterByToken(
        token.address,
        tokenOne
      )
      expect(bidCounter).to.be.eq.BN(web3.utils.toBN(1))

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: '_tokenAddress',
              type: 'address'
            },
            {
              internalType: 'uint256',
              name: '_tokenId',
              type: 'uint256'
            }
          ],
          name: 'cancelBid',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function'
        },
        [token.address, tokenOne]
      )

      const { logs } = await sendMetaTx(
        bidContract,
        functionSignature,
        bidder,
        relayer,
        null,
        domain,
        version
      )

      expect(logs.length).to.be.equal(2)

      assertEvent(logs[1], 'BidCancelled', {
        _id: bidId,
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: bidder
      })

      bidCounter = await bidContract.bidCounterByToken(token.address, tokenOne)
      expect(bidCounter).to.be.eq.BN(0)
    })

    it('should cancel a bid in a different order from placed', async function() {
      await placeMultipleBidsAndCheck(
        tokenOne,
        [bidder, anotherBidder, oneMoreBidder],
        [1, 2, 3],
        [0, 1, 2]
      )

      await bidContract.cancelBid(token.address, tokenOne, fromAnotherBidder)

      let bidCounter = await bidContract.bidCounterByToken(
        token.address,
        tokenOne
      )
      expect(bidCounter).to.be.eq.BN(2)

      let bidData = await bidContract.getBidByToken(token.address, tokenOne, 0)
      expect(bidData[1]).to.be.equal(bidder)
      expect(bidData[2]).to.be.eq.BN(price)

      bidData = await bidContract.getBidByToken(token.address, tokenOne, 1)
      expect(bidData[1]).to.be.equal(oneMoreBidder)
      expect(bidData[2]).to.be.eq.BN(price)

      await bidContract.cancelBid(token.address, tokenOne, fromOneMoreBidder)

      bidCounter = await bidContract.bidCounterByToken(token.address, tokenOne)
      expect(bidCounter).to.be.eq.BN(web3.utils.toBN(1))

      bidData = await bidContract.getBidByToken(token.address, tokenOne, 0)
      expect(bidData[1]).to.be.equal(bidder)
      expect(bidData[2]).to.be.eq.BN(price)

      await bidContract.cancelBid(token.address, tokenOne, fromBidder)

      bidCounter = await bidContract.bidCounterByToken(token.address, tokenOne)
      expect(bidCounter).to.be.eq.BN(0)
    })

    it('reverts when cancelling invalid bid', async function() {
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
      await bidContract.placeBid(
        token.address,
        tokenOne,
        price,
        twoWeeksInSeconds,
        fromBidder
      )

      const fingerprint = await composableToken.getFingerprint(tokenOne)
      await bidContract.placeBidWithFingerprint(
        composableToken.address,
        tokenOne,
        price,
        twoWeeksInSeconds,
        fingerprint,
        fromBidder
      )
    })

    it('should accept a bid for an ERC721', async function() {
      let holderBalance = await mana.balanceOf(holder)
      expect(holderBalance).to.be.eq.BN(0)

      let bidderBalance = await mana.balanceOf(bidder)
      expect(bidderBalance).to.be.eq.BN(initialBalance)

      let ownerOfTokenOne = await token.ownerOf(tokenOne)
      ownerOfTokenOne.should.be.equal(holder)

      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

      await token.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenOne,
        bidId,
        fromHolder
      )

      const logs = await getEvents(bidContract, 'BidAccepted')

      expect(logs.length).to.be.equal(1)
      assertEvent(
        { event: logs[0].event, args: logs[0].returnValues },
        'BidAccepted',
        {
          _id: bidId,
          _tokenAddress: token.address,
          _tokenId: tokenOne,
          _bidder: bidder,
          _seller: holder,
          _price: price.toString(),
          _fee: '0'
        }
      )

      holderBalance = await mana.balanceOf(holder)
      expect(holderBalance).to.be.eq.BN(price)

      bidderBalance = await mana.balanceOf(bidder)
      expect(bidderBalance).to.be.eq.BN(initialBalance.sub(price))

      ownerOfTokenOne = await token.ownerOf(tokenOne)
      ownerOfTokenOne.should.be.equal(bidder)
    })

    it('should accept a bid for an ERC721 :: Relayed EIP721', async function() {
      let holderBalance = await mana.balanceOf(holder)
      expect(holderBalance).to.be.eq.BN(0)

      let bidderBalance = await mana.balanceOf(bidder)
      expect(bidderBalance).to.be.eq.BN(initialBalance)

      let ownerOfTokenOne = await token.ownerOf(tokenOne)
      ownerOfTokenOne.should.be.equal(holder)

      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address',
              name: 'from',
              type: 'address'
            },
            {
              internalType: 'address',
              name: 'to',
              type: 'address'
            },
            {
              internalType: 'uint256',
              name: 'tokenId',
              type: 'uint256'
            },
            {
              internalType: 'bytes',
              name: '_data',
              type: 'bytes'
            }
          ],
          name: 'safeTransferFromWithBytes',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function'
        },
        [holder, bidContract.address, tokenOne, bidId]
      )

      await sendMetaTx(
        token,
        functionSignature,
        holder,
        relayer,
        null,
        'Decentraland Token',
        '1'
      )

      const logs = await getEvents(bidContract, 'BidAccepted')

      expect(logs.length).to.be.equal(1)
      assertEvent(
        { event: logs[0].event, args: logs[0].returnValues },
        'BidAccepted',
        {
          _id: bidId,
          _tokenAddress: token.address,
          _tokenId: tokenOne,
          _bidder: bidder,
          _seller: holder,
          _price: price.toString(),
          _fee: '0'
        }
      )

      holderBalance = await mana.balanceOf(holder)
      expect(holderBalance).to.be.eq.BN(price)

      bidderBalance = await mana.balanceOf(bidder)
      expect(bidderBalance).to.be.eq.BN(initialBalance.sub(price))

      ownerOfTokenOne = await token.ownerOf(tokenOne)
      ownerOfTokenOne.should.be.equal(bidder)
    })

    it('should accept a bid for a composable ERC721', async function() {
      let holderBalance = await mana.balanceOf(holder)
      expect(holderBalance).to.be.eq.BN(0)

      let bidderBalance = await mana.balanceOf(bidder)
      expect(bidderBalance).to.be.eq.BN(initialBalance)

      let ownerOfTokenOne = await composableToken.ownerOf(tokenOne)
      ownerOfTokenOne.should.be.equal(holder)

      const bidId = (
        await bidContract.getBidByToken(composableToken.address, tokenOne, 0)
      )[0]

      await composableToken.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenOne,
        bidId,
        fromHolder
      )

      const logs = await getEvents(bidContract, 'BidAccepted')

      expect(logs.length).to.be.equal(1)
      assertEvent(
        { event: logs[0].event, args: logs[0].returnValues },
        'BidAccepted',
        {
          _id: bidId,
          _tokenAddress: composableToken.address,
          _tokenId: tokenOne,
          _bidder: bidder,
          _seller: holder,
          _price: price.toString()
        }
      )

      holderBalance = await mana.balanceOf(holder)
      expect(holderBalance).to.be.eq.BN(price)

      bidderBalance = await mana.balanceOf(bidder)
      expect(bidderBalance).to.be.eq.BN(initialBalance.sub(price))

      ownerOfTokenOne = await composableToken.ownerOf(tokenOne)
      ownerOfTokenOne.should.be.equal(bidder)
    })

    it('should accept a bid and invalidate the others for the same token', async function() {
      await placeMultipleBidsAndCheck(
        tokenOne,
        [bidder, anotherBidder, oneMoreBidder],
        [1, 2, 3],
        [0, 1, 2]
      )

      const firstBidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

      const secondBidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 1)
      )[0]

      await token.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenOne,
        secondBidId,
        fromHolder
      )

      let bidCounter = await bidContract.bidCounterByToken(
        token.address,
        tokenOne
      )
      expect(bidCounter).to.be.eq.BN(0)

      let tokenOwner = await token.ownerOf(tokenOne)
      tokenOwner.should.be.equal(anotherBidder)

      // Return land to holder
      await token.safeTransferFrom(
        anotherBidder,
        holder,
        tokenOne,
        fromAnotherBidder
      )

      tokenOwner = await token.ownerOf(tokenOne)
      tokenOwner.should.be.equal(holder)

      await assertRevert(
        token.safeTransferFromWithBytes(
          holder,
          bidContract.address,
          tokenOne,
          firstBidId,
          fromHolder
        )
      )
    })

    it('should simulate an end-2-end', async function() {
      // Create bids for tokenOne
      await placeMultipleBidsAndCheck(
        tokenOne,
        [bidder, anotherBidder, oneMoreBidder],
        [1, 2, 3],
        [0, 1, 2]
      )

      let firstBidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

      let bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 1)
      )[0]

      // Accept bid for tokenOne
      await token.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenOne,
        bidId,
        fromHolder
      )

      // Return land to holder
      await token.safeTransferFrom(
        anotherBidder,
        holder,
        tokenOne,
        fromAnotherBidder
      )

      // Check that remaining bids for tokenOne are invalid
      let bidCounter = await bidContract.bidCounterByToken(
        token.address,
        tokenOne
      )
      expect(bidCounter).to.be.eq.BN(0)

      await assertRevert(
        bidContract.getBidByToken(token.address, tokenOne, 0),
        'Invalid index'
      )
      await assertRevert(
        bidContract.getBidByToken(token.address, tokenOne, 1),
        'Invalid index'
      )
      await assertRevert(
        bidContract.getBidByToken(token.address, tokenOne, 2),
        'Invalid index'
      )

      await assertRevert(
        token.safeTransferFromWithBytes(
          holder,
          bidContract.address,
          tokenOne,
          firstBidId,
          fromHolder
        )
      )

      // Bid for the tokenOne again
      await placeAndCheckBid(tokenOne, oneMoreBidder, price, 1, 0)

      bidId = (await bidContract.getBidByToken(token.address, tokenOne, 0))[0]
      // Ids should be different
      bidId.should.be.not.equal(firstBidId)

      await token.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenOne,
        bidId,
        fromHolder
      )

      // Check that remaining bids for tokenOne are invalid
      bidCounter = await bidContract.bidCounterByToken(token.address, tokenOne)
      expect(bidCounter).to.be.eq.BN(0)
    })

    it('reverts when accepting invalid tokenId', async function() {
      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

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
      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

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
      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

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
      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

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
      const bidId = (
        await bidContract.getBidByToken(composableToken.address, tokenOne, 0)
      )[0]

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

    it('reverts when accepting an expired bid', async function() {
      await increaseTime(twoWeeksInSeconds + duration.minutes(1))

      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

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

    it('reverts when accepting with fingerprint changed', async function() {
      const bidId = (
        await bidContract.getBidByToken(composableToken.address, tokenOne, 0)
      )[0]

      await composableToken.setFingerprint(tokenOne, 2)

      await assertRevert(
        composableToken.safeTransferFromWithBytes(
          holder,
          bidContract.address,
          tokenOne,
          bidId,
          fromHolder
        )
      )
    })
  })

  describe('Share sale', function() {
    it('should share sale', async function() {
      let bidderBalance = await mana.balanceOf(bidder)
      expect(bidderBalance).to.be.eq.BN(initialBalance)

      let holderBalance = await mana.balanceOf(holder)
      expect(holderBalance).to.be.eq.BN(0)

      let feesCollectorBalance = await mana.balanceOf(feesCollector)
      expect(feesCollectorBalance).to.be.eq.BN(0)

      // Set 10% of bid price
      await bidContract.setFeesCollectorCutPerMillion(100000, fromOwner)

      await bidContract.placeBid(
        token.address,
        tokenOne,
        price,
        twoWeeksInSeconds,
        fromBidder
      )

      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

      await token.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenOne,
        bidId,
        fromHolder
      )

      const bidPrice = parseInt(price.toString())

      const logs = await getEvents(bidContract, 'BidAccepted')

      expect(logs.length).to.be.equal(1)
      assertEvent(
        { event: logs[0].event, args: logs[0].returnValues },
        'BidAccepted',
        {
          _id: bidId,
          _tokenAddress: token.address,
          _tokenId: tokenOne,
          _bidder: bidder,
          _seller: holder,
          _price: price.toString(),
          _fee: (bidPrice * 0.1).toString()
        }
      )

      bidderBalance = await mana.balanceOf(bidder)

      scientificToDecimal(bidderBalance.toString()).should.be.equal(
        scientificToDecimal(initialBalance.toString() - bidPrice)
      )

      holderBalance = await mana.balanceOf(holder)
      expect(holderBalance.toString()).to.be.equal(
        (bidPrice - bidPrice * 0.1).toString()
      )

      feesCollectorBalance = await mana.balanceOf(feesCollector)
      expect(feesCollectorBalance.toString()).to.be.equal(
        (bidPrice * 0.1).toString()
      )
    })

    it('should set to 0', async function() {
      let feesCollectorCut = await bidContract.feesCollectorCutPerMillion()
      expect(feesCollectorCut).to.be.eq.BN(0)

      await bidContract.setFeesCollectorCutPerMillion(10000, fromOwner)
      feesCollectorCut = await bidContract.feesCollectorCutPerMillion()
      expect(feesCollectorCut).to.be.eq.BN(web3.utils.toBN(10000))

      await bidContract.setFeesCollectorCutPerMillion(0, fromOwner)
      feesCollectorCut = await bidContract.feesCollectorCutPerMillion()
      expect(feesCollectorCut).to.be.eq.BN(0)
    })

    it('reverts when calling by hacker', async function() {
      await assertRevert(
        bidContract.setFeesCollectorCutPerMillion(1000, fromHacker)
      )
    })

    it('reverts when set bigger than 1000000', async function() {
      await assertRevert(
        bidContract.setFeesCollectorCutPerMillion(1000001, fromOwner),
        'The owner cut should be between 0 and 999,999'
      )
    })
  })

  describe('Pausable', function() {
    it('should be paused by the owner', async function() {
      let isPaused = await bidContract.paused()
      isPaused.should.be.equal(false)

      await bidContract.placeBid(
        token.address,
        tokenOne,
        price,
        twoWeeksInSeconds,
        fromBidder
      )

      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

      await bidContract.pause(fromOwner)

      isPaused = await bidContract.paused()
      isPaused.should.be.equal(true)

      await assertRevert(
        bidContract.placeBid(
          token.address,
          tokenOne,
          price,
          twoWeeksInSeconds,
          fromBidder
        ),
        'Pausable: paused'
      )

      await assertRevert(
        bidContract.cancelBid(token.address, tokenOne, fromBidder),
        'Pausable: paused'
      )

      await assertRevert(
        token.safeTransferFromWithBytes(
          holder,
          bidContract.address,
          tokenOne,
          bidId,
          fromHolder
        ),
        'Pausable: paused'
      )
    })

    it('should be paused by the owner :: Relayed EIP721', async function() {
      let isPaused = await bidContract.paused()
      isPaused.should.be.equal(false)

      await bidContract.placeBid(
        token.address,
        tokenOne,
        price,
        twoWeeksInSeconds,
        fromBidder
      )

      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [],
          name: 'pause',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function'
        },
        []
      )

      await sendMetaTx(
        bidContract,
        functionSignature,
        owner,
        relayer,
        null,
        domain,
        version
      )

      isPaused = await bidContract.paused()
      isPaused.should.be.equal(true)

      await assertRevert(
        bidContract.placeBid(
          token.address,
          tokenOne,
          price,
          twoWeeksInSeconds,
          fromBidder
        ),
        'Pausable: paused'
      )

      await assertRevert(
        bidContract.cancelBid(token.address, tokenOne, fromBidder),
        'Pausable: paused'
      )

      await assertRevert(
        token.safeTransferFromWithBytes(
          holder,
          bidContract.address,
          tokenOne,
          bidId,
          fromHolder
        ),
        'Pausable: paused'
      )
    })

    it('reverts when pausing by hacker', async function() {
      await assertRevert(bidContract.pause(fromHacker))
    })
  })

  describe('Remove Bids', function() {
    beforeEach(async function() {
      await bidContract.placeBid(
        token.address,
        tokenOne,
        price,
        twoWeeksInSeconds,
        fromBidder
      )
    })

    it('should remove an expired bid by bidder', async function() {
      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

      let bidCounter = await bidContract.bidCounterByToken(
        token.address,
        tokenOne
      )
      expect(bidCounter).to.be.eq.BN(web3.utils.toBN(1))

      await increaseTime(twoWeeksInSeconds + duration.minutes(1))

      const { logs } = await bidContract.removeExpiredBids(
        [token.address],
        [tokenOne],
        [bidder],
        fromBidder
      )
      expect(logs.length).to.be.equal(1)

      assertEvent(logs[0], 'BidCancelled', {
        _id: bidId,
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: bidder
      })

      bidCounter = await bidContract.bidCounterByToken(token.address, tokenOne)
      expect(bidCounter).to.be.eq.BN(0)
    })

    it('should remove an expired bid by bidder :: Relayed EIP721', async function() {
      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

      let bidCounter = await bidContract.bidCounterByToken(
        token.address,
        tokenOne
      )
      expect(bidCounter).to.be.eq.BN(web3.utils.toBN(1))

      await increaseTime(twoWeeksInSeconds + duration.minutes(1))

      const functionSignature = web3.eth.abi.encodeFunctionCall(
        {
          inputs: [
            {
              internalType: 'address[]',
              name: '_tokenAddresses',
              type: 'address[]'
            },
            {
              internalType: 'uint256[]',
              name: '_tokenIds',
              type: 'uint256[]'
            },
            {
              internalType: 'address[]',
              name: '_bidders',
              type: 'address[]'
            }
          ],
          name: 'removeExpiredBids',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function'
        },
        [[token.address], [tokenOne], [bidder]]
      )

      const { logs } = await sendMetaTx(
        bidContract,
        functionSignature,
        owner,
        relayer,
        null,
        domain,
        version
      )

      expect(logs.length).to.be.equal(2)

      assertEvent(logs[1], 'BidCancelled', {
        _id: bidId,
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: bidder
      })

      bidCounter = await bidContract.bidCounterByToken(token.address, tokenOne)
      expect(bidCounter).to.be.eq.BN(0)
    })

    it('should remove an expired bid by anyone', async function() {
      const bidId = (
        await bidContract.getBidByToken(token.address, tokenOne, 0)
      )[0]

      let bidCounter = await bidContract.bidCounterByToken(
        token.address,
        tokenOne
      )
      expect(bidCounter).to.be.eq.BN(web3.utils.toBN(1))

      await increaseTime(twoWeeksInSeconds + duration.minutes(1))

      const { logs } = await bidContract.removeExpiredBids(
        [token.address],
        [tokenOne],
        [bidder],
        fromAnotherBidder
      )
      expect(logs.length).to.be.equal(1)

      assertEvent(logs[0], 'BidCancelled', {
        _id: bidId,
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: bidder
      })

      bidCounter = await bidContract.bidCounterByToken(token.address, tokenOne)
      expect(bidCounter).to.be.eq.BN(0)
    })

    it('should remove an expired bid in the middle', async function() {
      await placeMultipleBidsAndCheck(
        tokenOne,
        [bidder, anotherBidder, oneMoreBidder],
        [1, 2, 3],
        [0, 1, 2]
      )

      await increaseTime(twoWeeksInSeconds + duration.minutes(1))

      await bidContract.removeExpiredBids(
        [token.address],
        [tokenOne],
        [anotherBidder],
        fromAnotherBidder
      )

      const bidCounter = await bidContract.bidCounterByToken(
        token.address,
        tokenOne
      )
      expect(bidCounter).to.be.eq.BN(2)

      let bidData = await bidContract.getBidByToken(token.address, tokenOne, 0)
      bidData[1].should.be.equal(bidder)
      expect(bidData[2]).to.be.eq.BN(price)

      bidData = await bidContract.getBidByToken(token.address, tokenOne, 1)
      bidData[1].should.be.equal(oneMoreBidder)
      expect(bidData[2]).to.be.eq.BN(price)
    })

    it('should remove expired bids', async function() {
      await placeMultipleBidsAndCheck(
        tokenOne,
        [bidder, anotherBidder, oneMoreBidder],
        [1, 2, 3],
        [0, 1, 2]
      )

      const [bid1, bid2, bid3] = await Promise.all([
        bidContract.getBidByToken(token.address, tokenOne, 0),
        bidContract.getBidByToken(token.address, tokenOne, 1),
        bidContract.getBidByToken(token.address, tokenOne, 2)
      ])

      const bidId1 = bid1[0]
      const bidId2 = bid2[0]
      const bidId3 = bid3[0]

      await increaseTime(twoWeeksInSeconds + duration.minutes(1))

      const { logs } = await bidContract.removeExpiredBids(
        [token.address, token.address, token.address],
        [tokenOne, tokenOne, tokenOne],
        [oneMoreBidder, bidder, anotherBidder],
        fromAnotherBidder
      )

      expect(logs.length).to.be.equal(3)

      assertEvent(logs[0], 'BidCancelled', {
        _id: bidId3,
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: oneMoreBidder
      })

      assertEvent(logs[1], 'BidCancelled', {
        _id: bidId1,
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: bidder
      })

      assertEvent(logs[2], 'BidCancelled', {
        _id: bidId2,
        _tokenAddress: token.address,
        _tokenId: tokenOne,
        _bidder: anotherBidder
      })
    })

    it('reverts when removing invalid bid', async function() {
      await assertRevert(
        bidContract.removeExpiredBids(
          [token.address],
          [tokenOne],
          [anotherBidder],
          fromAnotherBidder
        ),
        'Bidder has not an active bid for this token'
      )
    })

    it('reverts when cancelling a not expired bid', async function() {
      await assertRevert(
        bidContract.removeExpiredBids(
          [token.address],
          [tokenOne],
          [bidder],
          fromBidder
        ),
        'The bid to remove should be expired'
      )
    })

    it('reverts when calling with different sized arrays', async function() {
      await assertRevert(
        bidContract.removeExpiredBids(
          [token.address, tokenWithoutInterface.address],
          [tokenOne],
          [bidder],
          fromBidder
        ),
        'Parameter arrays should have the same length'
      )

      await assertRevert(
        bidContract.removeExpiredBids(
          [token.address],
          [tokenOne, tokenTwo],
          [bidder],
          fromBidder
        ),
        'Parameter arrays should have the same length'
      )
      await assertRevert(
        bidContract.removeExpiredBids(
          [token.address],
          [tokenOne],
          [bidder, anotherBidder],
          fromBidder
        ),
        'Parameter arrays should have the same length'
      )

      await assertRevert(
        bidContract.removeExpiredBids(
          [token.address, tokenWithoutInterface.address],
          [tokenOne, tokenTwo],
          [bidder],
          fromBidder
        ),
        'Parameter arrays should have the same length'
      )

      await assertRevert(
        bidContract.removeExpiredBids(
          [token.address, tokenWithoutInterface.address],
          [tokenTwo],
          [bidder, anotherBidder],
          fromBidder
        ),
        'Parameter arrays should have the same length'
      )

      await assertRevert(
        bidContract.removeExpiredBids(
          [token.address],
          [tokenOne, tokenTwo],
          [bidder, anotherBidder],
          fromBidder
        ),
        'Parameter arrays should have the same length'
      )
    })
  })

  describe('End-2-End', function() {
    it('should simulate a real case', async function() {
      console.log('----- Place bids for tokenOne & tokenTwo -----')
      await assertRevert(
        bidContract.getBidByBidder(token.address, tokenOne, anotherBidder),
        'Invalid index'
      )

      await placeMultipleBidsAndCheck(
        tokenOne,
        [bidder, anotherBidder, oneMoreBidder],
        [1, 2, 3],
        [0, 1, 2]
      )

      const [res1, res2] = await Promise.all([
        bidContract.getBidByToken(token.address, tokenOne, 1),
        bidContract.getBidByToken(token.address, tokenOne, 2)
      ])

      const tokenOneBid2 = res1[0]
      const tokenOneBid3 = res2[0]

      await placeMultipleBidsAndCheck(
        tokenTwo,
        [bidder, anotherBidder, oneMoreBidder],
        [1, 2, 3],
        [0, 1, 2]
      )

      const [resTokenTwoBid1, resTokenTwoBid3] = await Promise.all([
        bidContract.getBidByToken(token.address, tokenTwo, 0),
        bidContract.getBidByToken(token.address, tokenTwo, 2)
      ])
      const tokenTwoBid1 = resTokenTwoBid1[0]
      const tokenTwoBid3 = resTokenTwoBid3[0]

      console.log('----- Cancel first tokenOne bid -----')
      await bidContract.cancelBid(token.address, tokenOne, fromBidder)

      await assertRevert(
        bidContract.getBidByBidder(token.address, tokenOne, bidder),
        'Bidder has not an active bid for this token'
      )

      let bid = await bidContract.getBidByBidder(
        token.address,
        tokenOne,
        anotherBidder
      )
      expect(bid[0]).to.be.eq.BN(web3.utils.toBN(1))
      bid[1].should.be.equal(tokenOneBid2)

      bid = await bidContract.getBidByBidder(
        token.address,
        tokenOne,
        oneMoreBidder
      )
      expect(bid[0]).to.be.eq.BN(0)
      bid[1].should.be.equal(tokenOneBid3)

      console.log('----- Accept third bid placed for tokenOne -----')
      await token.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenOne,
        tokenOneBid3,
        fromHolder
      )

      console.log('----- Check counter for tokenOne -----')
      let bidCounter = await bidContract.bidCounterByToken(
        token.address,
        tokenOne
      )
      expect(bidCounter).to.be.eq.BN(0)
      await assertRevert(
        bidContract.getBidByToken(token.address, tokenOne, 0),
        'Invalid index'
      )

      console.log('----- Cancel second tokenTwo bid -----')
      await bidContract.cancelBid(token.address, tokenTwo, fromAnotherBidder)

      bid = await bidContract.getBidByBidder(token.address, tokenTwo, bidder)
      expect(bid[0]).to.be.eq.BN(0)
      bid[1].should.be.equal(tokenTwoBid1)

      bid = await bidContract.getBidByBidder(
        token.address,
        tokenTwo,
        oneMoreBidder
      )
      expect(bid[0]).to.be.eq.BN(web3.utils.toBN(1))
      bid[1].should.be.equal(tokenTwoBid3)

      console.log('----- Accept third bid placed for tokenTwo -----')
      await token.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenTwo,
        tokenTwoBid3,
        fromHolder
      )

      console.log('----- Check counter for tokenOne -----')
      bidCounter = await bidContract.bidCounterByToken(token.address, tokenTwo)
      expect(bidCounter).to.be.eq.BN(0)
      await assertRevert(
        bidContract.getBidByToken(token.address, tokenTwo, 0),
        'Invalid index'
      )

      console.log('----- Return tokenOne to holder -----')
      await token.transferFrom(
        oneMoreBidder,
        holder,
        tokenOne,
        fromOneMoreBidder
      )

      console.log('----- Place new bids for tokenOne -----')
      await placeMultipleBidsAndCheck(
        tokenOne,
        [bidder, anotherBidder, oneMoreBidder],
        [1, 2, 3],
        [0, 1, 2]
      )

      const resTokenOneBid1 = await bidContract.getBidByToken(
        token.address,
        tokenOne,
        0
      )
      const tokenOneBid1 = resTokenOneBid1[0]

      console.log('----- Cancel second and third tokenOne bid -----')
      await bidContract.cancelBid(token.address, tokenOne, fromOneMoreBidder)
      await bidContract.cancelBid(token.address, tokenOne, fromAnotherBidder)

      bid = await bidContract.getBidByBidder(token.address, tokenOne, bidder)
      expect(bid[0]).to.be.eq.BN(0)
      bid[1].should.be.equal(tokenOneBid1)

      console.log('----- Accept first bid placed for tokenOne -----')
      await token.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenOne,
        tokenOneBid1,
        fromHolder
      )

      console.log('----- Return tokenOne to holder -----')
      await token.transferFrom(bidder, holder, tokenOne, fromBidder)

      console.log('----- Place new bids for tokenOne -----')
      await placeMultipleBidsAndCheck(
        tokenOne,
        [bidder, anotherBidder, oneMoreBidder],
        [1, 2, 3],
        [0, 1, 2]
      )

      const resTokenOneBid4 = await bidContract.getBidByToken(
        token.address,
        tokenOne,
        2
      )

      const tokenOneBid4 = resTokenOneBid4[0]

      console.log('----- Cancel second and first tokenOne bid -----')
      await bidContract.cancelBid(token.address, tokenOne, fromAnotherBidder)
      await bidContract.cancelBid(token.address, tokenOne, fromBidder)

      await assertRevert(
        bidContract.getBidByBidder(token.address, tokenOne, bidder),
        'Bidder has not an active bid for this token'
      )

      await assertRevert(
        bidContract.getBidByBidder(token.address, tokenOne, anotherBidder),
        'Bidder has not an active bid for this token'
      )

      bid = await bidContract.getBidByBidder(
        token.address,
        tokenOne,
        oneMoreBidder
      )
      expect(bid[0]).to.be.eq.BN(0)
      bid[1].should.be.equal(tokenOneBid4)

      console.log('----- Accept third bid placed for tokenOne -----')
      await token.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenOne,
        tokenOneBid4,
        fromHolder
      )

      console.log('----- Return tokenOne to holder -----')
      await token.transferFrom(
        oneMoreBidder,
        holder,
        tokenOne,
        fromOneMoreBidder
      )

      console.log('----- Place new bids for tokenOne -----')
      await placeMultipleBidsAndCheck(
        tokenOne,
        [bidder, anotherBidder, oneMoreBidder],
        [1, 2, 3],
        [0, 1, 2]
      )

      const resTokenOneBid5 = await bidContract.getBidByToken(
        token.address,
        tokenOne,
        1
      )

      const tokenOneBid5 = resTokenOneBid5[0]

      console.log('----- Cancel first and third tokenOne bid -----')
      await bidContract.cancelBid(token.address, tokenOne, fromBidder)
      await bidContract.cancelBid(token.address, tokenOne, fromOneMoreBidder)

      await assertRevert(
        bidContract.getBidByBidder(token.address, tokenOne, bidder),
        'Bidder has not an active bid for this token'
      )

      await assertRevert(
        bidContract.getBidByBidder(token.address, tokenOne, oneMoreBidder),
        'Bidder has not an active bid for this token'
      )

      bid = await bidContract.getBidByBidder(
        token.address,
        tokenOne,
        anotherBidder
      )
      expect(bid[0]).to.be.eq.BN(0)
      bid[1].should.be.equal(tokenOneBid5)

      console.log('----- Accept second bid placed for tokenOne -----')
      await token.safeTransferFromWithBytes(
        holder,
        bidContract.address,
        tokenOne,
        tokenOneBid5,
        fromHolder
      )
    })
  })
})
