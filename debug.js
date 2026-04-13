const SHOPIFY_STORE = "your-store.myshopify.com"; // ← your store
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;

async function debug() {
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2026-04/orders.json?status=open&limit=10`,
    { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
  );
  
  console.log("HTTP Status:", res.status);
  const data = await res.json();
  console.log("Raw Response:", JSON.stringify(data, null, 2));
}

debug().catch(console.error);
