const nodemailer = require("nodemailer");

const SHOPIFY_STORE = "0a17b5.myshopify.com";
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const GMAIL_USER = process.env.GMAIL_USER;       // your@gmail.com
const GMAIL_PASS = process.env.GMAIL_APP_PASS;   // Gmail App Password
const REPORT_TO  = process.env.REPORT_TO;        // recipient email

async function fetchOrders(fulfillment_status) {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?status=open&fulfillment_status=${fulfillment_status}&limit=250`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN }
  });
  const data = await res.json();
  return data.orders || [];
}

function buildTable(orders) {
  if (!orders.length) return "<p>None</p>";
  return `
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:sans-serif;font-size:13px">
      <thead style="background:#f0f0f0">
        <tr><th>Order</th><th>Customer</th><th>Email</th><th>Total</th><th>Created</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${orders.map(o => `
          <tr>
            <td><a href="https://${SHOPIFY_STORE}/admin/orders/${o.id}">#${o.order_number}</a></td>
            <td>${o.billing_address?.name || "—"}</td>
            <td>${o.email || "—"}</td>
            <td>${o.currency} ${o.total_price}</td>
            <td>${new Date(o.created_at).toLocaleDateString()}</td>
            <td>${o.fulfillment_status || "unfulfilled"}</td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

async function main() {
  const [unfulfilled, partial] = await Promise.all([
    fetchOrders("unfulfilled"),
    fetchOrders("partial")
  ]);

  // Also fetch orders tagged as delivery_failed
  const failedRes = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?status=any&tag=delivery_failed&limit=250`,
    { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
  );
  const failedData = await failedRes.json();
  const failed = failedData.orders || [];

  const today = new Date().toDateString();
  const html = `
    <h2>📦 Daily Order Report — ${today}</h2>
    <h3>🔴 Unfulfilled (${unfulfilled.length})</h3>${buildTable(unfulfilled)}
    <h3>🟡 Partially Fulfilled (${partial.length})</h3>${buildTable(partial)}
    <h3>❌ Failed Delivery (${failed.length})</h3>${buildTable(failed)}
  `;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });

  await transporter.sendMail({
    from: GMAIL_USER,
    to: REPORT_TO,
    subject: `Shopify Order Report — ${today}`,
    html
  });

  console.log(`✅ Report sent: ${unfulfilled.length} unfulfilled, ${partial.length} partial, ${failed.length} failed`);
}

main().catch(console.error);
