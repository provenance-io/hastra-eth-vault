📦 OpenZeppelin Contracts Inherited

```
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
```

| Import | What It Does | Why We Use It |
| --- | --- | --- |
| **ERC20** | Standard fungible token | Base for wYLDS token |
| **ERC4626** | Tokenized vault standard | Automatic share/asset math, deposit/withdraw |
| **ERC20Permit** | Gasless approvals (EIP-2612) | Users can approve via signatures |
| **AccessControl** | Role-based permissions | Admin roles (FREEZE, REWARDS, PAUSER, etc.) |
| **Pausable** | Emergency stop | Pause all operations if needed |
| **ReentrancyGuard** | Prevent reentrancy attacks | Secure state changes |
| **MerkleProof** | Verify merkle proofs | Efficient rewards distribution |
| **SafeERC20** | Safe token transfers | Handle non-standard ERC20s |
-------

                    ┌─────────────┐
                    │    ERC20    │  (Base token)
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              │                         │
       ┌──────▼──────┐          ┌───────▼───────┐
       │   ERC4626   │          │  ERC20Permit  │
       │ (Vault std) │          │(Gasless approve)
       └──────┬──────┘          └───────┬───────┘
              │                         │
              └────────────┬────────────┘
                           │
                    ┌──────▼──────┐
                    │ YieldVault  │◄──── AccessControl
                    │             │◄──── Pausable
                    │             │◄──── ReentrancyGuard
                    └─────────────┘

