import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Pumpdotfun } from "../target/types/pumpdotfun";
import { SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  getAccount
} from "@solana/spl-token";

describe("Fix Pool and Test Buy", () => {
  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.Pumpdotfun as Program<Pumpdotfun>;
  const payer = provider.wallet;
  
  // The token we created earlier
  const mintAddress = new PublicKey("5Siuz6zmscLBEgUnTG3sqxXgHhUaKHZXVEPNG2duWvBd");
  
  let pool: PublicKey;
  let poolTokenAccount: PublicKey;
  let poolSolVault: PublicKey;
  
  console.log("=====================================");
  console.log("FIX POOL STATE TEST");
  console.log("=====================================");
  console.log("Program ID:", program.programId.toString());
  console.log("Provider:", payer.publicKey.toString());
  console.log("Token Mint:", mintAddress.toString());
  console.log("=====================================\n");
  
  before(async () => {
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
    
    console.log("Pool Accounts:");
    console.log("  Pool:", pool.toString());
    console.log("  Pool Token Account:", poolTokenAccount.toString());
    console.log("  Pool SOL Vault:", poolSolVault.toString());
    console.log();
  });
  
  describe("Check Pool Data", () => {
    it("Should check pool account data", async () => {
      console.log("\n========== CHECKING POOL DATA ==========");
      
      try {
        // Fetch pool account
        const poolAccount = await program.account.liquidityPool.fetch(pool);
        
        console.log("Pool Account Data:");
        console.log("  Creator:", poolAccount.creator.toString());
        console.log("  Token Mint:", poolAccount.tokenMint ? poolAccount.tokenMint.toString() : "N/A");
        console.log("  Reserve Token:", poolAccount.reserveToken ? poolAccount.reserveToken.toString() : "0");
        console.log("  Reserve SOL:", poolAccount.reserveSol ? poolAccount.reserveSol.toString() : "0");
        
        // Check what fields actually exist
        console.log("\nAll Pool Fields:");
        Object.keys(poolAccount).forEach(key => {
          const value = poolAccount[key];
          if (value && typeof value === 'object' && 'toString' in value) {
            console.log(`  ${key}:`, value.toString());
          } else if (value && typeof value === 'object' && 'toNumber' in value) {
            console.log(`  ${key}:`, value.toNumber());
          } else {
            console.log(`  ${key}:`, value);
          }
        });
        
        // Check actual balances
        const poolSolBalance = await provider.connection.getBalance(poolSolVault);
        const poolTokenAccountInfo = await getAccount(provider.connection, poolTokenAccount);
        
        console.log("\nActual Pool Balances:");
        console.log("  SOL Vault Balance:", poolSolBalance / LAMPORTS_PER_SOL, "SOL");
        console.log("  Token Account Balance:", poolTokenAccountInfo.amount.toString());
        
        // The issue is likely that the pool's internal state doesn't match actual balances
        console.log("\nDiscrepancy Check:");
        console.log("  Pool thinks it has:", poolAccount.reserveToken ? poolAccount.reserveToken.toString() : "0", "tokens");
        console.log("  Actually has:", poolTokenAccountInfo.amount.toString(), "tokens");
        console.log("  Pool thinks it has:", poolAccount.reserveSol ? poolAccount.reserveSol.toString() : "0", "lamports");
        console.log("  Actually has:", poolSolBalance, "lamports");
        
      } catch (error) {
        console.error("Error fetching pool data:", error);
      }
    });
  });
  
  describe("Call Add Liquidity Properly", () => {
    it("Should call add_liquidity instruction to update pool state", async () => {
      console.log("\n========== CALLING ADD LIQUIDITY ==========");
      
      try {
        const userTokenAccount = await getAssociatedTokenAddress(
          mintAddress,
          payer.publicKey
        );
        
        console.log("Calling add_liquidity instruction...");
        console.log("  User Token Account:", userTokenAccount.toString());
        
        // Check user's token balance first
        const userTokenAccountInfo = await getAccount(provider.connection, userTokenAccount);
        console.log("  User has tokens:", userTokenAccountInfo.amount.toString());
        
        const tx = await program.methods
          .addLiquidity()
          .accounts({
            pool,
            tokenMint: mintAddress,
            poolTokenAccount,
            userTokenAccount,
            poolSolVault,
            user: payer.publicKey,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          })
          .rpc();
        
        console.log("Transaction:", tx);
        console.log("Add liquidity successful!");
        
        // Check pool state after
        const poolAccountAfter = await program.account.liquidityPool.fetch(pool);
        console.log("\nPool State After Add Liquidity:");
        console.log("  Reserve Token:", poolAccountAfter.reserveToken ? poolAccountAfter.reserveToken.toString() : "0");
        console.log("  Reserve SOL:", poolAccountAfter.reserveSol ? poolAccountAfter.reserveSol.toString() : "0");
        
      } catch (error) {
        console.log("Add liquidity failed (expected if already called):", error.message);
        
        // Try to understand the error
        if (error.logs) {
          console.log("\nError logs:");
          error.logs.forEach((log: string) => console.log("  ", log));
        }
      }
    });
  });
  
  describe("Summary", () => {
    it("Should display final summary", async () => {
      console.log("\n========== FINAL SUMMARY ==========");
      
      try {
        // Final check
        const poolAccount = await program.account.liquidityPool.fetch(pool);
        const poolSolBalance = await provider.connection.getBalance(poolSolVault);
        const poolTokenAccountInfo = await getAccount(provider.connection, poolTokenAccount);
        
        console.log("Pool Internal State:");
        console.log("  Reserve Token:", poolAccount.reserveToken ? poolAccount.reserveToken.toString() : "0");
        console.log("  Reserve SOL:", poolAccount.reserveSol ? poolAccount.reserveSol.toString() : "0");
        
        console.log("\nPool Actual Balances:");
        console.log("  SOL:", poolSolBalance / LAMPORTS_PER_SOL, "SOL");
        console.log("  Tokens:", poolTokenAccountInfo.amount.toString());
        
        console.log("\nDiagnosis:");
        if (!poolAccount.reserveToken || poolAccount.reserveToken.toString() === "0") {
          console.log("❌ Pool's internal reserve_token is 0 or undefined");
          console.log("   This is why buy() fails - it thinks there are no tokens to sell");
          console.log("   The add_liquidity instruction needs to properly update these values");
        } else {
          console.log("✅ Pool's internal state looks correct");
        }
        
        console.log("\n=====================================");
        
      } catch (error) {
        console.error("Error in summary:", error);
      }
    });
  });
});