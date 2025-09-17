import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
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

async function createTokenOnDevnet() {
  console.log("=".repeat(60));
  console.log("SOUNDAO TOKEN CREATION ON DEVNET");
  console.log("=".repeat(60));
  
  // Devnet 설정
  const connection = new anchor.web3.Connection("https://api.devnet.solana.com", "confirmed");
  
  // 지갑 로드 - Anchor 기본 지갑 경로 또는 환경변수에서 지정
  let walletPath = process.env.ANCHOR_WALLET;
  if (!walletPath) {
    walletPath = path.join(os.homedir(), ".config/solana/id.json");
  }
  
  console.log("\n📂 Loading wallet from:", walletPath);
  
  if (!fs.existsSync(walletPath)) {
    console.error("❌ Wallet file not found!");
    console.error("Please set ANCHOR_WALLET environment variable or create a wallet at ~/.config/solana/id.json");
    console.error("\nTo create a new wallet:");
    console.error("  solana-keygen new --outfile ~/.config/solana/id.json");
    console.error("\nTo set environment variable:");
    console.error("  export ANCHOR_WALLET=/path/to/your/wallet.json");
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
  
  // 프로그램 ID - 환경변수에서 가져오거나 직접 설정
  const programIdString = process.env.PROGRAM_ID || "YOUR_PROGRAM_ID_HERE";
  
  if (programIdString === "YOUR_PROGRAM_ID_HERE") {
    console.error("❌ PROGRAM_ID not set!");
    console.error("\nPlease set it with your deployed program ID:");
    console.error("  export PROGRAM_ID=YOUR_PROGRAM_ID_HERE");
    console.error("\nOr modify the programIdString variable in this file directly.");
    process.exit(1);
  }
  
  const PROGRAM_ID = new PublicKey(programIdString);
  
  console.log("\n🔗 Network: DEVNET");
  console.log("💳 Wallet Address:", wallet.publicKey.toString());
  
  // 잔액 확인
  const balance = await connection.getBalance(wallet.publicKey);
  console.log("💰 Wallet Balance:", balance / LAMPORTS_PER_SOL, "SOL");
  
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.warn("\n⚠️ Low balance! You may need more SOL for transactions.");
    console.log("Get devnet SOL from: https://faucet.solana.com/");
    console.log("Or use command: solana airdrop 2 --url devnet");
  }
  
  // IDL 로드
  const idl = JSON.parse(
    fs.readFileSync("./target/idl/pumpdotfun.json", "utf8")
  );
  
  // Program 인스턴스 생성
  const program = new anchor.Program(idl, provider) as Program<Pumpdotfun>;
  
  // Token parameters
  const tokenName = "SounDAO Token123";
  const tokenSymbol = "SDT123";
  const tokenUri = "https://apricot-selective-kangaroo-871.mypinata.cloud/ipfs/bafkreihf2pleocdw3t4egry46rbgctlwi53eggw34imhn3bvs5wjq6s5i4";
  const initialBuy = new anchor.BN(1 * LAMPORTS_PER_SOL);
  
  console.log("\n📋 Token Parameters:");
  console.log("  Name:", tokenName);
  console.log("  Symbol:", tokenSymbol);
  console.log("  URI:", tokenUri);
  console.log("  Initial Buy:", initialBuy.toString(), "lamports (", initialBuy.toNumber() / LAMPORTS_PER_SOL, "SOL)");
  console.log("  Creator:", wallet.publicKey.toString());
  
  // Generate new mint
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;
  
  console.log("\n🔑 Generated Mint Address:");
  console.log("  ", mint.toString());
  
  // Derive PDAs
  const [globalState] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );
  
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding_curve"), mint.toBuffer()],
    program.programId
  );
  
  const associatedBondingCurve = await getAssociatedTokenAddress(
    mint,
    bondingCurve,
    true // allowOwnerOffCurve
  );
  
  const associatedUser = await getAssociatedTokenAddress(
    mint,
    wallet.publicKey
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
  console.log("  Program ID:", program.programId.toString());
  console.log("  Global State:", globalState.toString());
  console.log("  Bonding Curve:", bondingCurve.toString());
  console.log("  Bonding Curve ATA:", associatedBondingCurve.toString());
  console.log("  Creator ATA:", associatedUser.toString());
  console.log("  Metadata:", metadata.toString());
  
  // Check if global state is initialized
  try {
    const globalStateAccount = await connection.getAccountInfo(globalState);
    if (globalStateAccount) {
      console.log("\n✅ Global state already initialized");
    } else {
      throw new Error("Global state not found");
    }
  } catch (e) {
    console.log("\n⚠️ Global state not initialized, initializing now...");
    try {
      const initTx = await program.methods
        .initialize(0.01) // fee parameter (1%)
        .accounts({
          admin: wallet.publicKey,
          // dexConfigurationAccount는 PDA이므로 자동으로 유도됩니다
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      
      console.log("✅ Global state initialized!");
      console.log("📝 Transaction signature:", initTx);
      console.log("🔍 View on Solana Explorer:");
      console.log(`   https://explorer.solana.com/tx/${initTx}?cluster=devnet`);
      
      // Wait for confirmation
      const latestBlockhash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        signature: initTx,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
      }, "confirmed");
      console.log("✅ Transaction confirmed");
    } catch (initError) {
      console.error("❌ Failed to initialize global state:", initError.message);
      return;
    }
  }
  
  // Create the token
  console.log("\n🚀 Creating token with bonding curve...");
  
  try {
    const tx = await program.methods
      .create(tokenName, tokenSymbol, tokenUri, initialBuy)
      .accounts({
        creator: wallet.publicKey,
        mint: mint,
        bondingCurve: bondingCurve,
        associatedBondingCurve: associatedBondingCurve,
        associatedUser: associatedUser,
        globalState: globalState,
        metadata: metadata,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        tokenMetadataProgram: metadataProgramId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();
    
    console.log("\n✅ Token created successfully!");
    console.log("📝 Transaction signature:", tx);
    console.log("🔍 View on Solana Explorer:");
    console.log(`   https://explorer.solana.com/tx/${tx}?cluster=devnet`);
    
    // Wait for confirmation
    console.log("\n⏳ Waiting for transaction confirmation...");
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      signature: tx,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    }, "confirmed");
    console.log("✅ Transaction confirmed");
    
    // Fetch and display bonding curve information
    const bondingCurveAccountInfo = await connection.getAccountInfo(bondingCurve);
    if (!bondingCurveAccountInfo) {
      console.error("❌ Failed to fetch bonding curve account");
      return;
    }
    
    // For now, we'll just display the basic info
    // You may need to decode the account data based on your program's structure
    
    console.log("\n📊 Bonding Curve Created:");
    console.log("  Address:", bondingCurve.toString());
    console.log("  Token Name:", tokenName);
    console.log("  Token Symbol:", tokenSymbol);
    console.log("  Mint:", mint.toString());
    
    // Check creator's token balance from initial buy
    try {
      const creatorTokenAccount = await getAccount(provider.connection, associatedUser);
      const creatorBalance = Number(creatorTokenAccount.amount);
      console.log("\n👤 Creator Token Balance:");
      console.log("  ", creatorBalance, "tokens (from initial buy)");
    } catch (e) {
      console.log("\n⚠️ Creator token account not created yet (will be created on first buy)");
    }
    
    // Initial buy information
    console.log("\n💹 Initial Buy:");
    console.log("  Amount:", initialBuy.toNumber() / LAMPORTS_PER_SOL, "SOL");
    
    console.log("\n" + "=".repeat(60));
    console.log("TOKEN CREATION ON DEVNET COMPLETED!");
    console.log("=".repeat(60));
    
    // Save addresses to file for future use
    const addressInfo = {
      network: "devnet",
      timestamp: new Date().toISOString(),
      programId: program.programId.toString(),
      mint: mint.toString(),
      bondingCurve: bondingCurve.toString(),
      globalState: globalState.toString(),
      tokenName: tokenName,
      tokenSymbol: tokenSymbol,
      creator: wallet.publicKey.toString(),
      metadata: metadata.toString(),
      tokenUri: tokenUri,
      explorerLinks: {
        mint: `https://explorer.solana.com/address/${mint}?cluster=devnet`,
        bondingCurve: `https://explorer.solana.com/address/${bondingCurve}?cluster=devnet`,
        transaction: `https://explorer.solana.com/tx/${tx}?cluster=devnet`
      }
    };
    
    const outputPath = "./devnet_token_info.json";
    fs.writeFileSync(outputPath, JSON.stringify(addressInfo, null, 2));
    
    console.log("\n💾 Token information saved to:", outputPath);
    console.log("\n📌 Important addresses for future operations:");
    console.log("  Mint:", mint.toString());
    console.log("  Bonding Curve:", bondingCurve.toString());
    console.log("  Global State:", globalState.toString());
    
    console.log("\n🔗 View on Solana Explorer:");
    console.log("  Token:", `https://explorer.solana.com/address/${mint}?cluster=devnet`);
    console.log("  Bonding Curve:", `https://explorer.solana.com/address/${bondingCurve}?cluster=devnet`);
    
  } catch (error) {
    console.error("\n❌ Failed to create token:", error.message);
    if (error.logs) {
      console.error("\n📜 Program logs:");
      error.logs.forEach((log: string) => console.error("  ", log));
    }
  }
}

// Execute the token creation
console.log("\n🚀 Starting token creation on Devnet...\n");

createTokenOnDevnet().then(() => {
  console.log("\n✨ Script execution completed successfully");
  process.exit(0);
}).catch(error => {
  console.error("\n❌ Script execution failed:", error);
  process.exit(1);
});