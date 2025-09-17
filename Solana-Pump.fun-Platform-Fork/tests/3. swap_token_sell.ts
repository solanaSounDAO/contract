import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { Pumpdotfun } from "../target/types/pumpdotfun";
import { SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  getAccount,
  getMint
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

async function swapTokensForSol() {
  console.log("=====================================");
  console.log("SWAP TOKENS FOR SOL - DEVNET");
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
  const user = provider.wallet;
  
  // Hardcoded pool address
  const poolAddress = new PublicKey("7putmmuGfFUKfqUdu4Scr16iYQvmpAT7NpAtTAvzoBTv");
  
  console.log("Program ID:", program.programId.toString());
  console.log("User:", user.publicKey.toString());
  console.log("Pool Address:", poolAddress.toString());
  console.log("=====================================\n");
  
  try {
    // Fetch pool info from chain
    console.log("📊 Fetching pool info from chain...");
    const poolAccount = await program.account.liquidityPool.fetch(poolAddress);
    
    console.log("\n========== CURRENT POOL STATE ==========");
    console.log("Creator:", poolAccount.creator.toString());
    console.log("Token Mint:", poolAccount.token.toString());
    console.log("Total Supply:", poolAccount.totalSupply.toString());
    console.log("Reserve Token:", poolAccount.reserveToken.toString());
    console.log("Reserve SOL:", poolAccount.reserveSol.toString());
    
    // Get token mint address from pool
    const mintAddress = poolAccount.token;
    
    // Fetch mint info to get decimals
    console.log("\n📊 Fetching token mint info...");
    const mintInfo = await getMint(connection, mintAddress);
    const TOKEN_DECIMALS = mintInfo.decimals;
    console.log("Token Decimals:", TOKEN_DECIMALS);
    
    // Now calculate sell amount with correct decimals
    const SELL_AMOUNT_TOKENS = 2000; // 2000 tokens
    const sellAmount = new BN(SELL_AMOUNT_TOKENS * Math.pow(10, TOKEN_DECIMALS));
    
    console.log("Sell Amount (raw):", sellAmount.toString());
    console.log("Sell Amount (decimal):", SELL_AMOUNT_TOKENS, "tokens");
    
    // Derive necessary PDAs
    const [dexConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("CurveConfiguration")],
      program.programId
    );
    
    const poolTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      poolAddress,
      true // allowOwnerOffCurve
    );
    
    const [poolSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("liquidity_sol_vault"), mintAddress.toBuffer()],
      program.programId
    );
    
    const userTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      user.publicKey
    );
    
    console.log("\n📍 Derived Accounts:");
    console.log("  DEX Config:", dexConfigPDA.toString());
    console.log("  Pool Token Account:", poolTokenAccount.toString());
    console.log("  Pool SOL Vault:", poolSolVault.toString());
    console.log("  User Token Account:", userTokenAccount.toString());
    
    // Check user's current balances
    console.log("\n========== USER BALANCES (BEFORE) ==========");
    
    const userSolBalance = await connection.getBalance(user.publicKey);
    console.log("SOL Balance:", userSolBalance / LAMPORTS_PER_SOL, "SOL");
    
    let userTokenBalance = BigInt(0);
    try {
      const userTokenAccountInfo = await getAccount(connection, userTokenAccount);
      userTokenBalance = userTokenAccountInfo.amount;
      console.log("Token Balance (raw):", userTokenBalance.toString());
      console.log("Token Balance (decimal):", Number(userTokenBalance) / Math.pow(10, TOKEN_DECIMALS), "tokens");
      
      // Check if user has enough tokens
      if (userTokenBalance < BigInt(sellAmount.toString())) {
        console.error("\n❌ Insufficient token balance!");
        console.error("Required:", SELL_AMOUNT_TOKENS, "tokens");
        console.error("Available:", Number(userTokenBalance) / Math.pow(10, TOKEN_DECIMALS), "tokens");
        process.exit(1);
      }
    } catch (e) {
      console.error("❌ Token account not found or has no tokens");
      process.exit(1);
    }
    
    // Calculate expected output
    console.log("\n========== EXPECTED SWAP ==========");
    
    const reserveToken = Number(poolAccount.reserveToken.toString());
    const reserveSol = Number(poolAccount.reserveSol.toString());
    
    if (reserveToken > 0 && reserveSol > 0) {
      // Using constant product formula: x * y = k
      const k = reserveToken * reserveSol;
      const newReserveToken = reserveToken + sellAmount.toNumber();
      const newReserveSol = k / newReserveToken;
      const solOut = reserveSol - newReserveSol;
      
      console.log("Current Price:", (reserveSol / reserveToken * Math.pow(10, TOKEN_DECIMALS) / LAMPORTS_PER_SOL).toFixed(9), "SOL per token");
      console.log("Constant K:", k.toString());
      console.log("Expected SOL Out:", solOut.toString(), "lamports");
      console.log("Expected SOL Out:", solOut / LAMPORTS_PER_SOL, "SOL");
      
      // Account for fees (assuming 1% fee)
      const expectedWithFee = solOut * 0.99;
      console.log("Expected After Fee (~1%):", expectedWithFee / LAMPORTS_PER_SOL, "SOL");
    }
    
    // Execute the swap
    console.log("\n========== EXECUTING SWAP ==========");
    console.log("🔄 Selling", SELL_AMOUNT_TOKENS, "tokens for SOL...");
    
    const tx = await program.methods
      .sell(sellAmount)
      .accounts({
        dexConfigurationAccount: dexConfigPDA,
        pool: poolAddress,
        tokenMint: mintAddress,
        poolTokenAccount: poolTokenAccount,
        poolSolVault: poolSolVault,
        userTokenAccount: userTokenAccount,
        user: user.publicKey,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        // Note: associatedTokenProgram is not required for sell
      })
      .rpc();
    
    console.log("✅ Transaction Signature:", tx);
    console.log("🔍 View on Solana Explorer:");
    console.log(`   https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    
    // Wait for confirmation
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature: tx,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    }, "confirmed");
    
    console.log("✅ Transaction confirmed!");
    
    // Fetch updated balances
    console.log("\n========== USER BALANCES (AFTER) ==========");
    
    const userSolBalanceAfter = await connection.getBalance(user.publicKey);
    console.log("SOL Balance:", userSolBalanceAfter / LAMPORTS_PER_SOL, "SOL");
    
    const userTokenAccountInfoAfter = await getAccount(connection, userTokenAccount);
    const userTokenBalanceAfter = userTokenAccountInfoAfter.amount;
    console.log("Token Balance (raw):", userTokenBalanceAfter.toString());
    console.log("Token Balance (decimal):", Number(userTokenBalanceAfter) / Math.pow(10, TOKEN_DECIMALS), "tokens");
    
    // Calculate actual amounts
    const solReceived = userSolBalanceAfter - userSolBalance;
    const tokensSold = Number(userTokenBalance) - Number(userTokenBalanceAfter);
    
    console.log("\n========== SWAP RESULTS ==========");
    console.log("Tokens Sold (raw):", tokensSold.toString());
    console.log("Tokens Sold (decimal):", tokensSold / Math.pow(10, TOKEN_DECIMALS), "tokens");
    console.log("SOL Received:", solReceived / LAMPORTS_PER_SOL, "SOL");
    console.log("Effective Price:", (solReceived / tokensSold * Math.pow(10, TOKEN_DECIMALS) / LAMPORTS_PER_SOL).toFixed(9), "SOL per token");
    
    // Fetch updated pool state
    console.log("\n========== UPDATED POOL STATE ==========");
    const poolAccountAfter = await program.account.liquidityPool.fetch(poolAddress);
    
    console.log("Reserve Token:", poolAccountAfter.reserveToken.toString());
    console.log("Reserve SOL:", poolAccountAfter.reserveSol.toString());
    
    const newReserveToken = Number(poolAccountAfter.reserveToken.toString());
    const newReserveSol = Number(poolAccountAfter.reserveSol.toString());
    
    if (newReserveToken > 0 && newReserveSol > 0) {
      const newPrice = newReserveSol / newReserveToken * Math.pow(10, TOKEN_DECIMALS) / LAMPORTS_PER_SOL;
      console.log("New Price:", newPrice.toFixed(9), "SOL per token");
      
      const oldPrice = reserveSol / reserveToken * Math.pow(10, TOKEN_DECIMALS) / LAMPORTS_PER_SOL;
      const priceImpact = ((newPrice - oldPrice) / oldPrice * 100).toFixed(2);
      console.log("Price Impact:", priceImpact, "%");
    }
    
    // Save swap result
    const sellResult = {
      network: "devnet",
      timestamp: new Date().toISOString(),
      transaction: tx,
      poolAddress: poolAddress.toString(),
      tokenMint: mintAddress.toString(),
      tokenDecimals: TOKEN_DECIMALS,
      sellAmount: {
        raw: sellAmount.toString(),
        decimal: SELL_AMOUNT_TOKENS
      },
      results: {
        tokensSold: {
          raw: tokensSold.toString(),
          decimal: tokensSold / Math.pow(10, TOKEN_DECIMALS)
        },
        solReceived: {
          lamports: solReceived.toString(),
          sol: solReceived / LAMPORTS_PER_SOL
        },
        effectivePrice: (solReceived / tokensSold * Math.pow(10, TOKEN_DECIMALS) / LAMPORTS_PER_SOL).toFixed(9)
      },
      poolStateBefore: {
        reserveToken: poolAccount.reserveToken.toString(),
        reserveSol: poolAccount.reserveSol.toString()
      },
      poolStateAfter: {
        reserveToken: poolAccountAfter.reserveToken.toString(),
        reserveSol: poolAccountAfter.reserveSol.toString()
      },
      explorerLink: `https://explorer.solana.com/tx/${tx}?cluster=devnet`
    };
    
    fs.writeFileSync("../sell_result.json", JSON.stringify(sellResult, null, 2));
    console.log("\n💾 Sell result saved to: ../sell_result.json");
    
    console.log("\n=====================================");
    console.log("✨ SELL SWAP COMPLETED SUCCESSFULLY!");
    console.log("=====================================");
    
  } catch (error) {
    console.error("\n❌ Error during sell swap:", error.message);
    
    if (error.logs) {
      console.error("\n📜 Program logs:");
      error.logs.forEach((log: string) => console.error("  ", log));
    }
    
    throw error;
  }
}

// Execute
console.log("\n🚀 Starting token sell swap...\n");

swapTokensForSol().then(() => {
  console.log("\n✨ Script execution completed successfully");
  process.exit(0);
}).catch(error => {
  console.error("\n❌ Script execution failed:", error);
  process.exit(1);
});