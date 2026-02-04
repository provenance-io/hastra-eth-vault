# GitHub Actions Workflows

This directory contains the CI/CD workflows for the Hastra Ethereum Vault Protocol.

## Workflows

### 1. CI (`ci.yml`) - Main CI Pipeline
**Triggers:** Push to `main`, `develop`, `feature/*` branches; Pull requests

**Jobs:**
1. **Lint** - TypeScript type checking
2. **Compile** - Compile Solidity contracts with Hardhat
3. **Test** - Run test suite with coverage
4. **Extract ABIs** - Extract and upload ABIs (only on push to main)
5. **Status Check** - Overall CI status

**Artifacts Created:**
- `compiled-contracts` - Compiled artifacts (7 days retention)
- `contract-abis-latest` - Latest ABIs from main branch (90 days retention, **only on main**)

### 2. Release ABIs (`build-abi.yml`) - Version Releases
**Triggers:** Git tags starting with `v*` (e.g., `v1.0.0`, `v2.1.0`)

**Jobs:**
- Compile contracts
- Extract ABIs
- Create release packages (.tar.gz and .zip)
- Create GitHub Release with ABI downloads

**When to use:** Only when creating official version releases

## ABI Artifacts

### Accessing ABIs from CI (Latest Main Branch)

The **latest ABIs from main branch** are automatically uploaded on every push to main:

**How to access:**
1. Go to Actions → CI workflow
2. Click on the most recent successful run on main branch
3. Download `contract-abis-latest` artifact
4. This artifact is **overwritten** on each push to main (no clutter!)

**Files included:**
- `YieldVault.json` - YieldVault ABI
- `StakingVault.json` - StakingVault ABI  
- `MockUSDC.json` - MockUSDC ABI
- `contracts.json` - Combined ABIs with metadata
- `version.json` - Version info (commit SHA, timestamp)

### Accessing ABIs from Releases (Stable Versions)

When you create a version tag (e.g., `v1.0.0`), a GitHub Release is created automatically with ABI packages.

**Creating a release:**
```bash
# Tag a version
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# GitHub Actions automatically:
# 1. Compiles contracts
# 2. Extracts ABIs  
# 3. Creates release with downloadable packages
```

**Download from:**
- GitHub Releases page
- `hastra-vault-abis-v1.0.0.tar.gz` (Linux/Mac)
- `hastra-vault-abis-v1.0.0.zip` (Windows/Universal)

**Use this for:** Production deployments, stable versions for frontends

### Using ABIs in Your Application

**JavaScript/TypeScript:**
```javascript
// Download and import
import YieldVaultABI from './abi-exports/YieldVault.json';
import StakingVaultABI from './abi-exports/StakingVault.json';

const yieldVault = new ethers.Contract(
  YIELD_VAULT_ADDRESS,
  YieldVaultABI,
  provider
);
```

**Python:**
```python
import json

# Load ABI
with open('abi-exports/YieldVault.json') as f:
    yield_vault_abi = json.load(f)

# Use with web3.py
contract = w3.eth.contract(
    address=YIELD_VAULT_ADDRESS,
    abi=yield_vault_abi
)
```

## Creating a Release with ABIs

```bash
# Tag a version
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# GitHub Actions automatically:
# 1. Runs Release ABIs workflow
# 2. Compiles contracts
# 3. Extracts ABIs
# 4. Creates release packages
# 5. Uploads to GitHub Releases page
```

## Local Testing

Test the ABI extraction locally:

```bash
# Compile contracts
npx hardhat compile

# Extract ABIs manually
mkdir -p abi-exports
jq '.abi' artifacts/contracts/YieldVault.sol/YieldVault.json > abi-exports/YieldVault.json
jq '.abi' artifacts/contracts/StakingVault.sol/StakingVault.json > abi-exports/StakingVault.json
```

## Coverage Reports

Coverage reports are automatically uploaded to Codecov. Add the Codecov badge to your README:

```markdown
[![codecov](https://codecov.io/gh/YOUR_ORG/hastra-eth-vault/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_ORG/hastra-eth-vault)
```

## Troubleshooting

### Workflow fails at compile step
- Check that all dependencies are listed in `package.json`
- Ensure Solidity version is compatible

### ABIs not uploaded
- Check that `jq` command succeeded (it's pre-installed on Ubuntu runners)
- Verify artifact paths are correct

### Release not created
- Ensure you pushed the tag: `git push origin v1.0.0`
- Check that tag starts with `v` (e.g., `v1.0.0`, not `1.0.0`)

## Security Notes

- **NEVER** commit private keys or `.env` files
- Secrets should be stored in GitHub Secrets
- ABIs are safe to share publicly (they're just interface definitions)
