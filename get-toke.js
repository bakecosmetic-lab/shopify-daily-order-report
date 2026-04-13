const CLIENT_ID = "d83b34cba7faa431c2f083ee192cf16d";
const CLIENT_SECRET = "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";
const SHOP = "0a17b5.myshopify.com";
const SCOPES = "read_orders,read_all_orders";
const REDIRECT_URI = "https://0a17b5.myshopify.com"; // must match your app's App URL

// Step 1: Open this URL in your browser
const authUrl = `https://${SHOP}/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}`;

console.log("Open this URL in your browser:");
console.log(authUrl);
console.log("\nAfter redirect, copy the 'code' parameter from the URL and paste it below");
