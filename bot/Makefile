.PHONY: build run clean bindings

bindings:
	@echo "Generating contract bindings..."
	@mkdir -p pkg/contracts
	@cd .. && npx hardhat compile --quiet
	@abigen --combined-json ../artifacts/contracts/chainlink/HastraNavEngine.sol/HastraNavEngine.json --pkg contracts --type NavEngine --out pkg/contracts/navengine.go
	@echo "✅ Bindings generated at pkg/contracts/navengine.go"

build:
	@echo "Building bot..."
	@mkdir -p bin
	@go build -o bin/nav-bot cmd/bot/main.go
	@echo "✅ Built to bin/nav-bot"

run: build
	@cd .. && bot/bin/nav-bot

clean:
	@rm -rf bin/ pkg/contracts/
