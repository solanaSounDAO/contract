import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";

// Program ID from deployment
const PROGRAM_ID = new PublicKey("BhHzxiE9vYDM6d16DxAtqUvbxj6JZdxY7JsBxpjNfK14");

// Token Metadata Program
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

// IDL - Interface Description Language (copy from target/idl/pumpdotfun.json if exists)
const IDL = {
  "version": "0.1.0",
  "name": "pumpdotfun",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [
        { "name": "dexConfigurationAccount", "isMut": true, "isSigner": false },
        { "name": "admin", "isMut": true, "isSigner": true },
        { "name": "rent", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "fee", "type": "f64" }
      ]
    },
    {
      "name": "createToken",
      "accounts": [
        { "name": "payer", "isMut": true, "isSigner": true },
        { "name": "mintAccount", "isMut": true, "isSigner": true },
        { "name": "metadataAccount", "isMut": true, "isSigner": false },
        { "name": "tokenAccount", "isMut": true, "isSigner": false },
        { "name": "tokenMetadataProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false },
        { "name": "rent", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "name", "type": "string" },
        { "name": "symbol", "type": "string" },
        { "name": "uri", "type": "string" },
        { "name": "totalSupply", "type": "u64" }
      ]
    },
    {
      "name": "createPool",
      "accounts": [
        { "name": "dexConfigurationAccount", "isMut": true, "isSigner": false },
        { "name": "pool", "isMut": true, "isSigner": false },
        { "name": "tokenMint", "isMut": false, "isSigner": false },
        { "name": "poolTokenAccount", "isMut": true, "isSigner": false },
        { "name": "poolSolVault", "isMut": true, "isSigner": false },
        { "name": "payer", "isMut": true, "isSigner": true },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false },
        { "name": "rent", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": []
    },
    {
      "name": "buy",
      "accounts": [
        { "name": "dexConfigurationAccount", "isMut": true, "isSigner": false },
        { "name": "pool", "isMut": true, "isSigner": false },
        { "name": "tokenMint", "isMut": true, "isSigner": false },
        { "name": "poolTokenAccount", "isMut": true, "isSigner": false },
        { "name": "poolSolVault", "isMut": true, "isSigner": false },
        { "name": "userTokenAccount", "isMut": true, "isSigner": false },
        { "name": "user", "isMut": true, "isSigner": true },
        { "name": "rent", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "amount", "type": "u64" }
      ]
    },
    {
      "name": "sell",
      "accounts": [
        { "name": "dexConfigurationAccount", "isMut": true, "isSigner": false },
        { "name": "pool", "isMut": true, "isSigner": false },
        { "name": "tokenMint", "isMut": false, "isSigner": false },
        { "name": "poolTokenAccount", "isMut": true, "isSigner": false },
        { "name": "poolSolVault", "isMut": true, "isSigner": false },
        { "name": "userTokenAccount", "isMut": true, "isSigner": false },
        { "name": "user", "isMut": true, "isSigner": true },
        { "name": "systemProgram", "isMut": false, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "amount", "type": "u64" }
      ]
    }
  ]
};

async function main() {
  console.log("=== Pump.fun Fork Test Script ===\n");

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
    // 1. Initialize System
    console.log("1. Initializing System...");
    const [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("CurveConfiguration")],
      PROGRAM_ID
    );

    try {
      const configAccount = await program.account.curveConfiguration.fetch(configPDA);
      console.log("System already initialized. Config:", configAccount);
    } catch {
      console.log("Initializing new system...");
      const initTx = await program.methods
        .initialize(0.03) // 3% fee
        .accounts({
          dexConfigurationAccount: configPDA,
          admin: wallet.publicKey,
          rent: SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("Initialize TX:", initTx);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 2. Create Token
    console.log("\n2. Creating Token...");
    const mintKeypair = Keypair.generate();
    const mintAddress = mintKeypair.publicKey;
    
    const [metadataAccount] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("metadata"),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        mintAddress.toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );

    const tokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      wallet.publicKey
    );

    console.log("Mint Address:", mintAddress.toString());
    console.log("Creating token: TestToken (TEST)");

    const createTokenTx = await program.methods
      .createToken(
        "TestToken",
        "TEST",
        "https://example.com/metadata.json",
        new BN("1000000000000000") // 1M tokens with 9 decimals
      )
      .accounts({
        payer: wallet.publicKey,
        mintAccount: mintAddress,
        metadataAccount: metadataAccount,
        tokenAccount: tokenAccount,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKeypair])
      .rpc();
    
    console.log("Create Token TX:", createTokenTx);
    console.log("Waiting for token to be fully initialized...");
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    // 3. Create Pool
    console.log("\n3. Creating Liquidity Pool...");
    const [poolPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("liquidity_pool"), mintAddress.toBuffer()],
      PROGRAM_ID
    );

    const poolTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      poolPDA,
      true // allowOwnerOffCurve
    );

    const [poolSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("sol_vault"), mintAddress.toBuffer()],
      PROGRAM_ID
    );

    const createPoolTx = await program.methods
      .createPool()
      .accounts({
        dexConfigurationAccount: configPDA,
        pool: poolPDA,
        tokenMint: mintAddress,
        poolTokenAccount: poolTokenAccount,
        poolSolVault: poolSolVault,
        payer: wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("Create Pool TX:", createPoolTx);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Buy Tokens
    console.log("\n4. Buying Tokens...");
    const buyAmount = new BN("100000000"); // 0.1 SOL in lamports

    const buyTx = await program.methods
      .buy(buyAmount)
      .accounts({
        dexConfigurationAccount: configPDA,
        pool: poolPDA,
        tokenMint: mintAddress,
        poolTokenAccount: poolTokenAccount,
        poolSolVault: poolSolVault,
        userTokenAccount: tokenAccount,
        user: wallet.publicKey,
        rent: SYSVAR_RENT_PUBKEY,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Buy TX:", buyTx);
    console.log("Bought tokens with 0.1 SOL");
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 5. Check token balance
    const tokenBalance = await connection.getTokenAccountBalance(tokenAccount);
    console.log("\nToken Balance:", tokenBalance.value.uiAmount, "TEST");

    // 6. Sell Tokens
    console.log("\n5. Selling Tokens...");
    const sellAmount = new BN("1000000000"); // 1 TEST token with 9 decimals

    const sellTx = await program.methods
      .sell(sellAmount)
      .accounts({
        dexConfigurationAccount: configPDA,
        pool: poolPDA,
        tokenMint: mintAddress,
        poolTokenAccount: poolTokenAccount,
        poolSolVault: poolSolVault,
        userTokenAccount: tokenAccount,
        user: wallet.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    console.log("Sell TX:", sellTx);
    console.log("Sold 1 TEST token");

    console.log("\n=== All Tests Completed Successfully! ===");

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