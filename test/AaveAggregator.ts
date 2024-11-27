import { Signer, parseEther } from "ethers"
import { ethers, network } from "hardhat"
import { expect } from "chai"
import { AaveAggregator, IERC20 } from "typechain-types"

async function timeTravel(seconds: number) {
	await ethers.provider.send("evm_increaseTime", [seconds])
	await ethers.provider.send("evm_mine")
}

describe("AaveAggregator", () => {
	const ADDRESS__DAI_TOKEN = "0x6B175474E89094C44Da98b954EedeAC495271d0F"
	const ADDRESS__AAVE_V3_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"
	const DAI_HOLDER = "0xD1668fB5F690C59Ab4B0CAbAd0f8C1617895052B"

	let deployer: Signer, alice: Signer, bob: Signer, carol: Signer
	let aaveAggregator: AaveAggregator
	let daiToken: IERC20

	before(async () => {
		// get signers from the hardhat node
		;[deployer, alice, bob, carol] = await ethers.getSigners()

		// dai token contract
		daiToken = await ethers.getContractAt("IERC20", ADDRESS__DAI_TOKEN)

		// deploy the AaveAggregator contract
		const AaveAggregatorFactory = await ethers.getContractFactory("AaveAggregator")
		aaveAggregator = await AaveAggregatorFactory.connect(deployer).deploy(ADDRESS__DAI_TOKEN, ADDRESS__AAVE_V3_POOL)

		// send 10000 DAI to alice and bob
		await network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [DAI_HOLDER],
		})

		const daiHolder = await ethers.getSigner(DAI_HOLDER)

		await daiToken.connect(daiHolder).transfer(alice, ethers.parseEther("10000"))
		await daiToken.connect(daiHolder).transfer(bob, ethers.parseEther("10000"))

		await network.provider.request({
			method: "hardhat_stopImpersonatingAccount",
			params: [DAI_HOLDER],
		})
	})

	it("test after construction", async () => {
		expect(await aaveAggregator.daiToken()).to.equal(ADDRESS__DAI_TOKEN)
		expect(await aaveAggregator.aavePool()).to.equal(ADDRESS__AAVE_V3_POOL)
	})

	it("test deposit function with amount zero", async () => {
		await expect(aaveAggregator.connect(alice).deposit(0)).to.be.revertedWith("The amount must be greter than zero")
	})

	it("test deposit function with amount greater than balance", async () => {
		await expect(aaveAggregator.connect(alice).deposit(ethers.parseEther("100000"))).to.be.revertedWith(
			"Insufficient DAI token"
		)
	})

	it("test deposit function", async () => {
		// approve aggregator to spend alice's dai token
		await daiToken.connect(alice).approve(aaveAggregator, ethers.parseEther("1000"))

		// call deposit function with alice's dai token (1000*10**18) amount
		await aaveAggregator.connect(alice).deposit(ethers.parseEther("1000"))

		// get alice's share and dai amount in the aggregator
		const aliceShare = await aaveAggregator.getShare(alice)
		const aliceAmount = await aaveAggregator.getAmountFromShare(aliceShare)

		// check the share and balance
		console.log(`Alice's share: ${aliceShare}`)
		console.log(`Alice's DAI amount: ${aliceAmount}`)
	})

	it("test after a year", async () => {
		// travel a year forward
		await timeTravel(365 * 24 * 60 * 60)

		// check the share and balance after a year
		const aliceShare = await aaveAggregator.getShare(alice)
		const aliceAmount = await aaveAggregator.getAmountFromShare(aliceShare)

		console.log(`Alice's share after a year: ${aliceShare}`)
		console.log(`Alice's DAI amount after a year: ${aliceAmount}`)
	})

	it("test deposit function focus on share", async () => {
		// approve aggregator to spend bob's dai token
		await daiToken.connect(bob).approve(aaveAggregator, ethers.parseEther("1000"))

		// call deposit function with bob's dai token (1000*10**18) amount
		await aaveAggregator.connect(bob).deposit(ethers.parseEther("1000"))

		// get bob's share and dai amount in the aggregator
		const bobShare = await aaveAggregator.getShare(bob)
		const bobAmount = await aaveAggregator.getAmountFromShare(bobShare)

		// check the share and balance
		console.log(`Bob's share: ${bobShare}`)
		console.log(`Bob's DAI amount: ${bobAmount}`)
	})

	it("test after a year", async () => {
		// travel a year forward
		await timeTravel(365 * 24 * 60 * 60)

		// check the alice's share and balance after a year
		const aliceShare = await aaveAggregator.getShare(alice)
		const aliceAmount = await aaveAggregator.getAmountFromShare(aliceShare)

		console.log(`Alice's share after two year: ${aliceShare}`)
		console.log(`Alice's DAI amount after two year: ${aliceAmount}`)

		// check the bob's share and balance after a year
		const bobShare = await aaveAggregator.getShare(bob)
		const bobAmount = await aaveAggregator.getAmountFromShare(bobShare)

		console.log(`Bob's share after two year: ${bobShare}`)
		console.log(`Bob's DAI amount after two year: ${bobAmount}`)
	})

	it("test withdraw function with stranger", async () => {
		await expect(aaveAggregator.connect(carol).withdraw(ethers.parseEther("1000"))).to.be.revertedWith(
			"No deposited token"
		)
	})

	it("test withdraw function with zero amount", async () => {
		await expect(aaveAggregator.connect(alice).withdraw(ethers.parseEther("0"))).to.be.revertedWith(
			"The share must be greter than zero"
		)
	})

	it("test withdraw function with more share", async () => {
		await expect(aaveAggregator.connect(alice).withdraw(ethers.parseEther("2000"))).to.be.revertedWith(
			"Not enough share"
		)
	})

	it("test withdraw function", async () => {
		await aaveAggregator.connect(alice).withdraw(ethers.parseEther("500"))

		// check the alice's share and balance after a year
		const aliceBalance = await daiToken.balanceOf(alice)
		const aliceShare = await aaveAggregator.getShare(alice)
		const aliceAmount = await aaveAggregator.getAmountFromShare(aliceShare)

		console.log(`Alice's DAI balance: ${aliceBalance}`)
		console.log(`Alice's share after withdrawn: ${aliceShare}`)
		console.log(`Alice's DAI amount after withdrawn: ${aliceAmount}`)
	})

	it("test withdrawAll function", async () => {
		await aaveAggregator.connect(alice).withdrawAll()

		// check the alice's share and balance after a year
		const aliceBalance = await daiToken.balanceOf(alice)
		const aliceShare = await aaveAggregator.getShare(alice)
		const aliceAmount = await aaveAggregator.getAmountFromShare(aliceShare)

		console.log(`Alice's DAI balance: ${aliceBalance}`)
		console.log(`Alice's share after withdrawn: ${aliceShare}`)
		console.log(`Alice's DAI amount after withdrawn: ${aliceAmount}`)
	})

	it("test withdrawAll function", async () => {
		await aaveAggregator.connect(bob).withdrawAll()

		// check the bob's share and balance after a year
		const bobBalance = await daiToken.balanceOf(bob)
		const bobShare = await aaveAggregator.getShare(bob)
		const bobAmount = await aaveAggregator.getAmountFromShare(bobShare)

		console.log(`Bob's DAI balance: ${bobBalance}`)
		console.log(`Bob's share after withdrawn: ${bobShare}`)
		console.log(`Bob's DAI amount after withdrawn: ${bobAmount}`)
	})
})
