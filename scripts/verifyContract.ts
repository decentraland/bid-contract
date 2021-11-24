import hr from 'hardhat'

async function main() {
  await hr.run("verify:verify", {
    address: '0xa8f508624F4eFabD2A3a85099F15B0a3Fa06687a',
    constructorArguments: [
      process.env['OWNER'],
      process.env['FEE_COLLECTOR'],
      '0x882Da5967c435eA5cC6b09150d55E8304B838f45',
      process.env['ROYALTIES_MANAGER'],
      10000,
      15000
    ],
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })