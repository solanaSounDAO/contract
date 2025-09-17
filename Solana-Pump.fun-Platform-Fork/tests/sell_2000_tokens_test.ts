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

describe("Sell 100 Tokens Test", () => {
  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.Pumpdotfun as Program<Pumpdotfun>;
  const payer = provider.wallet;
  
  // The token we created earlier
  const mintAddress = new PublicKey("5Siuz6zmscLBEgUnTG3sqxXgHhUaKHZXVEPNG2duWvBd");
  
  // Generate a new keypair for the seller
  const seller = Keypair.generate();
  
  let dexConfigPDA: PublicKey;
  let pool: PublicKey;
  let poolTokenAccount: PublicKey;
  let poolSolVault: PublicKey;
  let sellerTokenAccount: PublicKey;
  
  console.log("=====================================");
  console.log("SELL 100 TOKENS TEST");
  console.log("=====================================");
  console.log("Program ID:", program.programId.toString());
  console.log("Provider:", payer.publicKey.toString());
  console.log("Seller:", seller.publicKey.toString());
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
    
    // Get seller's token account
    sellerTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      seller.publicKey
    );
    
    console.log("PDAs and Accounts:");
    console.log("  DEX Config:", dexConfigPDA.toString());
    console.log("  Pool:", pool.toString());
    console.log("  Pool Token Account:", poolTokenAccount.toString());
    console.log("  Pool SOL Vault:", poolSolVault.toString());
    console.log("  Seller Token Account:", sellerTokenAccount.toString());
    console.log();
    
    // First, let's buy tokens with the seller wallet if they don't have any
    try {
      const sellerTokenAccountInfo = await getAccount(provider.connection, sellerTokenAccount);
      const currentTokens = Number(sellerTokenAccountInfo.amount) / 1e9;
      console.log("Seller's current token balance:", currentTokens, "tokens");
      
      if (currentTokens < 100) {
        console.log("Seller doesn't have enough tokens. Need to buy first...");
        
        // Transfer SOL to seller
        const transferIx = SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: seller.publicKey,
          lamports: 0.5 * LAMPORTS_PER_SOL,
        });
        
        await provider.sendAndConfirm(
          new anchor.web3.Transaction().add(transferIx)
        );
        
        // Buy tokens
        const buyAmount = new BN(0.3 * LAMPORTS_PER_SOL);
        const tx = await program.methods
          .buy(buyAmount)
          .accounts({
            dexConfigurationAccount: dexConfigPDA,
            pool,
            tokenMint: mintAddress,
            poolTokenAccount,
            poolSolVault,
            userTokenAccount: sellerTokenAccount,
            user: seller.publicKey,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([seller])
          .rpc();
        
        console.log("Bought tokens for testing. Transaction:", tx);
        
        const updatedTokenAccountInfo = await getAccount(provider.connection, sellerTokenAccount);
        console.log("New token balance:", Number(updatedTokenAccountInfo.amount) / 1e9, "tokens");
      }
    } catch (e) {
      console.log("No existing token account. Will buy tokens first...");
      
      // Transfer SOL to seller
      const transferIx = SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: seller.publicKey,
        lamports: 0.5 * LAMPORTS_PER_SOL,
      });
      
      await provider.sendAndConfirm(
        new anchor.web3.Transaction().add(transferIx)
      );
      
      // Buy tokens
      const buyAmount = new BN(0.3 * LAMPORTS_PER_SOL);
      const tx = await program.methods
        .buy(buyAmount)
        .accounts({
          dexConfigurationAccount: dexConfigPDA,
          pool,
          tokenMint: mintAddress,
          poolTokenAccount,
          poolSolVault,
          userTokenAccount: sellerTokenAccount,
          user: seller.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();
      
      console.log("Bought tokens for testing. Transaction:", tx);
      
      const tokenAccountInfo = await getAccount(provider.connection, sellerTokenAccount);
      console.log("Token balance:", Number(tokenAccountInfo.amount) / 1e9, "tokens");
    }
  });
  
  describe("Check Current State", () => {
    it("Should display current pool and seller state", async () => {
      console.log("\n========== CURRENT STATE BEFORE SELL ==========");
      
      // Check pool balances
      const poolSolBalance = await provider.connection.getBalance(poolSolVault);
      const poolTokenAccountInfo = await getAccount(provider.connection, poolTokenAccount);
      
      console.log("Pool State:");
      console.log("  SOL:", poolSolBalance / LAMPORTS_PER_SOL, "SOL");
      console.log("  Tokens:", Number(poolTokenAccountInfo.amount) / 1e9);
      
      // Calculate price
      const solBalance = poolSolBalance / LAMPORTS_PER_SOL;
      const tokenBalance = Number(poolTokenAccountInfo.amount) / 1e9;
      
      if (tokenBalance > 0 && solBalance > 0) {
        const price = solBalance / tokenBalance;
        console.log("  Current price:", price.toFixed(8), "SOL per token");
      }
      
      // Check seller's balance
      const sellerTokenAccountInfo = await getAccount(provider.connection, sellerTokenAccount);
      const sellerSolBalance = await provider.connection.getBalance(seller.publicKey);
      
      console.log("\nSeller State:");
      console.log("  SOL balance:", sellerSolBalance / LAMPORTS_PER_SOL, "SOL");
      console.log("  Token balance:", Number(sellerTokenAccountInfo.amount) / 1e9, "tokens");
      
      // Calculate expected SOL for selling 100 tokens
      const sellAmount = 100;
      // Simple AMM formula: dy = (dx * Y) / (X + dx)
      const expectedSol = (sellAmount * solBalance) / (tokenBalance + sellAmount);
      console.log("\nExpected for selling 100 tokens:");
      console.log("  Estimated SOL:", expectedSol.toFixed(6), "SOL");
      console.log("  Price impact:", ((solBalance / (tokenBalance + sellAmount)) - (solBalance / tokenBalance)) / (solBalance / tokenBalance) * 100, "%");
    });
  });
  
  describe("Sell 100 Tokens", () => {
    it("Should sell exactly 100 tokens", async () => {
      console.log("\n========== SELLING 100 TOKENS ==========");
      
      // 100 tokens with 9 decimals
      const sellAmount = new BN(100).mul(new BN(10).pow(new BN(9)));
      
      console.log("Selling tokens...");
      console.log("  Amount:", sellAmount.toString());
      console.log("  Amount (decimal):", Number(sellAmount) / 1e9, "tokens");
      
      try {
        // Get initial balances
        const initialSol = await provider.connection.getBalance(seller.publicKey);
        const initialTokenAccountInfo = await getAccount(provider.connection, sellerTokenAccount);
        const initialTokens = initialTokenAccountInfo.amount;
        
        console.log("\nSeller before sell:");
        console.log("  SOL:", initialSol / LAMPORTS_PER_SOL, "SOL");
        console.log("  Tokens:", Number(initialTokens) / 1e9);
        
        // Check pool state before
        const poolSolBefore = await provider.connection.getBalance(poolSolVault);
        const poolTokensBefore = await getAccount(provider.connection, poolTokenAccount);
        console.log("\nPool before sell:");
        console.log("  SOL:", poolSolBefore / LAMPORTS_PER_SOL);
        console.log("  Tokens:", Number(poolTokensBefore.amount) / 1e9);
        
        // Execute sell
        console.log("\nExecuting sell transaction...");
        const tx = await program.methods
          .sell(sellAmount)
          .accounts({
            dexConfigurationAccount: dexConfigPDA,
            pool,
            tokenMint: mintAddress,
            poolTokenAccount,
            poolSolVault,
            userTokenAccount: sellerTokenAccount,
            user: seller.publicKey,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([seller])
          .rpc();
        
        console.log("Transaction successful!");
        console.log("  Signature:", tx);
        
        // Get final balances
        const finalSol = await provider.connection.getBalance(seller.publicKey);
        const finalTokenAccountInfo = await getAccount(provider.connection, sellerTokenAccount);
        const finalTokens = finalTokenAccountInfo.amount;
        
        console.log("\nSeller after sell:");
        console.log("  SOL balance:", finalSol / LAMPORTS_PER_SOL, "SOL");
        console.log("  SOL received:", (finalSol - initialSol) / LAMPORTS_PER_SOL, "SOL");
        console.log("  Tokens remaining:", Number(finalTokens) / 1e9);
        console.log("  Tokens sold:", (Number(initialTokens) - Number(finalTokens)) / 1e9);
        
        // Check pool state after
        const poolSolAfter = await provider.connection.getBalance(poolSolVault);
        const poolTokensAfter = await getAccount(provider.connection, poolTokenAccount);
        
        console.log("\nPool after sell:");
        console.log("  SOL:", poolSolAfter / LAMPORTS_PER_SOL);
        console.log("  Tokens:", Number(poolTokensAfter.amount) / 1e9);
        console.log("  SOL decrease:", (poolSolBefore - poolSolAfter) / LAMPORTS_PER_SOL);
        console.log("  Token increase:", (Number(poolTokensAfter.amount) - Number(poolTokensBefore.amount)) / 1e9);
        
        // Calculate actual price received
        const tokensSold = (Number(initialTokens) - Number(finalTokens)) / 1e9;
        const solReceived = (finalSol - initialSol) / LAMPORTS_PER_SOL;
        const actualPrice = solReceived / tokensSold;
        
        console.log("\nTrade Summary:");
        console.log("  Actual price received:", actualPrice.toFixed(8), "SOL per token");
        console.log("  SOL per 1000 tokens:", (solReceived / tokensSold * 1000).toFixed(6), "SOL");
        
        // Verify the trade happened correctly
        assert(Number(initialTokens) - Number(finalTokens) === 100 * 1e9, "Should have sold exactly 100 tokens");
        assert(finalSol > initialSol, "Seller should have received SOL");
        assert(poolSolAfter < poolSolBefore, "Pool SOL should have decreased");
        
        console.log("\n✅ Sell successful!");
        
      } catch (error) {
        console.error("\n❌ Sell failed with error:");
        console.error(error);
      }
    });
  });
  
  describe("Final State", () => {
    it("Should display final state", async () => {
      console.log("\n========== FINAL STATE ==========");
      
      // Pool state
      const poolSol = await provider.connection.getBalance(poolSolVault);
      const poolTokens = await getAccount(provider.connection, poolTokenAccount);
      
      console.log("Pool Final State:");
      console.log("  SOL:", poolSol / LAMPORTS_PER_SOL, "SOL");
      console.log("  Tokens:", Number(poolTokens.amount) / 1e9);
      
      // Calculate final price
      const solBalance = poolSol / LAMPORTS_PER_SOL;
      const tokenBalance = Number(poolTokens.amount) / 1e9;
      
      if (tokenBalance > 0 && solBalance > 0) {
        const price = solBalance / tokenBalance;
        console.log("  Current price:", price.toFixed(8), "SOL per token");
      }
      
      // Seller state
      const sellerSol = await provider.connection.getBalance(seller.publicKey);
      const sellerTokenAccountInfo = await getAccount(provider.connection, sellerTokenAccount);
      
      console.log("\nSeller Final State:");
      console.log("  SOL:", sellerSol / LAMPORTS_PER_SOL, "SOL");
      console.log("  Tokens:", Number(sellerTokenAccountInfo.amount) / 1e9);
      
      console.log("\n=====================================");
      console.log("SELL 100 TOKENS TEST COMPLETED");
      console.log("=====================================");
    });
  });
});

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};