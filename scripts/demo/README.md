# Demo Scripts

This folder contains all demo-related scripts for the Hastra Vault Protocol.

## Structure

```
scripts/demo/
├── README.md                     # This file
│
├── Shell Scripts (orchestration)
│   ├── demo_flow.sh             # Full demo: deploy + interactions
│   ├── run_demo_interactions.sh # Demo without deployment
│   ├── run_cancel_demo.sh       # Cancellation demo
│   ├── run_rewards_demo.sh      # Rewards distribution demo
│   └── fund-target.sh           # Fund a specific address with USDC
│
└── TypeScript Scripts (implementation)
    ├── mint-usdc.ts             # Mint test USDC
    ├── deposit-usdc.ts          # Deposit USDC → wYLDS
    ├── stake-wylds.ts           # Stake wYLDS → PRIME
    ├── unstake-and-redeem.ts    # Unstake PRIME → wYLDS
    ├── request-redeem.ts        # Request wYLDS redemption
    ├── cancel-redemption.ts     # Cancel redemption request
    └── distribute-rewards.ts    # Distribute rewards to stakers
```

## Usage

All demo scripts should be run from the project root:

```bash
# Full demo (deploy + interactions)
/bin/bash scripts/demo/demo_flow.sh

# Interactions only (uses existing deployment)
/bin/bash scripts/demo/run_demo_interactions.sh

# Cancellation demo
/bin/bash scripts/demo/run_cancel_demo.sh

# Rewards demo
/bin/bash scripts/demo/run_rewards_demo.sh

# Fund a specific address (default 1M USDC)
/bin/bash scripts/demo/fund-target.sh

# Fund with custom amount
/bin/bash scripts/demo/fund-target.sh 5000000 0x5F4099e0C8f1Aa64EacbBB8e4D3d9D4173e635fd # 5M USDC to 0x5F4099e0C8f1Aa64EacbBB8e4D3d9D4173e635fd
```

## Path Resolution

All demo scripts:
1. Change to project root: `cd "$(dirname "$0")/../.."`
2. Read deployment file from root: `deployment_testnet.json` or `deployment.json`
3. Call TypeScript scripts: `npx hardhat run scripts/demo/xxx.ts --network hoodi`

## TypeScript Scripts Can Be Called Standalone

```bash
# Mint USDC
npx hardhat run scripts/demo/mint-usdc.ts --network hoodi

# Deposit USDC for wYLDS
export YIELD_VAULT_ADDRESS=0x...
export DEPOSIT_AMOUNT=1000
npx hardhat run scripts/demo/deposit-usdc.ts --network hoodi

# Stake wYLDS for PRIME
export STAKING_VAULT_ADDRESS=0x...
export STAKE_AMOUNT=500
npx hardhat run scripts/demo/stake-wylds.ts --network hoodi

# Distribute rewards
export STAKING_VAULT_ADDRESS=0x...
export REWARD_AMOUNT=100
npx hardhat run scripts/demo/distribute-rewards.ts --network hoodi
```

## What Each Demo Does

### demo_flow.sh
- Deploys all contracts
- Mints USDC
- Deposits USDC → wYLDS
- Stakes wYLDS → PRIME
- Unstakes and redeems

### run_demo_interactions.sh
- Uses existing deployment
- Mints USDC
- Deposits USDC → wYLDS  
- Stakes wYLDS → PRIME
- Redeems 50% of PRIME
- Withdraws wYLDS → USDC

### run_cancel_demo.sh
- Demonstrates redemption cancellation flow
- Mints, deposits, requests redemption
- Cancels the redemption request

### run_rewards_demo.sh
- Shows rewards distribution
- Stakes, distributes rewards, unstakes
- Shows share price increase from rewards

## Shell Script Descriptions

### demo_flow.sh
Complete end-to-end demo:
- Deploys all contracts (USDC, YieldVault, StakingVault)
- Mints test USDC
- Deposits USDC → wYLDS
- Stakes wYLDS → PRIME
- Unstakes and redeems back to USDC

### run_demo_interactions.sh
Interactions without deployment (uses existing contracts):
- Mints 10,000 USDC
- Deposits 5,000 USDC → 5,000 wYLDS
- Stakes 2,000 wYLDS → receives PRIME (amount depends on share price)
- Redeems 50% of PRIME → wYLDS
- Withdraws all wYLDS → USDC

### run_cancel_demo.sh
Demonstrates redemption cancellation:
- Mints USDC and deposits for wYLDS
- Requests wYLDS redemption (creates pending redemption)
- Cancels the pending redemption
- Shows how users can cancel before completion

### run_rewards_demo.sh
Shows rewards distribution mechanics:
- Stakes wYLDS for PRIME
- Distributes rewards to the vault
- Shows share price increase
- Demonstrates how stakers earn yield

### fund-target.sh
Utility to fund a specific address:
- Mints USDC to a target address
- Default: 1M USDC, configurable via argument
- Useful for setting up test scenarios
