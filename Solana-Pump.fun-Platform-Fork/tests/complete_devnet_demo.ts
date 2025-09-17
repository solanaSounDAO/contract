import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Pumpdotfun } from "../target/types/pumpdotfun";
import { Keypair, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  getAccount
} from "@solana/spl-token";

describe("Complete Devnet Demo", () => {
  // Setup
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  
  const program = anchor.workspace.Pumpdotfun as Program<Pumpdotfun>;
  const payer = provider.wallet;
  
  // The token we created earlier
  const mintAddress = new PublicKey("5Siuz6zmscLBEgUnTG3sqxXgHhUaKHZXVEPNG2duWvBd");
  
  // Test users
  const buyer1 = Keypair.generate();
  const buyer2 = Keypair.generate();
  const seller = Keypair.generate();
  
  let dexConfigPDA: PublicKey;
  let pool: PublicKey;
  let poolTokenAccount: PublicKey;
  let poolSolVault: PublicKey;
  
  console.log("=====================================");
  console.log("COMPLETE DEVNET DEMO");
  console.log("=====================================");
  console.log("Program ID:", program.programId.toString());
  console.log("Provider:", payer.publicKey.toString());
  console.log("Token Mint:", mintAddress.toString());
  console.log("=====================================\n");
  
  before(async () => {
    // Derive PDAs
    [dexConfigPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("CurveConfiguration")],
      program.programId
    );
    
    [pool] = PublicKey.findProgramAddressSync(
      [Buffer.from("liquidity_pool"), mintAddress.toBuffer()],
      program.programId
    );
    
    poolTokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      pool,
      true
    );
    
    [poolSolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("liquidity_sol_vault"), mintAddress.toBuffer()],
      program.programId
    );
    
    console.log("Pool Information:");
    console.log("  Pool PDA:", pool.toString());
    console.log("  Pool Token Account:", poolTokenAccount.toString());
    console.log("  Pool SOL Vault:", poolSolVault.toString());
    console.log();
    
    // Transfer SOL to test users
    console.log("Funding test users...");
    const transfers = [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: buyer1.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      }),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: buyer2.publicKey,
        lamports: 0.2 * LAMPORTS_PER_SOL,
      }),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: seller.publicKey,
        lamports: 0.15 * LAMPORTS_PER_SOL,
      }),
    ];
    
    const tx = await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(...transfers)
    );
    console.log("Users funded successfully!");
  });
  
  describe("Initial Pool State", () => {
    it("Should display initial pool state", async () => {
      console.log("\n========== INITIAL POOL STATE ==========");
      
      const poolSolBalance = await provider.connection.getBalance(poolSolVault);
      const poolTokenAccountInfo = await getAccount(provider.connection, poolTokenAccount);
      
      console.log("Pool Liquidity:");
      console.log("  SOL:", poolSolBalance / LAMPORTS_PER_SOL, "SOL");
      console.log("  Tokens:", Number(poolTokenAccountInfo.amount) / 1e9);
      
      const price = (poolSolBalance / LAMPORTS_PER_SOL) / (Number(poolTokenAccountInfo.amount) / 1e9);
      console.log("  Price:", price.toFixed(8), "SOL per token");
    });
  });
  
  describe("Buyer 1 - Small Buy", () => {
    it("Buyer 1 buys with 0.01 SOL", async () => {
      console.log("\n========== BUYER 1: 0.01 SOL ==========");
      
      const buyerTokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        buyer1.publicKey
      );
      
      const buyAmount = new BN(0.01 * LAMPORTS_PER_SOL);
      
      const tx = await program.methods
        .buy(buyAmount)
        .accounts({
          dexConfigurationAccount: dexConfigPDA,
          pool,
          tokenMint: mintAddress,
          poolTokenAccount,
          poolSolVault,
          userTokenAccount: buyerTokenAccount,
          user: buyer1.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer1])
        .rpc();
      
      console.log("Transaction:", tx);
      
      const buyerTokenAccountInfo = await getAccount(provider.connection, buyerTokenAccount);
      console.log("Tokens bought:", Number(buyerTokenAccountInfo.amount) / 1e9);
      
      // Show new pool state
      const poolSolBalance = await provider.connection.getBalance(poolSolVault);
      const poolTokenAccountInfo = await getAccount(provider.connection, poolTokenAccount);
      console.log("\nPool after buy:");
      console.log("  SOL:", poolSolBalance / LAMPORTS_PER_SOL);
      console.log("  Tokens:", Number(poolTokenAccountInfo.amount) / 1e9);
    });
  });
  
  describe("Buyer 2 - Large Buy", () => {
    it("Buyer 2 buys with 0.05 SOL", async () => {
      console.log("\n========== BUYER 2: 0.05 SOL ==========");
      
      const buyerTokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        buyer2.publicKey
      );
      
      const buyAmount = new BN(0.05 * LAMPORTS_PER_SOL);
      
      const tx = await program.methods
        .buy(buyAmount)
        .accounts({
          dexConfigurationAccount: dexConfigPDA,
          pool,
          tokenMint: mintAddress,
          poolTokenAccount,
          poolSolVault,
          userTokenAccount: buyerTokenAccount,
          user: buyer2.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([buyer2])
        .rpc();
      
      console.log("Transaction:", tx);
      
      const buyerTokenAccountInfo = await getAccount(provider.connection, buyerTokenAccount);
      console.log("Tokens bought:", Number(buyerTokenAccountInfo.amount) / 1e9);
      
      // Show new pool state
      const poolSolBalance = await provider.connection.getBalance(poolSolVault);
      const poolTokenAccountInfo = await getAccount(provider.connection, poolTokenAccount);
      console.log("\nPool after buy:");
      console.log("  SOL:", poolSolBalance / LAMPORTS_PER_SOL);
      console.log("  Tokens:", Number(poolTokenAccountInfo.amount) / 1e9);
    });
  });
  
  describe("Seller - Buy then Sell", () => {
    it("Seller buys with 0.02 SOL then sells half", async () => {
      console.log("\n========== SELLER: BUY & SELL ==========");
      
      const sellerTokenAccount = await getAssociatedTokenAddress(
        mintAddress,
        seller.publicKey
      );
      
      // First buy
      console.log("Buying with 0.02 SOL...");
      const buyAmount = new BN(0.02 * LAMPORTS_PER_SOL);
      
      const buyTx = await program.methods
        .buy(buyAmount)
        .accounts({
          dexConfigurationAccount: dexConfigPDA,
          pool,
          tokenMint: mintAddress,
          poolTokenAccount,
          poolSolVault,
          userTokenAccount: sellerTokenAccount,
          user: seller.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();
      
      console.log("Buy transaction:", buyTx);
      
      let sellerTokenAccountInfo = await getAccount(provider.connection, sellerTokenAccount);
      const tokensBought = sellerTokenAccountInfo.amount;
      console.log("Tokens bought:", Number(tokensBought) / 1e9);
      
      // Then sell half
      console.log("\nSelling half of tokens...");
      const sellAmount = new BN(tokensBought.toString()).div(new BN(2));
      
      const sellTx = await program.methods
        .sell(sellAmount)
        .accounts({
          dexConfigurationAccount: dexConfigPDA,
          pool,
          tokenMint: mintAddress,
          poolTokenAccount,
          poolSolVault,
          userTokenAccount: sellerTokenAccount,
          user: seller.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();
      
      console.log("Sell transaction:", sellTx);
      
      sellerTokenAccountInfo = await getAccount(provider.connection, sellerTokenAccount);
      console.log("Tokens remaining:", Number(sellerTokenAccountInfo.amount) / 1e9);
      
      // Show final pool state
      const poolSolBalance = await provider.connection.getBalance(poolSolVault);
      const poolTokenAccountInfo = await getAccount(provider.connection, poolTokenAccount);
      console.log("\nPool after sell:");
      console.log("  SOL:", poolSolBalance / LAMPORTS_PER_SOL);
      console.log("  Tokens:", Number(poolTokenAccountInfo.amount) / 1e9);
    });
  });
  
  describe("Final Summary", () => {
    it("Should display final state of all accounts", async () => {
      console.log("\n========== FINAL SUMMARY ==========");
      
      // Pool state
      const poolSolBalance = await provider.connection.getBalance(poolSolVault);
      const poolTokenAccountInfo = await getAccount(provider.connection, poolTokenAccount);
      
      console.log("Final Pool State:");
      console.log("  SOL:", poolSolBalance / LAMPORTS_PER_SOL, "SOL");
      console.log("  Tokens:", Number(poolTokenAccountInfo.amount) / 1e9);
      const price = (poolSolBalance / LAMPORTS_PER_SOL) / (Number(poolTokenAccountInfo.amount) / 1e9);
      console.log("  Price:", price.toFixed(8), "SOL per token");
      
      // User balances
      console.log("\nUser Token Balances:");
      
      try {
        const buyer1TokenAccount = await getAssociatedTokenAddress(mintAddress, buyer1.publicKey);
        const buyer1Tokens = await getAccount(provider.connection, buyer1TokenAccount);
        console.log("  Buyer 1:", Number(buyer1Tokens.amount) / 1e9, "tokens");
      } catch (e) {
        console.log("  Buyer 1: 0 tokens");
      }
      
      try {
        const buyer2TokenAccount = await getAssociatedTokenAddress(mintAddress, buyer2.publicKey);
        const buyer2Tokens = await getAccount(provider.connection, buyer2TokenAccount);
        console.log("  Buyer 2:", Number(buyer2Tokens.amount) / 1e9, "tokens");
      } catch (e) {
        console.log("  Buyer 2: 0 tokens");
      }
      
      try {
        const sellerTokenAccount = await getAssociatedTokenAddress(mintAddress, seller.publicKey);
        const sellerTokens = await getAccount(provider.connection, sellerTokenAccount);
        console.log("  Seller:", Number(sellerTokens.amount) / 1e9, "tokens");
      } catch (e) {
        console.log("  Seller: 0 tokens");
      }
      
      console.log("\n=====================================");
      console.log("DEMO COMPLETED SUCCESSFULLY!");
      console.log("=====================================");
    });
  });
});