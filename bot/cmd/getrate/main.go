package main

import (
	"fmt"
	"log"
	"os"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/hastra/nav-updater-bot/internal/config"
	"github.com/hastra/nav-updater-bot/pkg/contracts"
)

func main() {
	fmt.Println("🔍 Querying NavEngine Rate...")

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("❌ Config error: %v", err)
	}

	client, err := ethclient.Dial(cfg.RPCUrl)
	if err != nil {
		log.Fatalf("❌ Failed to connect to RPC: %v", err)
	}
	defer client.Close()

	navEngineAddr := common.HexToAddress(cfg.NavEngineAddress)
	navEngine, err := contracts.NewNavEngine(navEngineAddr, client)
	if err != nil {
		log.Fatalf("❌ Failed to connect to NavEngine: %v", err)
	}

	// Get rate
	rate, err := navEngine.GetRate(&bind.CallOpts{})
	if err != nil {
		log.Fatalf("❌ Failed to get rate: %v", err)
	}

	// Get additional info
	minRate, _ := navEngine.GetMinRate(&bind.CallOpts{})
	maxRate, _ := navEngine.GetMaxRate(&bind.CallOpts{})
	lastUpdate, _ := navEngine.GetLatestUpdateTime(&bind.CallOpts{})
	updater, _ := navEngine.GetUpdater(&bind.CallOpts{})
	owner, _ := navEngine.Owner(&bind.CallOpts{})
	paused, _ := navEngine.Paused(&bind.CallOpts{})

	fmt.Printf("\n📊 NavEngine Status:\n")
	fmt.Printf("  Contract:     %s\n", cfg.NavEngineAddress)
	fmt.Printf("  Network:      Hoodi (ChainID: %d)\n", cfg.ChainID)
	fmt.Printf("\n")
	fmt.Printf("  ✅ Current Rate: %s (%.2f)\n", rate.String(), float64(rate.Int64())/1e18)
	fmt.Printf("  📏 Min Rate:     %s (%.2f)\n", minRate.String(), float64(minRate.Int64())/1e18)
	fmt.Printf("  📏 Max Rate:     %s (%.2f)\n", maxRate.String(), float64(maxRate.Int64())/1e18)
	fmt.Printf("  🕐 Last Update:  %s\n", lastUpdate.String())
	fmt.Printf("  👤 Updater:      %s\n", updater.Hex())
	fmt.Printf("  👑 Owner:        %s\n", owner.Hex())
	fmt.Printf("  ⏸️  Paused:       %v\n", paused)

	if rate.Int64() == 0 {
		fmt.Println("\n⚠️  Rate is 0 - bot hasn't updated yet or contract not initialized")
		os.Exit(1)
	}
}
