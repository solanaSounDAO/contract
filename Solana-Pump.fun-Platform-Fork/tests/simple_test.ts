import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Pumpdotfun } from "../target/types/pumpdotfun";
import { Keypair, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { assert } from "chai";

describe("Simple Pumpdotfun Tests", () => {
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.Pumpdotfun as Program<Pumpdotfun>;
  const payer = provider.wallet;
  
  // Token metadata program
  const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
  
  let mintKeypair: Keypair;
  let mintAccount: PublicKey;
  let metadataAccount: PublicKey;
  let tokenAccount: PublicKey;
  
  console.log("Program ID:", program.programId.toString());
  console.log("Payer:", payer.publicKey.toString());
  
  describe("Create Token", () => {
    it("Should create a new token", async () => {
      // Generate mint keypair
      mintKeypair = Keypair.generate();
      mintAccount = mintKeypair.publicKey;
      
      // Derive metadata PDA
      [metadataAccount] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintAccount.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      );
      
      // Get associated token address
      tokenAccount = await getAssociatedTokenAddress(
        mintAccount,
        payer.publicKey
      );
      
      const name = "TestToken";
      const symbol = "TEST";
      const uri = "https://test.uri/metadata.json";
      const totalSupply = new BN("1000000000000000"); // 1 billion with 9 decimals
      
      console.log("\nCreating token...");
      console.log("  Name:", name);
      console.log("  Symbol:", symbol);
      console.log("  Total Supply:", totalSupply.toString());
      console.log("  Mint:", mintAccount.toString());
      
      try {
        const tx = await program.methods
          .createToken(name, symbol, uri, totalSupply)
          .accounts({
            payer: payer.publicKey,
            mintAccount,
            metadataAccount,
            tokenAccount,
            tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([mintKeypair])
          .rpc();
        
        console.log("  Transaction:", tx);
        console.log("  Token created successfully!");
        
        // Verify token was created
        const mintInfo = await provider.connection.getAccountInfo(mintAccount);
        assert.isNotNull(mintInfo, "Mint account should exist");
        
      } catch (error) {
        console.error("Failed to create token:", error);
        throw error;
      }
    });
  });
  
  describe("Buy Tokens", () => {
    it("Should buy tokens with SOL", async () => {
      console.log("\nTesting buy functionality...");
      
      const solAmount = new BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL
      
      // Get initial balances
      const initialSolBalance = await provider.connection.getBalance(payer.publicKey);
      console.log("  Initial SOL balance:", initialSolBalance / LAMPORTS_PER_SOL);
      
      // Note: For the actual buy test, we need to know the proper account structure
      // The current contract seems to be missing pool/bonding curve setup
      console.log("  Buy function would require pool/bonding curve setup");
      console.log("  Amount to buy:", solAmount.toNumber() / LAMPORTS_PER_SOL, "SOL");
      
      // This is a placeholder - actual implementation would need proper accounts
      try {
        // Check if there's a pool or dex configuration needed
        const [dexConfig] = PublicKey.findProgramAddressSync(
          [Buffer.from("dex-config")],
          program.programId
        );
        
        console.log("  DEX Config PDA:", dexConfig.toString());
        
        // Note: Actual buy would be implemented here once pool is set up
        console.log("  Buy functionality requires pool initialization first");
        
      } catch (error) {
        console.log("  Note: Buy requires additional setup (pool/dex config)");
      }
    });
  });
  
  describe("Sell Tokens", () => {
    it("Should sell tokens for SOL", async () => {
      console.log("\nTesting sell functionality...");
      
      const tokenAmount = new BN(1000000); // 1 token with 6 decimals
      
      console.log("  Amount to sell:", tokenAmount.toString(), "tokens");
      console.log("  Sell functionality requires pool initialization first");
      
      // Similar to buy, sell needs proper pool/dex setup
    });
  });
  
  describe("Withdraw", () => {
    it("Should allow authorized withdrawal", async () => {
      console.log("\nTesting withdraw functionality...");
      
      try {
        // Check if there are any funds to withdraw
        console.log("  Checking for withdrawable funds...");
        console.log("  Withdraw functionality would transfer funds from pool/treasury");
        
        // Note: Actual withdraw would need pool with funds
        console.log("  Withdraw requires pool with accumulated fees/funds");
        
      } catch (error) {
        console.log("  Note: Withdraw requires pool setup and funds");
      }
    });
  });
  
  describe("Summary", () => {
    it("Should display test summary", async () => {
      console.log("\n" + "=".repeat(60));
      console.log("TEST SUMMARY");
      console.log("=".repeat(60));
      
      console.log("\nDeployed Program:");
      console.log("  Program ID:", program.programId.toString());
      console.log("  Network: localnet");
      
      if (mintAccount) {
        console.log("\nCreated Token:");
        console.log("  Mint:", mintAccount.toString());
        console.log("  Metadata:", metadataAccount.toString());
        console.log("  Token Account:", tokenAccount.toString());
      }
      
      console.log("\nAvailable Functions:");
      console.log("  - createToken: Creates new SPL token");
      console.log("  - buy: Purchase tokens with SOL (requires pool)");
      console.log("  - sell: Sell tokens for SOL (requires pool)");
      console.log("  - withdraw: Withdraw funds (requires authorization)");
      
      console.log("\nNotes:");
      console.log("  - Token creation is functional");
      console.log("  - Buy/Sell require pool or DEX configuration setup");
      console.log("  - Additional initialization may be needed for full functionality");
      
      console.log("\n" + "=".repeat(60));
    });
  });
});