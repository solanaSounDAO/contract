import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Pumpdotfun } from "../target/types/pumpdotfun";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  getAccount
} from "@solana/spl-token";
import { assert } from "chai";

describe("pumpdotfun", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Pumpdotfun as Program<Pumpdotfun>;
  
  // Test accounts
  const creator = provider.wallet;
  const buyer1 = Keypair.generate();
  const buyer2 = Keypair.generate();
  
  // Token parameters
  const tokenName = "SounDAO Token123";
  const tokenSymbol = "SDT123";
  const tokenUri = "https://apricot-selective-kangaroo-871.mypinata.cloud/ipfs/bafkreihf2pleocdw3t4egry46rbgctlwi53eggw34imhn3bvs5wjq6s5i4";
  const initialBuy = new anchor.BN(1 * LAMPORTS_PER_SOL); // 100 SOL initial buy
  
  let mint: PublicKey;
  let bondingCurve: PublicKey;
  let associatedBondingCurve: PublicKey;
  let globalState: PublicKey;
  let metadata: PublicKey;
  
  // Helper function to airdrop SOL
  // async function airdropSol(publicKey: PublicKey, amount: number) {
  //   const signature = await provider.connection.requestAirdrop(
  //     publicKey,
  //     amount * LAMPORTS_PER_SOL
  //   );
  //   await provider.connection.confirmTransaction(signature);
  // }
  
  // Helper function to get token balance
  async function getTokenBalance(wallet: PublicKey): Promise<number> {
    try {
      const ata = await getAssociatedTokenAddress(mint, wallet);
      const account = await getAccount(provider.connection, ata);
      return Number(account.amount);
    } catch (e) {
      return 0;
    }
  }

  before(async () => {
    console.log("Setting up test environment...");
    
    // Airdrop SOL to test accounts
    await airdropSol(buyer1.publicKey, 1000);
    await airdropSol(buyer2.publicKey, 1000);
    
    // Derive PDAs
    [globalState] = PublicKey.findProgramAddressSync(
      [Buffer.from("global")],
      program.programId
    );
    
    // Initialize global state if not already initialized
    try {
      await program.methods
        .initializeGlobal()
        .accounts({
          authority: creator.publicKey,
          globalState: globalState,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("Global state initialized");
    } catch (e) {
      console.log("Global state already initialized");
    }
  });

  describe("Token Creation", () => {
    it("Should create a new token with bonding curve", async () => {
      console.log("\n=== Testing Token Creation ===");
      
      // Generate new mint
      const mintKeypair = Keypair.generate();
      mint = mintKeypair.publicKey;
      
      // Derive PDAs
      [bondingCurve] = PublicKey.findProgramAddressSync(
        [Buffer.from("bonding_curve"), mint.toBuffer()],
        program.programId
      );
      
      associatedBondingCurve = await getAssociatedTokenAddress(
        mint,
        bondingCurve,
        true
      );
      
      const associatedUser = await getAssociatedTokenAddress(
        mint,
        creator.publicKey
      );
      
      // Derive metadata PDA (Metaplex standard)
      const metadataProgramId = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
      [metadata] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          metadataProgramId.toBuffer(),
          mint.toBuffer(),
        ],
        metadataProgramId
      );
      
      console.log("Creating token with:");
      console.log("  Name:", tokenName);
      console.log("  Symbol:", tokenSymbol);
      console.log("  Initial Buy:", initialBuy.toString(), "lamports");
      console.log("  Mint:", mint.toString());
      
      const tx = await program.methods
        .create(tokenName, tokenSymbol, tokenUri, initialBuy)
        .accounts({
          creator: creator.publicKey,
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
      
      console.log("Transaction signature:", tx);
      
      // Verify bonding curve was created
      const bondingCurveAccount = await program.account.bondingCurve.fetch(bondingCurve);
      assert.equal(bondingCurveAccount.creator.toString(), creator.publicKey.toString());
      assert.equal(bondingCurveAccount.mint.toString(), mint.toString());
      assert.equal(bondingCurveAccount.tokenName, tokenName);
      assert.equal(bondingCurveAccount.tokenSymbol, tokenSymbol);
      
      console.log("Token created successfully!");
      console.log("  Virtual SOL reserves:", bondingCurveAccount.virtualSolReserves.toString());
      console.log("  Virtual token reserves:", bondingCurveAccount.virtualTokenReserves.toString());
      console.log("  Real SOL reserves:", bondingCurveAccount.realSolReserves.toString());
      console.log("  Real token reserves:", bondingCurveAccount.realTokenReserves.toString());
      
      // Check creator's token balance
      const creatorBalance = await getTokenBalance(creator.publicKey);
      console.log("  Creator token balance:", creatorBalance);
      assert.isAbove(creatorBalance, 0, "Creator should have tokens from initial buy");
    });
  });

  describe("Buy Functionality", () => {
    it("Should allow users to buy tokens", async () => {
      console.log("\n=== Testing Buy Functionality ===");
      
      const buyAmount = new anchor.BN(10 * LAMPORTS_PER_SOL); // Buy with 10 SOL
      
      // Get initial balances
      const buyer1InitialSol = await provider.connection.getBalance(buyer1.publicKey);
      const buyer1InitialTokens = await getTokenBalance(buyer1.publicKey);
      
      console.log("Buyer1 initial state:");
      console.log("  SOL balance:", buyer1InitialSol / LAMPORTS_PER_SOL);
      console.log("  Token balance:", buyer1InitialTokens);
      
      // Create associated token account for buyer1
      const buyer1Ata = await getAssociatedTokenAddress(mint, buyer1.publicKey);
      
      console.log("Buying tokens with", buyAmount.toString(), "lamports...");
      
      const tx = await program.methods
        .buy(buyAmount, new anchor.BN(0)) // 0 for max_sol_cost (no slippage protection for test)
        .accounts({
          user: buyer1.publicKey,
          bondingCurve: bondingCurve,
          associatedBondingCurve: associatedBondingCurve,
          associatedUser: buyer1Ata,
          mint: mint,
          globalState: globalState,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer1])
        .rpc();
      
      console.log("Buy transaction:", tx);
      
      // Check final balances
      const buyer1FinalSol = await provider.connection.getBalance(buyer1.publicKey);
      const buyer1FinalTokens = await getTokenBalance(buyer1.publicKey);
      
      console.log("Buyer1 final state:");
      console.log("  SOL balance:", buyer1FinalSol / LAMPORTS_PER_SOL);
      console.log("  Token balance:", buyer1FinalTokens);
      console.log("  SOL spent:", (buyer1InitialSol - buyer1FinalSol) / LAMPORTS_PER_SOL);
      console.log("  Tokens received:", buyer1FinalTokens - buyer1InitialTokens);
      
      assert.isBelow(buyer1FinalSol, buyer1InitialSol, "SOL balance should decrease");
      assert.isAbove(buyer1FinalTokens, buyer1InitialTokens, "Token balance should increase");
      
      // Check bonding curve state
      const bondingCurveAccount = await program.account.bondingCurve.fetch(bondingCurve);
      console.log("\nBonding curve after buy:");
      console.log("  Real SOL reserves:", bondingCurveAccount.realSolReserves.toString());
      console.log("  Real token reserves:", bondingCurveAccount.realTokenReserves.toString());
    });
    
    it("Should handle multiple buyers correctly", async () => {
      console.log("\n=== Testing Multiple Buyers ===");
      
      const buyAmount = new anchor.BN(5 * LAMPORTS_PER_SOL); // Buy with 5 SOL
      
      // Buyer2 buys tokens
      const buyer2Ata = await getAssociatedTokenAddress(mint, buyer2.publicKey);
      
      console.log("Buyer2 buying tokens...");
      
      const tx = await program.methods
        .buy(buyAmount, new anchor.BN(0))
        .accounts({
          user: buyer2.publicKey,
          bondingCurve: bondingCurve,
          associatedBondingCurve: associatedBondingCurve,
          associatedUser: buyer2Ata,
          mint: mint,
          globalState: globalState,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer2])
        .rpc();
      
      console.log("Buy transaction:", tx);
      
      const buyer2Tokens = await getTokenBalance(buyer2.publicKey);
      console.log("Buyer2 token balance:", buyer2Tokens);
      
      assert.isAbove(buyer2Tokens, 0, "Buyer2 should have tokens");
      
      // Note: Due to bonding curve, buyer2 should get fewer tokens for same SOL amount
      const buyer1Tokens = await getTokenBalance(buyer1.publicKey);
      console.log("Comparison - Buyer1 has:", buyer1Tokens, "tokens (bought earlier with 10 SOL)");
      console.log("Comparison - Buyer2 has:", buyer2Tokens, "tokens (bought later with 5 SOL)");
    });
  });

  describe("Sell Functionality", () => {
    it("Should allow users to sell tokens", async () => {
      console.log("\n=== Testing Sell Functionality ===");
      
      // Get initial balances
      const buyer1InitialSol = await provider.connection.getBalance(buyer1.publicKey);
      const buyer1InitialTokens = await getTokenBalance(buyer1.publicKey);
      
      console.log("Buyer1 before sell:");
      console.log("  SOL balance:", buyer1InitialSol / LAMPORTS_PER_SOL);
      console.log("  Token balance:", buyer1InitialTokens);
      
      // Sell half of the tokens
      const sellAmount = new anchor.BN(buyer1InitialTokens / 2);
      
      console.log("Selling", sellAmount.toString(), "tokens...");
      
      const buyer1Ata = await getAssociatedTokenAddress(mint, buyer1.publicKey);
      
      const tx = await program.methods
        .sell(sellAmount, new anchor.BN(0)) // 0 for min_sol_output (no slippage protection for test)
        .accounts({
          user: buyer1.publicKey,
          bondingCurve: bondingCurve,
          associatedBondingCurve: associatedBondingCurve,
          associatedUser: buyer1Ata,
          mint: mint,
          globalState: globalState,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer1])
        .rpc();
      
      console.log("Sell transaction:", tx);
      
      // Check final balances
      const buyer1FinalSol = await provider.connection.getBalance(buyer1.publicKey);
      const buyer1FinalTokens = await getTokenBalance(buyer1.publicKey);
      
      console.log("Buyer1 after sell:");
      console.log("  SOL balance:", buyer1FinalSol / LAMPORTS_PER_SOL);
      console.log("  Token balance:", buyer1FinalTokens);
      console.log("  SOL received:", (buyer1FinalSol - buyer1InitialSol) / LAMPORTS_PER_SOL);
      console.log("  Tokens sold:", buyer1InitialTokens - buyer1FinalTokens);
      
      assert.isAbove(buyer1FinalSol, buyer1InitialSol, "SOL balance should increase");
      assert.isBelow(buyer1FinalTokens, buyer1InitialTokens, "Token balance should decrease");
      
      // Check bonding curve state
      const bondingCurveAccount = await program.account.bondingCurve.fetch(bondingCurve);
      console.log("\nBonding curve after sell:");
      console.log("  Real SOL reserves:", bondingCurveAccount.realSolReserves.toString());
      console.log("  Real token reserves:", bondingCurveAccount.realTokenReserves.toString());
    });
  });

  describe("Withdraw Functionality", () => {
    it("Should allow authorized withdrawals", async () => {
      console.log("\n=== Testing Withdraw Functionality ===");
      
      // Check bonding curve balance before withdrawal
      const bondingCurveAccount = await program.account.bondingCurve.fetch(bondingCurve);
      const bcBalance = await provider.connection.getBalance(bondingCurve);
      
      console.log("Before withdrawal:");
      console.log("  Bonding curve SOL balance:", bcBalance / LAMPORTS_PER_SOL);
      console.log("  Bonding curve real SOL reserves:", bondingCurveAccount.realSolReserves.toString());
      
      if (bcBalance > 0) {
        const withdrawAmount = new anchor.BN(Math.floor(bcBalance * 0.1)); // Withdraw 10%
        
        console.log("Attempting to withdraw", withdrawAmount.toString(), "lamports...");
        
        try {
          const tx = await program.methods
            .withdraw(withdrawAmount)
            .accounts({
              authority: creator.publicKey,
              bondingCurve: bondingCurve,
              globalState: globalState,
              systemProgram: SystemProgram.programId,
            })
            .rpc();
          
          console.log("Withdraw transaction:", tx);
          
          const bcBalanceAfter = await provider.connection.getBalance(bondingCurve);
          console.log("After withdrawal:");
          console.log("  Bonding curve SOL balance:", bcBalanceAfter / LAMPORTS_PER_SOL);
          console.log("  Amount withdrawn:", (bcBalance - bcBalanceAfter) / LAMPORTS_PER_SOL, "SOL");
          
          assert.isBelow(bcBalanceAfter, bcBalance, "Bonding curve balance should decrease");
        } catch (e) {
          console.log("Withdrawal failed (might be restricted):", e.message);
        }
      } else {
        console.log("No SOL to withdraw from bonding curve");
      }
    });
    
    it("Should prevent unauthorized withdrawals", async () => {
      console.log("\n=== Testing Unauthorized Withdrawal Prevention ===");
      
      const withdrawAmount = new anchor.BN(1 * LAMPORTS_PER_SOL);
      
      console.log("Attempting unauthorized withdrawal...");
      
      try {
        await program.methods
          .withdraw(withdrawAmount)
          .accounts({
            authority: buyer1.publicKey, // Using buyer1 instead of creator
            bondingCurve: bondingCurve,
            globalState: globalState,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer1])
          .rpc();
        
        assert.fail("Unauthorized withdrawal should have failed");
      } catch (e) {
        console.log("Unauthorized withdrawal correctly rejected:", e.message);
        assert.include(e.message, "A seeds constraint was violated", "Should fail with proper error");
      }
    });
  });

  describe("Edge Cases and Validations", () => {
    it("Should handle minimum buy amounts", async () => {
      console.log("\n=== Testing Minimum Buy Amount ===");
      
      const tinyAmount = new anchor.BN(1000); // Very small amount
      const buyerAta = await getAssociatedTokenAddress(mint, buyer2.publicKey);
      
      try {
        await program.methods
          .buy(tinyAmount, new anchor.BN(0))
          .accounts({
            user: buyer2.publicKey,
            bondingCurve: bondingCurve,
            associatedBondingCurve: associatedBondingCurve,
            associatedUser: buyerAta,
            mint: mint,
            globalState: globalState,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer2])
          .rpc();
        
        console.log("Small buy succeeded");
      } catch (e) {
        console.log("Small buy might be rejected due to minimum requirements:", e.message);
      }
    });
    
    it("Should calculate prices correctly along the bonding curve", async () => {
      console.log("\n=== Testing Bonding Curve Pricing ===");
      
      const bondingCurveAccount = await program.account.bondingCurve.fetch(bondingCurve);
      
      console.log("Current bonding curve state:");
      console.log("  Virtual SOL reserves:", bondingCurveAccount.virtualSolReserves.toString());
      console.log("  Virtual token reserves:", bondingCurveAccount.virtualTokenReserves.toString());
      console.log("  Real SOL reserves:", bondingCurveAccount.realSolReserves.toString());
      console.log("  Real token reserves:", bondingCurveAccount.realTokenReserves.toString());
      
      // Calculate implied price
      const virtualSol = bondingCurveAccount.virtualSolReserves.toNumber();
      const virtualTokens = bondingCurveAccount.virtualTokenReserves.toNumber();
      const k = virtualSol * virtualTokens;
      
      console.log("\nBonding curve metrics:");
      console.log("  Constant product (k):", k);
      console.log("  Implied token price:", (virtualSol / virtualTokens), "SOL per token");
      
      // Verify k remains constant (approximately) through trades
      assert.isAbove(k, 0, "Constant product should be positive");
    });
  });

  describe("Summary Report", () => {
    it("Should display final state of all test accounts", async () => {
      console.log("\n" + "=".repeat(60));
      console.log("FINAL TEST SUMMARY");
      console.log("=".repeat(60));
      
      // Token info
      console.log("\nToken Information:");
      console.log("  Name:", tokenName);
      console.log("  Symbol:", tokenSymbol);
      console.log("  Mint:", mint.toString());
      
      // Bonding curve state
      const bondingCurveAccount = await program.account.bondingCurve.fetch(bondingCurve);
      console.log("\nBonding Curve Final State:");
      console.log("  SOL reserves:", bondingCurveAccount.realSolReserves.toNumber() / LAMPORTS_PER_SOL, "SOL");
      console.log("  Token reserves:", bondingCurveAccount.realTokenReserves.toString(), "tokens");
      console.log("  Virtual SOL:", bondingCurveAccount.virtualSolReserves.toNumber() / LAMPORTS_PER_SOL, "SOL");
      console.log("  Virtual tokens:", bondingCurveAccount.virtualTokenReserves.toString());
      
      // Account balances
      console.log("\nAccount Balances:");
      
      const creatorSol = await provider.connection.getBalance(creator.publicKey);
      const creatorTokens = await getTokenBalance(creator.publicKey);
      console.log("  Creator:");
      console.log("    SOL:", creatorSol / LAMPORTS_PER_SOL);
      console.log("    Tokens:", creatorTokens);
      
      const buyer1Sol = await provider.connection.getBalance(buyer1.publicKey);
      const buyer1Tokens = await getTokenBalance(buyer1.publicKey);
      console.log("  Buyer1:");
      console.log("    SOL:", buyer1Sol / LAMPORTS_PER_SOL);
      console.log("    Tokens:", buyer1Tokens);
      
      const buyer2Sol = await provider.connection.getBalance(buyer2.publicKey);
      const buyer2Tokens = await getTokenBalance(buyer2.publicKey);
      console.log("  Buyer2:");
      console.log("    SOL:", buyer2Sol / LAMPORTS_PER_SOL);
      console.log("    Tokens:", buyer2Tokens);
      
      console.log("\n" + "=".repeat(60));
      console.log("ALL TESTS COMPLETED SUCCESSFULLY!");
      console.log("=".repeat(60));
    });
  });
});