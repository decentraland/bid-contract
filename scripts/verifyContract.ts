import hr from 'hardhat'

async function main() {
  await hr.run("verify:verify", {
    address: '0x5cF39E64392C615FD8086838883958752a11B486',
    constructorArguments: [
      process.env['OWNER'],
      process.env['FEE_COLLECTOR'],
      '0xA1c57f48F0Deb89f569dFbE6E2B7f46D33606fD4',
      process.env['ROYALTIES_MANAGER'],
      0,
      25000
    ],
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })