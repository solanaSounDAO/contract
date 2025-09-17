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

async function createToken() {
  console.log("=".repeat(60));
  console.log("SOUNDAO TOKEN CREATION - DEVNET");
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
  const idl = JSON.parse(
    fs.readFileSync("../target/idl/pumpdotfun.json", "utf8")
  );
  
  // Program instance
  const program = new anchor.Program(idl, provider) as Program<Pumpdotfun>;
  
  // Creator account (wallet)
  const creator = provider.wallet;
  
  // Token parameters
  const tokenName = "POPOPOPO";
  const tokenSymbol = "POPO123";
  const tokenUri = "https://apricot-selective-kangaroo-871.mypinata.cloud/ipfs/bafkreifncqhp3nndxz5mtwyuwnl7pemuw2fsrejh43hpyuelm7atefwcpy";
  const initialBuy = new BN(0.01 * LAMPORTS_PER_SOL); // 0.01 SOL for testing
  
  console.log("\n📋 Token Parameters:");
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
  console.log("  Creator Token Account:", creatorTokenAccount.toString());
  console.log("  User Token Account:", userTokenAccount.toString());
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
        })
        .rpc();
      console.log("✅ DEX config initialized. Tx:", initTx);
    } catch (initError) {
      console.error("❌ Failed to initialize DEX config:", initError.message);
      return;
    }
  }
  
  // Create the token
  console.log("\n🚀 Creating token...");
  
  // Use string to avoid JavaScript number precision issues
  const TOTAL_SUPPLY = new BN("1000000000000000000"); // 1 billion tokens with 9 decimals (1e18)
  
  try {
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
      })
      .signers([mintKeypair])
      .rpc();
    
    console.log("\n✅ Token created successfully!");
    console.log("📝 Transaction signature:", tx);
    console.log("🔍 View on Solana Explorer:");
    console.log(`   https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    
    // Display token information
    console.log("\n📊 Token Information:");
    console.log("  Mint:", mint.toString());
    console.log("  Token Name:", tokenName);
    console.log("  Token Symbol:", tokenSymbol);
    console.log("  Total Supply:", TOTAL_SUPPLY.toString());
    
    // Check creator's token balance
    try {
      const creatorTokenAccount = await getAccount(connection as any, userTokenAccount);
      const creatorBalance = Number(creatorTokenAccount.amount);
      console.log("\n👤 Creator Token Balance:");
      console.log("  ", creatorBalance / Math.pow(10, 9), "tokens");
    } catch (e) {
      console.log("\n⚠️ Creator token account not created yet");
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("TOKEN CREATION COMPLETED SUCCESSFULLY!");
    console.log("=".repeat(60));
    
    // Display summary for future use
    console.log("\n📌 Save these addresses for future operations:");
    console.log("  Mint:", mint.toString());
    console.log("  Pool (for future liquidity):", pool.toString());
    console.log("  DEX Config:", dexConfigPDA.toString());
    
  } catch (error) {
    console.error("\n❌ Failed to create token:", error.message);
    if (error.logs) {
      console.error("\n📜 Program logs:");
      error.logs.forEach((log: string) => console.error("  ", log));
    }
  }
}

// Execute the token creation
createToken().then(() => {
  console.log("\n✨ Script execution completed");
}).catch(error => {
  console.error("\n❌ Script execution failed:", error);
  process.exit(1);
});