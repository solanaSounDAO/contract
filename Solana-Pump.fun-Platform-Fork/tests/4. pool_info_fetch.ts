import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { Pumpdotfun } from "../target/types/pumpdotfun";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  getAssociatedTokenAddress,
  getAccount as getTokenAccount
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

async function fetchPoolInfo() {
  console.log("=====================================");
  console.log("FETCH LIQUIDITY POOL INFO - DEVNET");
  console.log("=====================================");
  
  // Setup
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  
  // Load wallet
  let walletPath = process.env.ANCHOR_WALLET;
  if (!walletPath) {
    walletPath = path.join(os.homedir(), ".config/solana/id.json");
  }
  
  console.log("\n=� Loading wallet from:", walletPath);
  
  if (!fs.existsSync(walletPath)) {
    console.error("L Wallet file not found!");
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
  
  // Pool address provided by user
  const poolAddress = new PublicKey("7putmmuGfFUKfqUdu4Scr16iYQvmpAT7NpAtTAvzoBTv");
  
  console.log("\n<� Pool Contract Address:", poolAddress.toString());
  console.log("=====================================\n");
  
  try {
    // Fetch pool account data
    console.log("=� Fetching pool state from blockchain...\n");
    const poolAccount = await program.account.liquidityPool.fetch(poolAddress);
    
    // Display pool state
    console.log("========== POOL STATE ==========");
    console.log("=d Creator:", poolAccount.creator.toString());
    console.log(">� Token Mint:", poolAccount.token.toString());
    console.log("=� Total Supply:", poolAccount.totalSupply.toString());
    console.log("=� Reserve Token:", poolAccount.reserveToken.toString());
    console.log("=� Reserve SOL:", poolAccount.reserveSol.toString());
    console.log("=' Bump:", poolAccount.bump);
    
    // Get token mint address from pool
    const mintAddress = poolAccount.token;
    
    // Derive pool's token account
    const poolTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      poolAddress,
      true // allowOwnerOffCurve
    );
    
    // Derive pool SOL vault
    const [poolSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("liquidity_sol_vault"), mintAddress.toBuffer()],
      program.programId
    );
    
    console.log("\n========== DERIVED ACCOUNTS ==========");
    console.log("=� Pool Token Account:", poolTokenAccount.toString());
    console.log("=� Pool SOL Vault:", poolSolVault.toString());
    
    // Fetch actual balances
    console.log("\n========== ACTUAL BALANCES ==========");
    
    // Get actual token balance
    try {
      const tokenAccountInfo = await getTokenAccount(connection as any, poolTokenAccount);
      const tokenBalance = tokenAccountInfo.amount;
      console.log(">� Actual Token Balance:", tokenBalance.toString());
      console.log("   (Formatted):", Number(tokenBalance) / Math.pow(10, 9), "tokens");
    } catch (error) {
      console.log("Could not fetch token account balance:", error.message);
    }
    
    // Get actual SOL balance
    const solBalance = await connection.getBalance(poolSolVault);
    console.log("=� Actual SOL Balance:", solBalance, "lamports");
    console.log("   (Formatted):", solBalance / LAMPORTS_PER_SOL, "SOL");
    
    // Calculate price
    console.log("\n========== PRICE CALCULATION ==========");
    
    const reserveToken = Number(poolAccount.reserveToken.toString());
    const reserveSol = Number(poolAccount.reserveSol.toString());
    
    if (reserveToken > 0 && reserveSol > 0) {
      // Calculate price per token in SOL
      const pricePerToken = reserveSol / reserveToken;
      const pricePerTokenInSol = pricePerToken / LAMPORTS_PER_SOL;
      const pricePerTokenFormatted = pricePerTokenInSol * Math.pow(10, 9); // Adjust for 9 decimals
      
      console.log("=� Price per Token:");
      console.log("   Raw:", pricePerToken, "lamports/token");
      console.log("   Formatted:", pricePerTokenFormatted.toFixed(9), "SOL/token");
      
      // Calculate price for various amounts
      console.log("\n=� Price Examples:");
      console.log("   1 token =", pricePerTokenFormatted.toFixed(9), "SOL");
      console.log("   100 tokens =", (pricePerTokenFormatted * 100).toFixed(9), "SOL");
      console.log("   1000 tokens =", (pricePerTokenFormatted * 1000).toFixed(9), "SOL");
      console.log("   10000 tokens =", (pricePerTokenFormatted * 10000).toFixed(9), "SOL");
      
      // Calculate TVL (Total Value Locked)
      const tvlInSol = (reserveSol * 2) / LAMPORTS_PER_SOL; // Assuming equal value in pool
      console.log("\n= Total Value Locked (TVL):", tvlInSol.toFixed(4), "SOL");
      
      // Calculate K (constant product)
      const k = reserveToken * reserveSol;
      console.log("=� Constant Product (K):", k.toString());
      
    } else {
      console.log("� Cannot calculate price - pool has no liquidity");
      console.log("   Reserve Token:", reserveToken);
      console.log("   Reserve SOL:", reserveSol);
    }
    
    // Additional pool metrics
    console.log("\n========== POOL METRICS ==========");
    
    // Check if pool is initialized
    const isInitialized = reserveToken > 0 || reserveSol > 0;
    console.log(" Pool Initialized:", isInitialized);
    
    // Liquidity ratio
    if (reserveToken > 0 && reserveSol > 0) {
      const ratio = reserveSol / reserveToken;
      console.log("� SOL/Token Ratio:", ratio.toFixed(12));
    }
    
    // Pool share calculation (if applicable)
    if (Number(poolAccount.totalSupply.toString()) > 0) {
      console.log("<� Total LP Supply:", poolAccount.totalSupply.toString());
    }
    
    // Save pool info to file
    console.log("\n========== SAVING POOL INFO ==========");
    
    const poolInfo = {
      network: "devnet",
      timestamp: new Date().toISOString(),
      poolAddress: poolAddress.toString(),
      poolState: {
        creator: poolAccount.creator.toString(),
        tokenMint: poolAccount.token.toString(),
        totalSupply: poolAccount.totalSupply.toString(),
        reserveToken: poolAccount.reserveToken.toString(),
        reserveSol: poolAccount.reserveSol.toString(),
        bump: poolAccount.bump
      },
      derivedAccounts: {
        poolTokenAccount: poolTokenAccount.toString(),
        poolSolVault: poolSolVault.toString()
      },
      actualBalances: {
        solBalance: solBalance,
        solBalanceFormatted: solBalance / LAMPORTS_PER_SOL
      },
      pricing: reserveToken > 0 && reserveSol > 0 ? {
        pricePerTokenLamports: reserveSol / reserveToken,
        pricePerTokenSol: (reserveSol / reserveToken / LAMPORTS_PER_SOL * Math.pow(10, 9)).toFixed(9),
        tvlSol: ((reserveSol * 2) / LAMPORTS_PER_SOL).toFixed(4),
        constantProduct: (reserveToken * reserveSol).toString()
      } : null
    };
    
    fs.writeFileSync("../pool_info_fetched.json", JSON.stringify(poolInfo, null, 2));
    console.log("=� Pool information saved to: ../pool_info_fetched.json");
    
    console.log("\n=====================================");
    console.log("( POOL INFO FETCH COMPLETE!");
    console.log("=====================================");
    
  } catch (error) {
    console.error("\nL Error fetching pool info:", error);
    
    if (error.message.includes("Account does not exist")) {
      console.error("\n� The pool account does not exist at the provided address.");
      console.error("Please check:");
      console.error("1. The pool address is correct");
      console.error("2. You're connected to the right network (devnet)");
      console.error("3. The pool has been created");
    } else if (error.message.includes("Invalid account discriminator")) {
      console.error("\n� The account exists but is not a valid liquidity pool.");
      console.error("The provided address might be:");
      console.error("1. A different type of account");
      console.error("2. Not a pool created by this program");
    }
    
    if (error.logs) {
      console.error("\n=� Program logs:");
      error.logs.forEach((log: string) => console.error("  ", log));
    }
  }
}

// Execute
console.log("\n=� Starting pool info fetch...\n");

fetchPoolInfo().then(() => {
  console.log("\n( Script execution completed successfully");
  process.exit(0);
}).catch(error => {
  console.error("\nL Script execution failed:", error);
  process.exit(1);
});