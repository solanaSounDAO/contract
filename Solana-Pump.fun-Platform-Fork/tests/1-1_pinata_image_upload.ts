import { PinataSDK } from "pinata";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: path.join(__dirname, ".env") });

// Initialize Pinata SDK globally
let pinata: PinataSDK;

function initializePinata() {
  // Check if environment variables are set
  if (!process.env.PINATA_JWT || !process.env.PINATA_GATEWAY) {
    console.error("❌ Error: Missing environment variables!");
    console.error("\n📝 Please create a .env file in the tests directory with:");
    console.error("PINATA_JWT=your_jwt_token");
    console.error("PINATA_GATEWAY=your_gateway_domain");
    process.exit(1);
  }

  // Initialize Pinata SDK
  pinata = new PinataSDK({
    pinataJwt: process.env.PINATA_JWT,
    pinataGateway: process.env.PINATA_GATEWAY,
  });
  
  return pinata;
}

async function uploadImage() {
  console.log("\n" + "=".repeat(60));
  console.log("📸 STEP 1: IMAGE UPLOAD");
  console.log("=".repeat(60));
  
  // Image file path
  const imagePath = path.join(__dirname, "new pengu.png");
  
  // Check if image file exists
  if (!fs.existsSync(imagePath)) {
    console.error("❌ Error: Image file not found!");
    console.error("Path:", imagePath);
    process.exit(1);
  }

  // Read the image file
  console.log("\n📂 Reading image file...");
  console.log("   Path:", imagePath);
  const imageBuffer = fs.readFileSync(imagePath);
  const stats = fs.statSync(imagePath);
  console.log("   Size:", (stats.size / 1024).toFixed(2), "KB");

  // Create a File object from the buffer
  const blob = new Blob([imageBuffer], { type: "image/png" });
  const file = new File([blob], "new pengu final.png", { type: "image/png" });

  // Upload to Pinata
  console.log("\n🚀 Uploading image to Pinata...");
  const startTime = Date.now();
  const uploadResponse = await pinata.upload.public.file(file);
  const uploadTime = ((Date.now() - startTime) / 1000).toFixed(2);

  // Display success message
  console.log("\n✅ Image upload successful! (took " + uploadTime + "s)");
  console.log("   CID: ", uploadResponse.cid);
  
  const imageUrl = `https://${process.env.PINATA_GATEWAY}/ipfs/${uploadResponse.cid}`;
  console.log("   URL: ", imageUrl);

  return { uploadResponse, imageUrl };
}

async function createAndUploadMetadata(imageUrl: string) {
  console.log("\n" + "=".repeat(60));
  console.log("📝 STEP 2: METADATA CREATION");
  console.log("=".repeat(60));
  
  // Create metadata JSON
  const metadata = {
    image: imageUrl
  };
  
  console.log("\n📋 Generated metadata:");
  console.log(JSON.stringify(metadata, null, 2));
  
  console.log("\n" + "=".repeat(60));
  console.log("📤 STEP 3: METADATA UPLOAD");
  console.log("=".repeat(60));
  
  // Convert metadata to JSON string
  const metadataString = JSON.stringify(metadata, null, 2);
  
  // Create a File object for JSON
  const blob = new Blob([metadataString], { type: "application/json" });
  const file = new File([blob], "penguin_metadata.json", { type: "application/json" });
  
  // Upload JSON to Pinata
  console.log("\n🚀 Uploading metadata to Pinata...");
  const startTime = Date.now();
  const metadataUpload = await pinata.upload.public.file(file);
  const uploadTime = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log("\n✅ Metadata upload successful! (took " + uploadTime + "s)");
  console.log("   CID: ", metadataUpload.cid);
  
  const metadataUrl = `https://${process.env.PINATA_GATEWAY}/ipfs/${metadataUpload.cid}`;
  console.log("   URL: ", metadataUrl);
  
  return { metadataUpload, metadataUrl };
}

async function uploadPenguinWithMetadata() {
  console.log("=".repeat(60));
  console.log("🐧 PENGUIN NFT METADATA CREATION PIPELINE");
  console.log("=".repeat(60));
  
  try {
    // Initialize Pinata
    console.log("\n🔧 Initializing Pinata SDK...");
    initializePinata();
    
    // Step 1: Upload Image
    const { uploadResponse: imageUpload, imageUrl } = await uploadImage();
    
    // Step 2 & 3: Create and Upload Metadata
    const { metadataUpload, metadataUrl } = await createAndUploadMetadata(imageUrl);
    
    // Final Results
    console.log("\n" + "=".repeat(60));
    console.log("🎉 FINAL RESULTS");
    console.log("=".repeat(60));
    
    console.log("\n📊 Summary:");
    console.log("─".repeat(40));
    console.log("🖼️  Image:");
    console.log("    CID:  ", imageUpload.cid);
    console.log("    URL:  ", imageUrl);
    console.log("    Size: ", imageUpload.size, "bytes");
    console.log("");
    console.log("📄 Metadata:");
    console.log("    CID:  ", metadataUpload.cid);
    console.log("    URL:  ", metadataUrl);
    console.log("    Size: ", metadataUpload.size, "bytes");
    console.log("─".repeat(40));
    
    console.log("\n⚡ IMPORTANT: Use this metadata URL in your token/NFT:");
    console.log("   " + metadataUrl);
    
    console.log("\n💡 Quick Links:");
    console.log("   View Image:    " + imageUrl);
    console.log("   View Metadata: " + metadataUrl);
    console.log("   IPFS Gateway:  https://" + process.env.PINATA_GATEWAY);
    
    return {
      image: {
        cid: imageUpload.cid,
        url: imageUrl,
        size: imageUpload.size
      },
      metadata: {
        cid: metadataUpload.cid,
        url: metadataUrl,
        size: metadataUpload.size
      }
    };

  } catch (error) {
    console.error("\n❌ Process failed!");
    console.error("Error details:", error);
    
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      if (error.stack) {
        console.error("\nStack trace:");
        console.error(error.stack);
      }
    }
    
    process.exit(1);
  }
}

// Execute the upload function
if (require.main === module) {
  uploadPenguinWithMetadata()
    .then(() => {
      console.log("\n" + "=".repeat(60));
      console.log("✨ Pipeline completed successfully!");
      console.log("=".repeat(60));
      process.exit(0);
    })
    .catch((error) => {
      console.error("Unexpected error:", error);
      process.exit(1);
    });
}

export { uploadPenguinWithMetadata, uploadImage, createAndUploadMetadata };