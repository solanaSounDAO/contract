import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Pumpdotfun } from "../target/types/pumpdotfun";
import { Keypair, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  getAccount
} from "@solana/spl-token";

describe("Buy and Sell Test", () => {
  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.Pumpdotfun as Program<Pumpdotfun>;
  const payer = provider.wallet;
  
  // The token we created earlier
  const mintAddress = new PublicKey("5Siuz6zmscLBEgUnTG3sqxXgHhUaKHZXVEPNG2duWvBd");
  
  // Test buyer/seller
  const testUser = Keypair.generate();
  
  let dexConfigPDA: PublicKey;
  let pool: PublicKey;
  let poolTokenAccount: PublicKey;
  let poolSolVault: PublicKey;
  let testUserTokenAccount: PublicKey;
  
  console.log("=====================================");
  console.log("BUY AND SELL TEST - DEVNET");
  console.log("=====================================");
  console.log("Program ID:", program.programId.toString());
  console.log("Provider:", payer.publicKey.toString());
  console.log("Test User:", testUser.publicKey.toString());
  console.log("Token Mint:", mintAddress.toString());
  console.log("=====================================\n");
  
  before(async () => {
    // Derive DEX config PDA
    [dexConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("CurveConfiguration")],
      program.programId
    );
    
    // Derive pool PDA
    [pool] = PublicKey.findProgramAddressSync(
      [Buffer.from("liquidity_pool"), mintAddress.toBuffer()],
      program.programId
    );
    
    // Get pool's associated token account
    poolTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      pool,
      true
    );
    
    // Derive pool SOL vault
    [poolSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("liquidity_sol_vault"), mintAddress.toBuffer()],
      program.programId
    );
    
    // Get test user's token account
    testUserTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      testUser.publicKey
    );
    
    console.log("Accounts:");
    console.log("  DEX Config:", dexConfigPDA.toString());
    console.log("  Pool:", pool.toString());
    console.log("  Pool Token Account:", poolTokenAccount.toString());
    console.log("  Pool SOL Vault:", poolSolVault.toString());
    console.log("  Test User Token Account:", testUserTokenAccount.toString());
    console.log();
    
    // Airdrop SOL to test user
    console.log("Requesting airdrop for test user...");
    try {
      const signature = await provider.connection.requestAirdrop(
        testUser.publicKey,
        1 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(signature);
      console.log("Airdrop successful!");
    } catch (e) {
      console.log("Airdrop failed (rate limited), transferring SOL from main wallet...");
      
      // Transfer SOL from main wallet
      const transferIx = SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: testUser.publicKey,
        lamports: 1 * LAMPORTS_PER_SOL,
      });
      
      const tx = await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(transferIx)
      );
      console.log("Transfer successful!");
    }
  });
  
  describe("Check Pool State", () => {
    it("Should display current pool state", async () => {
      console.log("\n========== CURRENT POOL STATE ==========");
      
      try {
        // Check pool balances
        const poolSolBalance = await provider.connection.getBalance(poolSolVault);
        const poolTokenAccountInfo = await getAccount(provider.connection, poolTokenAccount);
        
        console.log("Pool Balances:");
        console.log("  SOL:", poolSolBalance / LAMPORTS_PER_SOL, "SOL");
        console.log("  Tokens:", poolTokenAccountInfo.amount.toString());
        
        // Calculate implied price
        const solBalance = poolSolBalance / LAMPORTS_PER_SOL;
        const tokenBalance = Number(poolTokenAccountInfo.amount) / 1e9; // 9 decimals
        
        if (tokenBalance > 0) {
          const price = solBalance / tokenBalance;
          console.log("  Implied price:", price.toFixed(8), "SOL per token");
        }
        
        // Check test user balance
        const testUserSol = await provider.connection.getBalance(testUser.publicKey);
        console.log("\nTest User Balance:");
        console.log("  SOL:", testUserSol / LAMPORTS_PER_SOL, "SOL");
        
      } catch (error) {
        console.error("Error checking pool state:", error);
      }
    });
  });
  
  describe("Buy Tokens", () => {
    it("Should buy tokens with SOL", async () => {
      console.log("\n========== BUY TOKENS ==========");
      
      const buyAmount = new BN(0.05 * LAMPORTS_PER_SOL); // Buy with 0.05 SOL
      
      console.log("Buying tokens...");
      console.log("  SOL Amount:", buyAmount.toNumber() / LAMPORTS_PER_SOL, "SOL");
      
      try {
        // Get initial balances
        const initialSol = await provider.connection.getBalance(testUser.publicKey);
        console.log("  Initial SOL balance:", initialSol / LAMPORTS_PER_SOL, "SOL");
        
        // Execute buy
        const tx = await program.methods
          .buy(buyAmount)
          .accounts({
            dexConfigurationAccount: dexConfigPDA,
            pool,
            tokenMint: mintAddress,
            poolTokenAccount,
            poolSolVault,
            userTokenAccount: testUserTokenAccount,
            user: testUser.publicKey,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([testUser])
          .rpc();
        
        console.log("Transaction:", tx);
        console.log("Buy successful!");
        
        // Get final balances
        const finalSol = await provider.connection.getBalance(testUser.publicKey);
        const tokenAccountInfo = await getAccount(provider.connection, testUserTokenAccount);
        
        console.log("\nResults:");
        console.log("  Final SOL balance:", finalSol / LAMPORTS_PER_SOL, "SOL");
        console.log("  SOL spent:", (initialSol - finalSol) / LAMPORTS_PER_SOL, "SOL");
        console.log("  Tokens received:", tokenAccountInfo.amount.toString());
        console.log("  Tokens (decimal):", Number(tokenAccountInfo.amount) / 1e9);
        
        // Check pool state after buy
        const poolSolAfter = await provider.connection.getBalance(poolSolVault);
        const poolTokensAfter = await getAccount(provider.connection, poolTokenAccount);
        
        console.log("\nPool after buy:");
        console.log("  SOL:", poolSolAfter / LAMPORTS_PER_SOL, "SOL");
        console.log("  Tokens:", poolTokensAfter.amount.toString());
        
      } catch (error) {
        console.error("Error buying tokens:", error);
        throw error;
      }
    });
  });
  
  describe("Sell Tokens", () => {
    it("Should sell tokens for SOL", async () => {
      console.log("\n========== SELL TOKENS ==========");
      
      try {
        // Get current token balance
        const tokenAccountInfo = await getAccount(provider.connection, testUserTokenAccount);
        const currentBalance = tokenAccountInfo.amount;
        
        if (currentBalance === BigInt(0)) {
          console.log("No tokens to sell, skipping...");
          return;
        }
        
        // Sell half of the tokens
        const sellAmount = new BN(currentBalance.toString()).div(new BN(2));
        
        console.log("Selling tokens...");
        console.log("  Current balance:", currentBalance.toString());
        console.log("  Selling:", sellAmount.toString(), "tokens");
        console.log("  Selling (decimal):", sellAmount.toNumber() / 1e9, "tokens");
        
        // Get initial SOL balance
        const initialSol = await provider.connection.getBalance(testUser.publicKey);
        
        // Execute sell
        const tx = await program.methods
          .sell(sellAmount)
          .accounts({
            dexConfigurationAccount: dexConfigPDA,
            pool,
            tokenMint: mintAddress,
            poolTokenAccount,
            poolSolVault,
            userTokenAccount: testUserTokenAccount,
            user: testUser.publicKey,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([testUser])
          .rpc();
        
        console.log("Transaction:", tx);
        console.log("Sell successful!");
        
        // Get final balances
        const finalSol = await provider.connection.getBalance(testUser.publicKey);
        const finalTokens = await getAccount(provider.connection, testUserTokenAccount);
        
        console.log("\nResults:");
        console.log("  SOL received:", (finalSol - initialSol) / LAMPORTS_PER_SOL, "SOL");
        console.log("  Remaining tokens:", finalTokens.amount.toString());
        console.log("  Remaining (decimal):", Number(finalTokens.amount) / 1e9);
        
        // Check pool state after sell
        const poolSolAfter = await provider.connection.getBalance(poolSolVault);
        const poolTokensAfter = await getAccount(provider.connection, poolTokenAccount);
        
        console.log("\nPool after sell:");
        console.log("  SOL:", poolSolAfter / LAMPORTS_PER_SOL, "SOL");
        console.log("  Tokens:", poolTokensAfter.amount.toString());
        
      } catch (error) {
        console.error("Error selling tokens:", error);
        throw error;
      }
    });
  });
  
  describe("Final Summary", () => {
    it("Should display final summary", async () => {
      console.log("\n========== FINAL SUMMARY ==========");
      
      try {
        // Final pool state
        const poolSol = await provider.connection.getBalance(poolSolVault);
        const poolTokens = await getAccount(provider.connection, poolTokenAccount);
        
        console.log("Final Pool State:");
        console.log("  SOL:", poolSol / LAMPORTS_PER_SOL, "SOL");
        console.log("  Tokens:", poolTokens.amount.toString());
        
        // Calculate final price
        const solBalance = poolSol / LAMPORTS_PER_SOL;
        const tokenBalance = Number(poolTokens.amount) / 1e9;
        
        if (tokenBalance > 0) {
          const price = solBalance / tokenBalance;
          console.log("  Implied price:", price.toFixed(8), "SOL per token");
        }
        
        // Test user final state
        const userSol = await provider.connection.getBalance(testUser.publicKey);
        const userTokens = await getAccount(provider.connection, testUserTokenAccount);
        
        console.log("\nTest User Final State:");
        console.log("  SOL:", userSol / LAMPORTS_PER_SOL, "SOL");
        console.log("  Tokens:", userTokens.amount.toString());
        console.log("  Tokens (decimal):", Number(userTokens.amount) / 1e9);
        
        console.log("\n=====================================");
        console.log("BUY/SELL TEST COMPLETED SUCCESSFULLY!");
        console.log("=====================================");
        
      } catch (error) {
        console.error("Error in final summary:", error);
      }
    });
  });
});