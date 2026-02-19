package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	PrivateKey       string
	RPCUrl           string
	ChainID          int64
	NavEngineAddress string
	VaultAddress     string // Unused - kept for compatibility
	UpdateInterval   int64
	GasLimit         uint64
	MaxGasPriceGwei  int64
}

func Load() (*Config, error) {
	// Try to load .env from parent directory (project root)
	rootEnv := filepath.Join("..", ".env")
	_ = godotenv.Load(rootEnv)

	privateKey := os.Getenv("PRIVATE_KEY")
	// Strip 0x prefix if present
	privateKey = strings.TrimPrefix(privateKey, "0x")

	cfg := &Config{
		PrivateKey:       privateKey,
		RPCUrl:           getEnv("RPC_URL", "https://ethereum-hoodi-rpc.publicnode.com"),
		ChainID:          getEnvInt64("CHAIN_ID", 560048),
		NavEngineAddress: os.Getenv("NAV_ENGINE_ADDRESS"),
		VaultAddress:     "", // Not used - bot uses mock values
		UpdateInterval:   getEnvInt64("UPDATE_INTERVAL", 3600),
		GasLimit:         uint64(getEnvInt64("GAS_LIMIT", 500000)),
		MaxGasPriceGwei:  getEnvInt64("MAX_GAS_PRICE_GWEI", 50),
	}

	if cfg.PrivateKey == "" {
		return nil, fmt.Errorf("PRIVATE_KEY is required")
	}
	if cfg.NavEngineAddress == "" {
		return nil, fmt.Errorf("NAV_ENGINE_ADDRESS is required")
	}

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt64(key string, defaultValue int64) int64 {
	valueStr := os.Getenv(key)
	if valueStr == "" {
		return defaultValue
	}
	value, err := strconv.ParseInt(valueStr, 10, 64)
	if err != nil {
		return defaultValue
	}
	return value
}
