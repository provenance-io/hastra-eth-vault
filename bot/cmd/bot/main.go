package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/hastra/nav-updater-bot/internal/bot"
	"github.com/hastra/nav-updater-bot/internal/config"
)

func main() {
	fmt.Println("Starting NAV Updater Bot...")

	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("❌ Config error: %v\n", err)
		os.Exit(1)
	}

	navBot, err := bot.New(cfg)
	if err != nil {
		fmt.Printf("❌ Failed to create bot: %v\n", err)
		os.Exit(1)
	}
	defer navBot.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigChan
		fmt.Println("\n🛑 Shutting down...")
		cancel()
	}()

	// Start
	if err := navBot.Start(ctx); err != nil {
		if err != context.Canceled {
			fmt.Printf("❌ Bot error: %v\n", err)
			os.Exit(1)
		}
	}
}
