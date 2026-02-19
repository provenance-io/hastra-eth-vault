package bot

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/hastra/nav-updater-bot/internal/config"
	"github.com/hastra/nav-updater-bot/pkg/contracts"
)

type NavBot struct {
	client      *ethclient.Client
	navEngine   *contracts.NavEngine
	privateKey  *ecdsa.PrivateKey
	fromAddress common.Address
	cfg         *config.Config
}

func New(cfg *config.Config) (*NavBot, error) {
	client, err := ethclient.Dial(cfg.RPCUrl)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RPC: %w", err)
	}

	privateKey, err := crypto.HexToECDSA(cfg.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %w", err)
	}

	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("error casting public key to ECDSA")
	}
	fromAddress := crypto.PubkeyToAddress(*publicKeyECDSA)

	navEngineAddr := common.HexToAddress(cfg.NavEngineAddress)
	navEngine, err := contracts.NewNavEngine(navEngineAddr, client)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to NavEngine: %w", err)
	}

	return &NavBot{
		client:      client,
		navEngine:   navEngine,
		privateKey:  privateKey,
		fromAddress: fromAddress,
		cfg:         cfg,
	}, nil
}

func (b *NavBot) Start(ctx context.Context) error {
	fmt.Printf("🤖 NAV Updater Bot Started\n")
	fmt.Printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
	fmt.Printf("Address:      %s\n", b.fromAddress.Hex())
	fmt.Printf("NavEngine:    %s\n", b.cfg.NavEngineAddress)
	fmt.Printf("Vault:        %s\n", b.cfg.VaultAddress)
	fmt.Printf("RPC:          %s\n", b.cfg.RPCUrl)
	fmt.Printf("Interval:     %d seconds\n", b.cfg.UpdateInterval)
	fmt.Printf("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n")

	// Verify we're the updater
	updater, err := b.navEngine.GetUpdater(&bind.CallOpts{})
	if err != nil {
		return fmt.Errorf("failed to get updater: %w", err)
	}
	if updater != b.fromAddress {
		return fmt.Errorf("❌ Address %s is not the updater (expected: %s)", b.fromAddress.Hex(), updater.Hex())
	}
	fmt.Printf("✅ Verified as updater\n\n")

	ticker := time.NewTicker(time.Duration(b.cfg.UpdateInterval) * time.Second)
	defer ticker.Stop()

	// First update immediately
	if err := b.updateRate(ctx); err != nil {
		fmt.Printf("❌ Initial update failed: %v\n\n", err)
	}

	// Then update on interval
	for {
		select {
		case <-ctx.Done():
			fmt.Println("🛑 Bot stopped")
			return ctx.Err()
		case <-ticker.C:
			if err := b.updateRate(ctx); err != nil {
				fmt.Printf("❌ Update failed: %v\n\n", err)
			}
		}
	}
}

func (b *NavBot) updateRate(ctx context.Context) error {
	fmt.Printf("[%s] 🔄 Updating rate...\n", time.Now().Format("2006-01-02 15:04:05"))

	// Using mock values for demonstration
	// In production, these would come from vault contract calls
	totalSupply := new(big.Int)
	totalSupply.SetString("1000000000000000000000", 10) // 1000 * 1e18
	totalTVL := new(big.Int)
	totalTVL.SetString("1500000000000000000000", 10) // 1500 * 1e18

	fmt.Printf("  Total Supply: %s (1000.00 shares)\n", totalSupply.String())
	fmt.Printf("  Total TVL:    %s (1500.00 assets)\n", totalTVL.String())

	// Get current rate
	currentRate, err := b.navEngine.GetRate(&bind.CallOpts{})
	if err == nil {
		fmt.Printf("  Current Rate: %s\n", currentRate.String())
	}

	// Create transaction
	auth, err := b.createTransactor(ctx)
	if err != nil {
		return fmt.Errorf("failed to create transactor: %w", err)
	}

	// Call updateRate
	tx, err := b.navEngine.UpdateRate(auth, totalSupply, totalTVL)
	if err != nil {
		return fmt.Errorf("failed to send transaction: %w", err)
	}

	fmt.Printf("  Transaction:  %s\n", tx.Hash().Hex())
	fmt.Printf("  Waiting for confirmation...\n")

	// Wait for receipt
	receipt, err := bind.WaitMined(ctx, b.client, tx)
	if err != nil {
		return fmt.Errorf("failed to wait for transaction: %w", err)
	}

	if receipt.Status == 0 {
		return fmt.Errorf("transaction reverted")
	}

	newRate, _ := b.navEngine.GetRate(&bind.CallOpts{})
	fmt.Printf("  ✅ Rate updated to: %s\n", newRate.String())
	fmt.Printf("  Gas used: %d\n\n", receipt.GasUsed)

	return nil
}

func (b *NavBot) createTransactor(ctx context.Context) (*bind.TransactOpts, error) {
	nonce, err := b.client.PendingNonceAt(ctx, b.fromAddress)
	if err != nil {
		return nil, err
	}

	gasPrice, err := b.client.SuggestGasPrice(ctx)
	if err != nil {
		return nil, err
	}

	maxGasPrice := new(big.Int).Mul(big.NewInt(b.cfg.MaxGasPriceGwei), big.NewInt(1e9))
	if gasPrice.Cmp(maxGasPrice) > 0 {
		return nil, fmt.Errorf("gas price %s exceeds max %s", gasPrice, maxGasPrice)
	}

	chainID := big.NewInt(b.cfg.ChainID)
	auth, err := bind.NewKeyedTransactorWithChainID(b.privateKey, chainID)
	if err != nil {
		return nil, err
	}

	auth.Nonce = big.NewInt(int64(nonce))
	auth.Value = big.NewInt(0)
	auth.GasLimit = b.cfg.GasLimit
	auth.GasPrice = gasPrice
	auth.Context = ctx

	return auth, nil
}

func (b *NavBot) Close() {
	if b.client != nil {
		b.client.Close()
	}
}
