import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { Pumpdotfun } from "../target/types/pumpdotfun";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { uploadPenguinWithMetadata } from "./1-1_pinata_image_upload";

// Main function to create token with Pinata integration
async function createTokenWithPinata() {
  console.log("=".repeat(60));
  console.log("🚀 TOKEN CREATION WITH PINATA INTEGRATION");
  console.log("=".repeat(60));
  
  try {
    // Step 1: Set token details
    const tokenName = "Old Pengu Token";
    const tokenSymbol = "OPENGU";
    
    console.log("\n📋 Token Configuration:");
    console.log("   Name:   ", tokenName);
    console.log("   Symbol: ", tokenSymbol);
    
    // Step 2: Upload to Pinata using the function from 1-1_pinata_image_upload.ts
    console.log("\n" + "=".repeat(60));
    console.log("📤 PINATA UPLOAD PROCESS");
    console.log("=".repeat(60));
    
    // Upload penguin image and create metadata
    const pinataResult = await uploadPenguinWithMetadata();
    const metadataUrl = pinataResult.metadata.url;
    
    console.log("\n✅ Pinata upload complete!");
    console.log("   Metadata URL:", metadataUrl);
    
    // Step 3: Create token on Solana
    console.log("\n" + "=".repeat(60));
    console.log("🔗 SOLANA TOKEN CREATION");
    console.log("=".repeat(60));
    
    // Setup connection to devnet
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
    const idlPath = path.join(__dirname, "../target/idl/pumpdotfun.json");
    if (!fs.existsSync(idlPath)) {
      console.error("❌ IDL file not found at:", idlPath);
      console.error("Please build the program first with 'anchor build'");
      process.exit(1);
    }
    
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
    
    // Program instance
    const program = new anchor.Program(idl, provider) as Program<Pumpdotfun>;
    
    // Creator account (wallet)
    const creator = provider.wallet;
    
    // Token parameters
    const tokenUri = metadataUrl; // Use the Pinata metadata URL
    const initialBuy = new BN(0.01 * LAMPORTS_PER_SOL); // 0.01 SOL for testing
    
    console.log("\n📋 Final Token Parameters:");
    console.log("  Name:", tokenName);
    console.log("  Symbol:", tokenSymbol);
    console.log("  URI:", tokenUri);
    console.log("  Initial Buy:", initialBuy.toString(), "lamports (", initialBuy.toNumber() / LAMPORTS_PER_SOL, "SOL)");
    console.log("  Creator:", creator.publicKey.toString());
    
    // Generate new mint
    const mintKeypair = Keypair.generate();
    const mint = mintKeypair.publicKey;
    
    console.log("\n🔑 Generated Mint Address:");
    console.log("  ", mint.toString());
    
    // Derive PDAs
    const [dexConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("CurveConfiguration")],
      program.programId
    );
    
    const [pool] = PublicKey.findProgramAddressSync(
      [Buffer.from("liquidity_pool"), mint.toBuffer()],
      program.programId
    );
    
    // User's token account for the token being created
    const creatorTokenAccount = await getAssociatedTokenAddress(
      mint,
      creator.publicKey
    );
    
    const userTokenAccount = await getAssociatedTokenAddress(
      mint,
      creator.publicKey
    );
    
    // Derive metadata PDA (Metaplex standard)
    const metadataProgramId = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const [metadata] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        metadataProgramId.toBuffer(),
        mint.toBuffer(),
      ],
      metadataProgramId
    );
    
    console.log("\n📍 Derived Addresses:");
    console.log("  DEX Config:", dexConfigPDA.toString());
    console.log("  Pool (for future):", pool.toString());
    console.log("  Metadata:", metadata.toString());
    
    // Check if DEX config is initialized
    try {
      await program.account.curveConfiguration.fetch(dexConfigPDA);
      console.log("\n✅ DEX config already initialized");
    } catch (e) {
      console.log("\n⚠️ DEX config not initialized, initializing now...");
      try {
        const initTx = await program.methods
          .initialize(0.01) // 1% fee
          .accounts({
            dexConfigurationAccount: dexConfigPDA,
            admin: creator.publicKey,
            systemProgram: SystemProgram.programId,
          } as any)
          .rpc();
        console.log("✅ DEX config initialized. Tx:", initTx);
      } catch (initError) {
        console.error("❌ Failed to initialize DEX config:", initError.message);
        return;
      }
    }
    
    // Create the token
    console.log("\n🚀 Creating token on Solana...");
    
    // Use string to avoid JavaScript number precision issues
    const TOTAL_SUPPLY = new BN("1000000000000000000"); // 1 billion tokens with 9 decimals (1e18)
    
    const tx = await program.methods
      .createToken(tokenName, tokenSymbol, tokenUri, TOTAL_SUPPLY)
      .accounts({
        payer: creator.publicKey,
        mintAccount: mint,
        metadataAccount: metadata,
        tokenAccount: creatorTokenAccount,
        tokenMetadataProgram: metadataProgramId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      } as any)
      .signers([mintKeypair])
      .rpc();
    
    // Display results
    console.log("\n" + "=".repeat(60));
    console.log("✅ TOKEN CREATED SUCCESSFULLY!");
    console.log("=".repeat(60));
    
    console.log("\n📊 Token Details:");
    console.log("-".repeat(40));
    console.log("  Name:          ", tokenName);
    console.log("  Symbol:        ", tokenSymbol);
    console.log("  Mint Address:  ", mint.toString());
    console.log("  Total Supply:  ", TOTAL_SUPPLY.toString());
    console.log("-".repeat(40));
    
    console.log("\n🌐 URLs:");
    console.log("-".repeat(40));
    console.log("  Image:         ", pinataResult.image.url);
    console.log("  Metadata:      ", metadataUrl);
    console.log("-".repeat(40));
    
    console.log("\n📝 Transaction:");
    console.log("  Signature:     ", tx);
    console.log("  Explorer:      ", `https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    
    console.log("\n📌 Save these addresses for future operations:");
    console.log("  Mint:          ", mint.toString());
    console.log("  Pool:          ", pool.toString());
    console.log("  DEX Config:    ", dexConfigPDA.toString());
    
    // Check creator's token balance
    try {
      const creatorTokenAccountInfo = await getAccount(connection as any, userTokenAccount);
      const creatorBalance = Number(creatorTokenAccountInfo.amount);
      console.log("\n👤 Creator Token Balance:");
      console.log("  ", creatorBalance / Math.pow(10, 9), "tokens");
    } catch (e) {
      console.log("\n⚠️ Creator token account not created yet");
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("🎉 COMPLETE SUCCESS!");
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("\n❌ Error occurred:", error.message);
    if (error.logs) {
      console.error("\n📜 Program logs:");
      error.logs.forEach((log: string) => console.error("  ", log));
    }
    process.exit(1);
  }
}

// Execute the script
if (require.main === module) {
  createTokenWithPinata()
    .then(() => {
      console.log("\n✨ Script execution completed");
      process.exit(0);
    })
    .catch(error => {
      console.error("\n❌ Script execution failed:", error);
      process.exit(1);
    });
}

export { createTokenWithPinata };