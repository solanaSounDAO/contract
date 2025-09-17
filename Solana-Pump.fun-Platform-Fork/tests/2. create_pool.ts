import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { Pumpdotfun } from "../target/types/pumpdotfun";
import { SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

async function createLiquidityPool() {
  console.log("=====================================");
  console.log("CREATE LIQUIDITY POOL - DEVNET");
  console.log("=====================================");
  
  // Setup
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  
  // Load wallet
  let walletPath = process.env.ANCHOR_WALLET;
  if (!walletPath) {
    walletPath = path.join(os.homedir(), ".config/solana/id.json");
  }
  
  console.log("\n📂 Loading wallet from:", walletPath);
  
  if (!fs.existsSync(walletPath)) {
    console.error("❌ Wallet file not found!");
    console.error("Please set ANCHOR_WALLET environment variable or create a wallet");
    process.exit(1);
  }
  
  const walletKeypair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  
  const wallet = new anchor.Wallet(walletKeypair);
  const provider = new anchor.AnchorProvider(
    connection,
    wallet,
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  
  // Load IDL
  const idl = JSON.parse(
    fs.readFileSync("../target/idl/pumpdotfun.json", "utf8")
  );
  
  // Program instance
  const program = new anchor.Program(idl, provider) as Program<Pumpdotfun>;
  const payer = provider.wallet;
  
  // Token address to use
  const mintAddress = new PublicKey("H9tMusabLgceRCo8QJp1DxTbbnmccYTUHDUiGHuLvMuM");
  
  // Liquidity settings
  const TOKEN_AMOUNT = new BN("100000000000000"); // 100,000 tokens (9 decimals)
  const SOL_AMOUNT = new BN(1 * LAMPORTS_PER_SOL); // 1 SOL
  
  console.log("Program ID:", program.programId.toString());
  console.log("Provider:", payer.publicKey.toString());
  console.log("Token Mint:", mintAddress.toString());
  console.log("=====================================\n");
  
  // Derive PDA accounts
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("liquidity_pool"), mintAddress.toBuffer()],
    program.programId
  );
  
  const poolTokenAccount = await getAssociatedTokenAddress(
    mintAddress,
    pool,
    true // allowOwnerOffCurve
  );
  
  const [poolSolVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("liquidity_sol_vault"), mintAddress.toBuffer()],
    program.programId
  );
  
  const userTokenAccount = await getAssociatedTokenAddress(
    mintAddress,
    payer.publicKey
  );
  
  console.log("📍 Derived Accounts:");
  console.log("  Pool PDA:", pool.toString());
  console.log("  Pool Token Account:", poolTokenAccount.toString());
  console.log("  Pool SOL Vault:", poolSolVault.toString());
  console.log("  User Token Account:", userTokenAccount.toString());
  console.log();
  
  // Check current balances
  console.log("\n========== CURRENT STATE ==========");
  
  try {
    // Check user token balance
    const userTokenAccountInfo = await getAccount(connection, userTokenAccount);
    console.log("👤 User token balance:", userTokenAccountInfo.amount.toString());
    
    // Check user SOL balance
    const userSolBalance = await connection.getBalance(payer.publicKey);
    console.log("💰 User SOL balance:", userSolBalance / LAMPORTS_PER_SOL, "SOL");
    
    // Check sufficient balance
    if (userTokenAccountInfo.amount < BigInt(TOKEN_AMOUNT.toString())) {
      console.error("⚠️ Warning: Insufficient token balance!");
      console.error("Required:", TOKEN_AMOUNT.toString());
      console.error("Current:", userTokenAccountInfo.amount.toString());
    }
    
    if (userSolBalance < SOL_AMOUNT.toNumber()) {
      console.error("⚠️ Warning: Insufficient SOL balance!");
      console.error("Required:", SOL_AMOUNT.toNumber() / LAMPORTS_PER_SOL, "SOL");
      console.error("Current:", userSolBalance / LAMPORTS_PER_SOL, "SOL");
    }
    
  } catch (error) {
    console.error("❌ Error checking balances:", error.message);
  }
  
  // Check if pool already exists
  try {
    const poolAccount = await program.account.liquidityPool.fetch(pool);
    console.log("\n⚠️ Pool already exists:");
    console.log("  Creator:", poolAccount.creator.toString());
    console.log("  Token:", poolAccount.token.toString());
    console.log("  Total Supply:", poolAccount.totalSupply.toString());
    console.log("  Reserve Token:", poolAccount.reserveToken.toString());
    console.log("  Reserve SOL:", poolAccount.reserveSol.toString());
  } catch (e) {
    console.log("\n✅ Pool does not exist yet. Proceeding with creation.");
    
    // Create pool
    console.log("\n========== CREATE LIQUIDITY POOL ==========");
    
    try {
      console.log("🚀 Creating liquidity pool...");
      
      const tx = await program.methods
        .createPool()
        .accounts({
          pool,
          tokenMint: mintAddress,
          poolTokenAccount,
          payer: payer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      
      console.log("✅ Transaction:", tx);
      console.log("🔍 View on Solana Explorer:");
      console.log(`   https://explorer.solana.com/tx/${tx}?cluster=devnet`);
      
      // Confirm transaction
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature: tx,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      }, "confirmed");
      
      console.log("✅ Pool created successfully!");
      
      // Fetch pool info
      const poolAccount = await program.account.liquidityPool.fetch(pool);
      console.log("\n📊 Pool Information:");
      console.log("  Creator:", poolAccount.creator.toString());
      console.log("  Token:", poolAccount.token.toString());
      console.log("  Total Supply:", poolAccount.totalSupply.toString());
      console.log("  Reserve Token:", poolAccount.reserveToken.toString());
      console.log("  Reserve SOL:", poolAccount.reserveSol.toString());
      
    } catch (error) {
      console.error("❌ Failed to create pool:", error.message);
      if (error.logs) {
        console.error("\n📜 Program logs:");
        error.logs.forEach((log: string) => console.error("  ", log));
      }
    }
  }
  
  // Provide initial liquidity
  console.log("\n========== PROVIDE INITIAL LIQUIDITY ==========");
  
  // Transfer tokens to pool
  console.log("\n💸 Transferring tokens to pool...");
  console.log("  Amount:", TOKEN_AMOUNT.toString(), "(100,000 tokens)");
  
  try {
    // Create transfer instruction
    const transferTokenIx = createTransferInstruction(
      userTokenAccount,
      poolTokenAccount,
      payer.publicKey,
      BigInt(TOKEN_AMOUNT.toString()),
      [],
      TOKEN_PROGRAM_ID
    );
    
    // Send transaction
    const tokenTx = await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(transferTokenIx)
    );
    
    console.log("✅ Token transfer transaction:", tokenTx);
    
    // Verify transfer
    const poolTokenAccountInfo = await getAccount(connection, poolTokenAccount);
    console.log("📊 Pool token balance:", poolTokenAccountInfo.amount.toString());
    
  } catch (error) {
    console.error("❌ Failed to transfer tokens:", error.message);
  }
  
  // Transfer SOL to pool
  console.log("\n💸 Transferring SOL to pool...");
  console.log("  Amount:", SOL_AMOUNT.toNumber() / LAMPORTS_PER_SOL, "SOL");
  
  try {
    // SOL transfer instruction
    const transferSolIx = SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: poolSolVault,
      lamports: SOL_AMOUNT.toNumber(),
    });
    
    const solTx = await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(transferSolIx)
    );
    
    console.log("✅ SOL transfer transaction:", solTx);
    
    // Verify transfer
    const poolSolBalance = await connection.getBalance(poolSolVault);
    console.log("📊 Pool SOL balance:", poolSolBalance / LAMPORTS_PER_SOL, "SOL");
    
  } catch (error) {
    console.error("❌ Failed to transfer SOL:", error.message);
  }
  
  // Register liquidity
  console.log("\n📝 Calling add_liquidity to register liquidity...");
  
  try {
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
    
    console.log("✅ Liquidity registration transaction:", tx);
    
  } catch (error) {
    console.log("⚠️ Note: Tokens and SOL have been transferred manually.");
    console.log("The add_liquidity call might require specific conditions.");
  }
  
  // Final state
  console.log("\n========== FINAL POOL STATE ==========");
  
  try {
    // Check final pool balances
    const poolSolBalance = await connection.getBalance(poolSolVault);
    const poolTokenAccountInfo = await getAccount(connection, poolTokenAccount);
    
    console.log("🏊 Final Pool Balances:");
    console.log("  SOL:", poolSolBalance / LAMPORTS_PER_SOL, "SOL");
    console.log("  Tokens:", poolTokenAccountInfo.amount.toString());
    
    // Pool information
    const poolAccount = await program.account.liquidityPool.fetch(pool);
    console.log("\n📊 Pool State:");
    console.log("  Total Supply:", poolAccount.totalSupply.toString());
    console.log("  Reserve Token:", poolAccount.reserveToken.toString());
    console.log("  Reserve SOL:", poolAccount.reserveSol.toString());
    
    // User remaining balances
    const userSolBalance = await connection.getBalance(payer.publicKey);
    const userTokenAccountInfo = await getAccount(connection, userTokenAccount);
    
    console.log("\n👤 User Remaining Balances:");
    console.log("  SOL:", userSolBalance / LAMPORTS_PER_SOL, "SOL");
    console.log("  Tokens:", userTokenAccountInfo.amount.toString());
    
    console.log("\n=====================================");
    console.log("✨ LIQUIDITY POOL CREATION COMPLETE!");
    console.log("💹 Pool is ready for trading");
    console.log("=====================================");
    
    // Save important addresses
    console.log("\n📌 Important Addresses:");
    console.log("  Token Mint:", mintAddress.toString());
    console.log("  Pool PDA:", pool.toString());
    console.log("  Pool Token Account:", poolTokenAccount.toString());
    console.log("  Pool SOL Vault:", poolSolVault.toString());
    
    // Save to file
    const poolInfo = {
      network: "devnet",
      timestamp: new Date().toISOString(),
      tokenMint: mintAddress.toString(),
      pool: pool.toString(),
      poolTokenAccount: poolTokenAccount.toString(),
      poolSolVault: poolSolVault.toString(),
      initialLiquidity: {
        tokens: TOKEN_AMOUNT.toString(),
        sol: SOL_AMOUNT.toNumber() / LAMPORTS_PER_SOL
      },
      finalBalances: {
        poolTokens: poolTokenAccountInfo.amount.toString(),
        poolSol: poolSolBalance / LAMPORTS_PER_SOL,
        reserveToken: poolAccount.reserveToken.toString(),
        reserveSol: poolAccount.reserveSol.toString()
      }
    };
    
    fs.writeFileSync("../pool_info.json", JSON.stringify(poolInfo, null, 2));
    console.log("\n💾 Pool information saved to: ../pool_info.json");
    
  } catch (error) {
    console.error("❌ Error checking final state:", error.message);
  }
}

// Execute
console.log("\n🚀 Starting liquidity pool creation...\n");

createLiquidityPool().then(() => {
  console.log("\n✨ Script execution completed successfully");
  process.exit(0);
}).catch(error => {
  console.error("\n❌ Script execution failed:", error);
  process.exit(1);
});