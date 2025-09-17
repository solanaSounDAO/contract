import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

// Program ID from deployment
const PROGRAM_ID = new PublicKey("BhHzxiE9vYDM6d16DxAtqUvbxj6JZdxY7JsBxpjNfK14");

// Token Metadata Program
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// Simple IDL
const IDL = {
  "version": "0.1.0",
  "name": "pumpdotfun",
  "accounts": [
    {
      "name": "curveConfiguration",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "fees", "type": "f64" },
          { "name": "admin", "type": "publicKey" },
          { "name": "shares", "type": "u64" }
        ]
      }
    }
  ]
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log("=== Pump.fun Individual Test ===\n");

  // Setup
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  
  // Load wallet from keypair file
  const walletKeypair = Keypair.fromSecretKey(
    Buffer.from(require("/Users/mungyo7/Desktop/SounDAO/baySMce3jxfnxTH1UivnFaDVXQRpTxziGU2YgnKFRNy.json"))
  );
  const wallet = new anchor.Wallet(walletKeypair);
  
  // Create provider
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Create program interface
  const program = new Program(IDL as any, PROGRAM_ID, provider);

  console.log("Wallet Address:", wallet.publicKey.toString());
  console.log("Program ID:", PROGRAM_ID.toString());

  // Get wallet balance
  const balance = await connection.getBalance(wallet.publicKey);
  console.log("Wallet Balance:", balance / 1e9, "SOL\n");

  try {
    switch(command) {
      case "check":
        console.log("Checking system status...");
        const [configPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("CurveConfiguration")],
          PROGRAM_ID
        );
        
        try {
          const configAccount = await connection.getAccountInfo(configPDA);
          if (configAccount) {
            console.log("System is initialized!");
            console.log("Config PDA:", configPDA.toString());
            console.log("Account data length:", configAccount.data.length);
            
            // Parse the data manually
            const dataView = new DataView(configAccount.data.buffer, configAccount.data.byteOffset, configAccount.data.byteLength);
            const discriminator = configAccount.data.slice(0, 8);
            const fees = dataView.getFloat64(8, true); // little-endian
            const admin = new PublicKey(configAccount.data.slice(16, 48));
            const shares = dataView.getBigUint64(48, true);
            
            console.log("\nConfiguration:");
            console.log("- Fees:", fees);
            console.log("- Admin:", admin.toString());
            console.log("- Shares:", shares.toString());
          } else {
            console.log("System not initialized yet");
          }
        } catch (error) {
          console.log("Error checking system:", error);
        }
        break;

      case "create-token":
        console.log("Creating a new token...");
        
        // Generate new mint
        const mintKeypair = Keypair.generate();
        const mintAddress = mintKeypair.publicKey;
        
        console.log("New Mint Address:", mintAddress.toString());
        console.log("Save this address for pool creation!");
        
        // Create instruction manually
        const createTokenIx = await program.instruction.createToken(
          "TestToken",
          "TEST",
          "https://example.com/metadata.json",
          new BN("1000000000000000"), // 1M tokens with 9 decimals
          {
            accounts: {
              payer: wallet.publicKey,
              mintAccount: mintAddress,
              metadataAccount: PublicKey.findProgramAddressSync(
                [
                  Buffer.from("metadata"),
                  TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                  mintAddress.toBuffer(),
                ],
                TOKEN_METADATA_PROGRAM_ID
              )[0],
              tokenAccount: await getAssociatedTokenAddress(mintAddress, wallet.publicKey),
              tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
              rent: SYSVAR_RENT_PUBKEY,
            },
          }
        );

        const tx = new anchor.web3.Transaction().add(createTokenIx);
        const signature = await provider.sendAndConfirm(tx, [mintKeypair]);
        
        console.log("Token created successfully!");
        console.log("Transaction:", signature);
        console.log("\nUse this mint address for pool creation:", mintAddress.toString());
        break;

      case "create-pool":
        if (!args[1]) {
          console.log("Please provide mint address: npm run test:individual create-pool <MINT_ADDRESS>");
          return;
        }
        
        const mintAddress2 = new PublicKey(args[1]);
        console.log("Creating pool for mint:", mintAddress2.toString());
        
        const [poolPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from("liquidity_pool"), mintAddress2.toBuffer()],
          PROGRAM_ID
        );
        
        const [poolSolVault] = PublicKey.findProgramAddressSync(
          [Buffer.from("sol_vault"), mintAddress2.toBuffer()],
          PROGRAM_ID
        );
        
        const [configPDA2] = PublicKey.findProgramAddressSync(
          [Buffer.from("CurveConfiguration")],
          PROGRAM_ID
        );
        
        const poolTokenAccount = await getAssociatedTokenAddress(
          mintAddress2,
          poolPDA,
          true // allowOwnerOffCurve
        );
        
        console.log("Pool PDA:", poolPDA.toString());
        console.log("Pool Token Account:", poolTokenAccount.toString());
        console.log("Pool SOL Vault:", poolSolVault.toString());
        
        // Create pool instruction
        const createPoolIx = await program.instruction.createPool({
          accounts: {
            dexConfigurationAccount: configPDA2,
            pool: poolPDA,
            tokenMint: mintAddress2,
            poolTokenAccount: poolTokenAccount,
            poolSolVault: poolSolVault,
            payer: wallet.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
          },
        });
        
        const tx2 = new anchor.web3.Transaction().add(createPoolIx);
        const signature2 = await provider.sendAndConfirm(tx2);
        
        console.log("Pool created successfully!");
        console.log("Transaction:", signature2);
        break;

      case "buy":
        if (!args[1]) {
          console.log("Please provide mint address: npm run test:individual buy <MINT_ADDRESS>");
          return;
        }
        
        const mintForBuy = new PublicKey(args[1]);
        const solAmount = args[2] ? parseFloat(args[2]) : 0.1;
        const lamports = new BN(solAmount * 1e9);
        
        console.log(`Buying tokens with ${solAmount} SOL...`);
        
        const [poolForBuy] = PublicKey.findProgramAddressSync(
          [Buffer.from("liquidity_pool"), mintForBuy.toBuffer()],
          PROGRAM_ID
        );
        
        const [configForBuy] = PublicKey.findProgramAddressSync(
          [Buffer.from("CurveConfiguration")],
          PROGRAM_ID
        );
        
        const [solVaultForBuy] = PublicKey.findProgramAddressSync(
          [Buffer.from("sol_vault"), mintForBuy.toBuffer()],
          PROGRAM_ID
        );
        
        const buyIx = await program.instruction.buy(lamports, {
          accounts: {
            dexConfigurationAccount: configForBuy,
            pool: poolForBuy,
            tokenMint: mintForBuy,
            poolTokenAccount: await getAssociatedTokenAddress(mintForBuy, poolForBuy, true),
            poolSolVault: solVaultForBuy,
            userTokenAccount: await getAssociatedTokenAddress(mintForBuy, wallet.publicKey),
            user: wallet.publicKey,
            rent: SYSVAR_RENT_PUBKEY,
            systemProgram: SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          },
        });
        
        const txBuy = new anchor.web3.Transaction().add(buyIx);
        const sigBuy = await provider.sendAndConfirm(txBuy);
        
        console.log("Buy successful!");
        console.log("Transaction:", sigBuy);
        
        // Check balance
        const userTokenAccount = await getAssociatedTokenAddress(mintForBuy, wallet.publicKey);
        const tokenBalance = await connection.getTokenAccountBalance(userTokenAccount);
        console.log("Your token balance:", tokenBalance.value.uiAmount, "tokens");
        break;

      default:
        console.log("Available commands:");
        console.log("  check                     - Check system status");
        console.log("  create-token             - Create a new token");
        console.log("  create-pool <MINT>       - Create pool for token");
        console.log("  buy <MINT> [SOL_AMOUNT]  - Buy tokens (default 0.1 SOL)");
        console.log("\nExample:");
        console.log("  npx ts-node test-individual.ts check");
        console.log("  npx ts-node test-individual.ts create-token");
        console.log("  npx ts-node test-individual.ts create-pool <MINT_ADDRESS>");
        console.log("  npx ts-node test-individual.ts buy <MINT_ADDRESS> 0.1");
    }

  } catch (error) {
    console.error("\nError occurred:", error);
    if (error.logs) {
      console.error("Program logs:", error.logs);
    }
  }
}

// Run the test
main().catch((err) => {
  console.error(err);
  process.exit(1);
});