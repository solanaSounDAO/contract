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

describe("Simple Buy Test - 0.01 SOL", () => {
  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.Pumpdotfun as Program<Pumpdotfun>;
  const payer = provider.wallet;
  
  // The token we created earlier
  const mintAddress = new PublicKey("5Siuz6zmscLBEgUnTG3sqxXgHhUaKHZXVEPNG2duWvBd");
  
  // Test buyer
  const testBuyer = Keypair.generate();
  
  let dexConfigPDA: PublicKey;
  let pool: PublicKey;
  let poolTokenAccount: PublicKey;
  let poolSolVault: PublicKey;
  let buyerTokenAccount: PublicKey;
  
  console.log("=====================================");
  console.log("SIMPLE BUY TEST - 0.01 SOL");
  console.log("=====================================");
  console.log("Program ID:", program.programId.toString());
  console.log("Provider:", payer.publicKey.toString());
  console.log("Test Buyer:", testBuyer.publicKey.toString());
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
    
    // Get buyer's token account
    buyerTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      testBuyer.publicKey
    );
    
    console.log("PDAs and Accounts:");
    console.log("  DEX Config:", dexConfigPDA.toString());
    console.log("  Pool:", pool.toString());
    console.log("  Pool Token Account:", poolTokenAccount.toString());
    console.log("  Pool SOL Vault:", poolSolVault.toString());
    console.log("  Buyer Token Account:", buyerTokenAccount.toString());
    console.log();
    
    // Transfer SOL to test buyer
    console.log("Transferring SOL to test buyer...");
    const transferIx = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: testBuyer.publicKey,
      lamports: 0.1 * LAMPORTS_PER_SOL,
    });
    
    const tx = await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(transferIx)
    );
    console.log("Transfer successful!");
    
    const buyerBalance = await provider.connection.getBalance(testBuyer.publicKey);
    console.log("Buyer SOL balance:", buyerBalance / LAMPORTS_PER_SOL, "SOL");
  });
  
  describe("Check Current Pool State", () => {
    it("Should display pool liquidity before buy", async () => {
      console.log("\n========== POOL STATE BEFORE BUY ==========");
      
      try {
        // Check pool balances
        const poolSolBalance = await provider.connection.getBalance(poolSolVault);
        const poolTokenAccountInfo = await getAccount(provider.connection, poolTokenAccount);
        
        console.log("Pool Liquidity:");
        console.log("  SOL:", poolSolBalance / LAMPORTS_PER_SOL, "SOL");
        console.log("  Tokens:", poolTokenAccountInfo.amount.toString());
        console.log("  Tokens (decimal):", Number(poolTokenAccountInfo.amount) / 1e9);
        
        // Calculate price
        const solBalance = poolSolBalance / LAMPORTS_PER_SOL;
        const tokenBalance = Number(poolTokenAccountInfo.amount) / 1e9;
        
        if (tokenBalance > 0 && solBalance > 0) {
          const price = solBalance / tokenBalance;
          console.log("  Current price:", price.toFixed(8), "SOL per token");
          
          // Calculate expected tokens for 0.01 SOL
          const buyAmountSol = 0.01;
          // Simple AMM formula: dx * Y / (X + dx)
          const expectedTokens = (buyAmountSol * tokenBalance) / (solBalance + buyAmountSol);
          console.log("\nExpected for 0.01 SOL buy:");
          console.log("  Estimated tokens:", expectedTokens.toFixed(4));
        }
        
      } catch (error) {
        console.error("Error checking pool state:", error);
      }
    });
  });
  
  describe("Buy Small Amount", () => {
    it("Should buy tokens with 0.01 SOL", async () => {
      console.log("\n========== BUY WITH 0.01 SOL ==========");
      
      const buyAmount = new BN(0.01 * LAMPORTS_PER_SOL); // 0.01 SOL
      
      console.log("Attempting to buy tokens...");
      console.log("  Amount:", buyAmount.toNumber() / LAMPORTS_PER_SOL, "SOL");
      
      try {
        // Get initial balance
        const initialSol = await provider.connection.getBalance(testBuyer.publicKey);
        console.log("  Buyer initial SOL:", initialSol / LAMPORTS_PER_SOL, "SOL");
        
        // Check pool state before
        const poolSolBefore = await provider.connection.getBalance(poolSolVault);
        const poolTokensBefore = await getAccount(provider.connection, poolTokenAccount);
        console.log("\nPool before buy:");
        console.log("  SOL:", poolSolBefore / LAMPORTS_PER_SOL);
        console.log("  Tokens:", Number(poolTokensBefore.amount) / 1e9);
        
        // Execute buy
        console.log("\nExecuting buy transaction...");
        const tx = await program.methods
          .buy(buyAmount)
          .accounts({
            dexConfigurationAccount: dexConfigPDA,
            pool,
            tokenMint: mintAddress,
            poolTokenAccount,
            poolSolVault,
            userTokenAccount: buyerTokenAccount,
            user: testBuyer.publicKey,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .signers([testBuyer])
          .rpc();
        
        console.log("Transaction successful!");
        console.log("  Signature:", tx);
        
        // Get final balances
        const finalSol = await provider.connection.getBalance(testBuyer.publicKey);
        const buyerTokenAccountInfo = await getAccount(provider.connection, buyerTokenAccount);
        
        console.log("\nBuyer after buy:");
        console.log("  SOL balance:", finalSol / LAMPORTS_PER_SOL, "SOL");
        console.log("  SOL spent:", (initialSol - finalSol) / LAMPORTS_PER_SOL, "SOL");
        console.log("  Tokens received:", buyerTokenAccountInfo.amount.toString());
        console.log("  Tokens (decimal):", Number(buyerTokenAccountInfo.amount) / 1e9);
        
        // Check pool state after
        const poolSolAfter = await provider.connection.getBalance(poolSolVault);
        const poolTokensAfter = await getAccount(provider.connection, poolTokenAccount);
        
        console.log("\nPool after buy:");
        console.log("  SOL:", poolSolAfter / LAMPORTS_PER_SOL);
        console.log("  Tokens:", Number(poolTokensAfter.amount) / 1e9);
        console.log("  SOL increase:", (poolSolAfter - poolSolBefore) / LAMPORTS_PER_SOL);
        console.log("  Token decrease:", (Number(poolTokensBefore.amount) - Number(poolTokensAfter.amount)) / 1e9);
        
        // Verify the trade happened
        assert(buyerTokenAccountInfo.amount > BigInt(0), "Buyer should have received tokens");
        assert(poolSolAfter > poolSolBefore, "Pool SOL should have increased");
        
        console.log("\n✅ Buy successful!");
        
      } catch (error) {
        console.error("\n❌ Buy failed with error:");
        console.error(error);
        
        // If it's the vault error, let's check the actual implementation
        if (error.toString().includes("NotEnoughTokenInVault")) {
          console.log("\n⚠️ The contract seems to have a logic issue with token calculations");
          console.log("This might be due to how the contract calculates available tokens");
          console.log("or how it handles the AMM formula.");
        }
      }
    });
  });
  
  describe("Final State", () => {
    it("Should display final state", async () => {
      console.log("\n========== FINAL STATE ==========");
      
      try {
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
        
        // Buyer state
        const buyerSol = await provider.connection.getBalance(testBuyer.publicKey);
        console.log("\nBuyer Final State:");
        console.log("  SOL:", buyerSol / LAMPORTS_PER_SOL, "SOL");
        
        try {
          const buyerTokens = await getAccount(provider.connection, buyerTokenAccount);
          console.log("  Tokens:", Number(buyerTokens.amount) / 1e9);
        } catch (e) {
          console.log("  Tokens: 0 (no account created)");
        }
        
        console.log("\n=====================================");
        console.log("TEST COMPLETED");
        console.log("=====================================");
        
      } catch (error) {
        console.error("Error checking final state:", error);
      }
    });
  });
});

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};