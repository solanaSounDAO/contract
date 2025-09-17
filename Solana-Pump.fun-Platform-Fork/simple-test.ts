import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import * as fs from "fs";

// Program ID from deployment
const PROGRAM_ID = new PublicKey("BhHzxiE9vYDM6d16DxAtqUvbxj6JZdxY7JsBxpjNfK14");

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log("=== Pump.fun Simple Test ===\n");

  // Setup connection
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  // Load wallet
  const walletData = JSON.parse(fs.readFileSync("/Users/mungyo7/Desktop/SounDAO/baySMce3jxfnxTH1UivnFaDVXQRpTxziGU2YgnKFRNy.json", "utf-8"));
  const wallet = Keypair.fromSecretKey(Uint8Array.from(walletData));
  
  console.log("Wallet Address:", wallet.publicKey.toString());
  console.log("Program ID:", PROGRAM_ID.toString());

  // Get wallet balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log("Wallet Balance:", balance / LAMPORTS_PER_SOL, "SOL\n");

  try {
    switch(command) {
      case "check":
        console.log("Checking system configuration...");
        const [configPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("CurveConfiguration")],
          PROGRAM_ID
        );
        
        console.log("Config PDA:", configPDA.toString());
        
        const configAccount = await connection.getAccountInfo(configPDA);
        if (configAccount) {
          console.log("✅ System is initialized!");
          console.log("Account owner:", configAccount.owner.toString());
          console.log("Account data length:", configAccount.data.length);
          
          // Try to parse basic data
          if (configAccount.data.length >= 56) {
            const dataView = new DataView(
              configAccount.data.buffer,
              configAccount.data.byteOffset,
              configAccount.data.byteLength
            );
            
            // Skip 8-byte discriminator
            const fees = dataView.getFloat64(8, true);
            const adminBytes = configAccount.data.slice(16, 48);
            const admin = new PublicKey(adminBytes);
            
            console.log("\nConfiguration Details:");
            console.log("- Fees:", fees);
            console.log("- Admin:", admin.toString());
          }
        } else {
          console.log("❌ System not initialized");
        }
        break;

      case "list-tokens":
        console.log("Checking recent token creations...\n");
        
        // Get recent signatures for the program
        const signatures = await connection.getSignaturesForAddress(
          PROGRAM_ID,
          { limit: 10 }
        );
        
        console.log(`Found ${signatures.length} recent transactions:\n`);
        
        for (const sig of signatures) {
          const tx = await connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });
          
          if (tx && tx.meta && tx.meta.logMessages) {
            const hasCreateToken = tx.meta.logMessages.some(log => 
              log.includes("CreateToken") || log.includes("create_token")
            );
            
            if (hasCreateToken) {
              console.log("Token Creation TX:", sig.signature);
              
              // Try to find mint from the transaction
              if (tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
                for (const tokenBalance of tx.meta.postTokenBalances) {
                  if (tokenBalance.mint) {
                    console.log("  - Mint:", tokenBalance.mint);
                    console.log("  - Supply:", tokenBalance.uiTokenAmount.uiAmountString);
                  }
                }
              }
            }
          }
        }
        break;

      case "check-token":
        if (!args[1]) {
          console.log("Please provide mint address: node simple-test.js check-token <MINT_ADDRESS>");
          return;
        }
        
        const mintAddress = new PublicKey(args[1]);
        console.log("Checking token:", mintAddress.toString());
        
        // Check if mint exists
        const mintInfo = await connection.getAccountInfo(mintAddress);
        if (mintInfo) {
          console.log("✅ Token mint exists");
          console.log("Owner:", mintInfo.owner.toString());
          
          // Check pool
          const [poolPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("liquidity_pool"), mintAddress.toBuffer()],
            PROGRAM_ID
          );
          
          const poolInfo = await connection.getAccountInfo(poolPDA);
          if (poolInfo) {
            console.log("✅ Pool exists for this token");
            console.log("Pool PDA:", poolPDA.toString());
          } else {
            console.log("❌ No pool exists for this token yet");
          }
          
          // Check user balance
          try {
            const userATA = await getAssociatedTokenAddress(mintAddress, wallet.publicKey);
            const tokenAccount = await getAccount(connection, userATA);
            console.log("Your balance:", Number(tokenAccount.amount) / 1e9, "tokens");
          } catch {
            console.log("You don't have a token account for this mint yet");
          }
        } else {
          console.log("❌ Token mint does not exist");
        }
        break;

      case "check-pool":
        if (!args[1]) {
          console.log("Please provide mint address: node simple-test.js check-pool <MINT_ADDRESS>");
          return;
        }
        
        const mintForPool = new PublicKey(args[1]);
        const [poolToCheck] = PublicKey.findProgramAddressSync(
          [Buffer.from("liquidity_pool"), mintForPool.toBuffer()],
          PROGRAM_ID
        );
        
        console.log("Checking pool for mint:", mintForPool.toString());
        console.log("Expected Pool PDA:", poolToCheck.toString());
        
        const poolData = await connection.getAccountInfo(poolToCheck);
        if (poolData) {
          console.log("✅ Pool exists!");
          console.log("Pool data length:", poolData.data.length);
          
          // Try to parse pool data
          if (poolData.data.length >= 121) {
            const dataView = new DataView(
              poolData.data.buffer,
              poolData.data.byteOffset,
              poolData.data.byteLength
            );
            
            // Skip discriminator (8 bytes)
            const creator = new PublicKey(poolData.data.slice(8, 40));
            const token = new PublicKey(poolData.data.slice(40, 72));
            const totalSupply = dataView.getBigUint64(72, true);
            const reserveToken = dataView.getBigUint64(80, true);
            const reserveSol = dataView.getBigUint64(88, true);
            
            console.log("\nPool Details:");
            console.log("- Creator:", creator.toString());
            console.log("- Token:", token.toString());
            console.log("- Total Supply:", totalSupply.toString());
            console.log("- Reserve Token:", Number(reserveToken) / 1e9);
            console.log("- Reserve SOL:", Number(reserveSol) / 1e9);
          }
        } else {
          console.log("❌ Pool does not exist");
        }
        break;

      default:
        console.log("Available commands:");
        console.log("  check                    - Check system configuration");
        console.log("  list-tokens              - List recent token creations");
        console.log("  check-token <MINT>       - Check specific token details");
        console.log("  check-pool <MINT>        - Check pool for a token");
        console.log("\nExample:");
        console.log("  npx ts-node simple-test.ts check");
        console.log("  npx ts-node simple-test.ts list-tokens");
        console.log("  npx ts-node simple-test.ts check-token ENFPArQEh2yNThDFxgnRoiEEqe4Et1UNjof9jyek91uL");
    }

  } catch (error) {
    console.error("\nError occurred:", error);
  }
}

// Run
main().catch((err) => {
  console.error(err);
  process.exit(1);
});