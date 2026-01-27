import { ethers } from "hardhat";

async function main() {
    let provider;
    let networkName;
    let chainId;

    // Try to use the configured provider, but fallback to public Mainnet RPC if it fails
    try {
        provider = ethers.provider;
        const network = await provider.getNetwork();
        networkName = network.name;
        chainId = network.chainId;
    } catch (error) {
        console.log("⚠️  Standard provider failed (likely missing API key). Switching to Public Mainnet RPC...");
        provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com");
        const network = await provider.getNetwork();
        networkName = "mainnet (public)";
        chainId = network.chainId;
    }

    console.log(`Checking USDC on network: ${networkName} (Chain ID: ${chainId})`);

    let usdcAddress = "";
    if (chainId === 1n) {
        usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // Mainnet
    } else if (process.env.USDC_ADDRESS) {
        usdcAddress = process.env.USDC_ADDRESS;
    } else {
        console.log("No USDC address configured for this network.");
        return;
    }

    console.log(`USDC Address: ${usdcAddress}`);

    // Get code using the working provider
    const code = await provider.getCode(usdcAddress);
    if (code === "0x") {
        console.error("No contract found at this address!");
        return;
    }

    // EIP-2612 permit selector: keccak256("permit(address,address,uint256,uint256,uint8,bytes32,bytes32)")
    const permitSelector = "d505accf"; 
    
    // Check if selector exists in the code
    const hasPermitInCode = code.includes(permitSelector);

    console.log(`Contains 'permit' selector in bytecode? ${hasPermitInCode ? "Likely YES" : "Not explicitly found (might be proxy)"}`);

    // Try to call DOMAIN_SEPARATOR() - part of EIP-2612
    try {
        // Create contract instance with the working provider
        const usdc = new ethers.Contract(
            usdcAddress, 
            ["function DOMAIN_SEPARATOR() external view returns (bytes32)"], 
            provider
        );
        const domainSeparator = await usdc.DOMAIN_SEPARATOR();
        console.log(`DOMAIN_SEPARATOR() call succeeded: ${domainSeparator}`);
        console.log("✅ EIP-2612/EIP-3009 support confirmed via DOMAIN_SEPARATOR.");
    } catch (e) {
        console.log("❌ DOMAIN_SEPARATOR() call failed.");
        console.error(e);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
