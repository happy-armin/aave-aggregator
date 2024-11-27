// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Import necessary contract interfaces
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPool } from "@aave/core-v3/contracts/interfaces/IPool.sol";

contract AaveAggregator {
	// Use SafeERC20 for secure token transfers
	using SafeERC20 for IERC20;

	// Variables for holding DAI and Aave Pool address
	IERC20 public immutable daiToken;
	IPool public immutable aavePool;

	// Mapping to store user-related deposited information
	mapping(address => uint256) public userShare;

	// Varialbe for holding total deposited dai to the Aave Pool
	uint256 public totalShare;

	/**
	 * @notice Constructs the Core contract with the necessary DAI and Aave Pool instances.
	 * @param _dai The address of the DAI Token contract.
	 * @param _aave The address of the Aave Pool contract.
	 */
	constructor(address _dai, address _aave) {
		daiToken = IERC20(_dai);
		aavePool = IPool(_aave);
	}

	/**
	 * @notice Deposits the given amount of DAI token to the Aave Pool
	 * @param _amount The amount of the given DAI token
	 */
	function deposit(uint256 _amount) external {
		// check the sender's balance
		require(_amount > 0, "The amount must be greter than zero");
		require(
			daiToken.balanceOf(msg.sender) >= _amount,
			"Insufficient DAI token"
		);

		// transfer given amount of DAI token from msg.sender to contract
		daiToken.safeTransferFrom(msg.sender, address(this), _amount);

		// approve the given amount of DAI token to the Aave Pool
		daiToken.approve(address(aavePool), _amount);

		// calculate the current aDAI balance of Aave pool
		address aTokenAddress = aavePool
			.getReserveData(address(daiToken))
			.aTokenAddress;
		uint256 currentBalanceBeforeSupply = IERC20(aTokenAddress).balanceOf(
			address(this)
		);

		// supplies the given amount of DAI token to the Aave Pool
		aavePool.supply(address(daiToken), _amount, address(this), 0);

		// calculate the aDAI balance of Aave pool after supply
		uint256 currentBalanceAfterSupply = IERC20(aTokenAddress).balanceOf(
			address(this)
		);

		// calculate the shares of user
		// totalShare : currentBalanceBeforeSupply = totalShareAfter : currentBalanceAfterSupply
		// totalShareAfter = totalShare * currentBalanceAfterSupply / currentBalanceBeforeSupply
		// currentShare = totalShareAfter - totalShare
		uint256 currentShare;
		if (totalShare != 0) {
			currentShare =
				(totalShare * currentBalanceAfterSupply) /
				currentBalanceBeforeSupply -
				totalShare;
		} else {
			currentShare =
				currentBalanceAfterSupply -
				currentBalanceBeforeSupply;
		}

		// upgrade share infos
		totalShare = totalShare + currentShare;
		userShare[msg.sender] = userShare[msg.sender] + currentShare;
	}

	// ---------- _withdraw(address _account, uint256 _share) internal function to prevent duplication ---------- //

	/**
	 * @notice Withdraws the given amount of DAI token from the Aave Pool
	 * @param _share The amount given of DAI token
	 */
	function withdraw(uint256 _share) external {
		// check the withdrawable amount of DAI token
		require(userShare[msg.sender] != 0, "No deposited token");
		require(_share > 0, "The share must be greter than zero");
		require(_share <= userShare[msg.sender], "Not enough share");

		// calculate the amount user will receive
		address aTokenAddress = aavePool
			.getReserveData(address(daiToken))
			.aTokenAddress;
		uint256 currentBalance = IERC20(aTokenAddress).balanceOf(address(this));
		uint256 amount = (currentBalance * _share) / totalShare;

		// withdraw the amount of DAI token from the Aave Pool
		uint256 withdrawnAmount = aavePool.withdraw(
			address(daiToken),
			amount,
			address(this)
		);

		// transfer the received DAI token to the user
		daiToken.safeTransfer(msg.sender, withdrawnAmount);

		// update share infos
		totalShare = totalShare - _share;
		userShare[msg.sender] = userShare[msg.sender] - _share;
	}

	/**
	 * @notice Withdraws user's all DAI token from the Aave Pool
	 */
	function withdrawAll() external {
		// check if the user is deposited
		require(userShare[msg.sender] != 0, "No deposited token");

		// calculate the amount user will receive
		address aTokenAddress = aavePool
			.getReserveData(address(daiToken))
			.aTokenAddress;
		uint256 currentBalance = IERC20(aTokenAddress).balanceOf(address(this));
		uint256 amount = (currentBalance * userShare[msg.sender]) / totalShare;

		// withdraw the amount of DAI token from the Aave Pool
		uint256 withdrawnAmount = aavePool.withdraw(
			address(daiToken),
			amount,
			address(this)
		);

		// transfer the received DAI token to the user
		daiToken.safeTransfer(msg.sender, withdrawnAmount);

		// update share infos
		totalShare = totalShare - userShare[msg.sender];
		userShare[msg.sender] = 0;
	}

	/**
	 * @notice Returns the share balance of user
	 * @param _account The address of supplier
	 * @return uint256 The share balance of msg.sender
	 */
	function getShare(address _account) external view returns (uint256) {
		return userShare[_account];
	}

	/**
	 * @notice Returns the amount of DAI token related to the share amount
	 * @param _share The amount of share
	 * @return uint256 The amount of DAI token
	 */
	function getAmountFromShare(
		uint256 _share
	) external view returns (uint256) {
		if (totalShare == 0) return 0;
		address aTokenAddress = aavePool
			.getReserveData(address(daiToken))
			.aTokenAddress;
		uint256 currentBalance = IERC20(aTokenAddress).balanceOf(address(this));

		return (currentBalance * _share) / totalShare;
	}
}
