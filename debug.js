const SHOPIFY_STORE = "your-store.myshopify.com"; // ← your store
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;

async function debug() {
  // Test 1: Fetch ALL open orders regardless of fulfillment status
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2026-04/orders.json?status=open&limit=10`,
    { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
  );
  const data = await res.json();
  
  console.log("Total open orders found:", data.orders?.length);
  data.orders?.forEach(o => {
    console.log(`Order #${o.order_number} | fulfillment_status: ${o.fulfillment_status} | financial_status: ${o.financial_status}`);
  });
}

debug().catch(console.error);
