const nodemailer = require("nodemailer");

const SHOPIFY_STORE = "0a17b5.myshopify.com";
const SHOPIFY_TOKEN = process.env.SHOPIFY_TOKEN;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASS;
const REPORT_TO = process.env.REPORT_TO;

function getDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function fetchOrders(params) {
  const query = new URLSearchParams(params).toString();
  const url = `https://${SHOPIFY_STORE}/admin/api/2026-04/orders.json?${query}`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN }
  });
  const data = await res.json();
  return data.orders || [];
}

function getTrackingInfo(order) {
  if (!order.fulfillments || order.fulfillments.length === 0) return "—";
  const links = order.fulfillments
    .filter(f => f.tracking_number)
    .map(f => {
      const url = f.tracking_url || f.tracking_urls?.[0] || `https://track.aftership.com/${f.tracking_number}`;
      return `<a href="${url}" target="_blank" style="color:#2980b9">Track Order</a>`;
    });
  return links.length ? links.join("<br/>") : "—";
}

function getDeliveryStatus(order) {
  if (!order.fulfillments || order.fulfillments.length === 0) return "—";
  const statuses = order.fulfillments.map(f => f.shipment_status || "—").join(", ");
  return statuses;
}

// Fetch a specific order to see all fields
async function debugOrder() {
  // Replace with actual order ID (not order number)
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2026-04/orders/7243955208496.json`,
    { headers: { "X-Shopify-Access-Token": SHOPIFY_TOKEN } }
  );
  const data = await res.json();
  const order = data.orders?.[0];
  if (!order) return console.log("Order not found");

  console.log("ORDER TAGS:", order.tags);
  console.log("FINANCIAL STATUS:", order.financial_status);
  console.log("FULFILLMENT STATUS:", order.fulfillment_status);
  order.fulfillments?.forEach(f => {
    console.log("FULFILLMENT:", JSON.stringify(f));
  });
}

debugOrder().catch(console.error);

function buildTable(orders, showTracking = false) {
  if (!orders.length) return "<p style='color:#888'>None</p>";
  return `
    <table border="1" cellpadding="8" cellspacing="0" 
      style="border-collapse:collapse;font-family:sans-serif;font-size:13px;width:100%">
      <thead style="background:#f0f0f0">
        <tr>
          <th>Order ID</th>
          <th>Customer Name</th>
          <th>Email</th>
          <th>Phone</th>
          <th>Shipping Address</th>
          <th>Total Amount</th>
          <th>Order Date</th>
          <th>Status</th>
          ${showTracking ? "<th>Tracking Link</th><th>Delivery Status</th>" : ""}
        </tr>
      </thead>
      <tbody>
        ${orders.map(o => {
          const addr = o.shipping_address;
          const fullAddress = addr
            ? [addr.address1, addr.address2, addr.city, addr.province, addr.zip, addr.country]
                .filter(Boolean).join(", ")
            : "—";
          return `
            <tr>
              <td><a href="https://admin.shopify.com/store/0a17b5/orders/${o.id}" target="_blank">#${o.order_number}</a></td>
              <td>${addr?.name || o.billing_address?.name || "—"}</td>
              <td>${o.email || "—"}</td>
              <td>${addr?.phone || o.phone || "—"}</td>
              <td>${fullAddress}</td>
              <td>${o.currency} ${o.total_price}</td>
              <td>${new Date(o.created_at).toLocaleDateString("en-IN")}</td>
              <td>${o.fulfillment_status || "unfulfilled"}</td>
              ${showTracking ? `<td>${getTrackingInfo(o)}</td><td>${getDeliveryStatus(o)}</td>` : ""}
            </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

async function main() {
  const thirtyDaysAgo = getDaysAgo(30);
  const sevenDaysAgo  = getDaysAgo(7);

  // 1. Unfulfilled orders — past 30 days
  const unfulfilled = await fetchOrders({
    status: "open",
    fulfillment_status: "unfulfilled",
    created_at_min: thirtyDaysAgo,
    limit: 250
  });

  // 2. Partially fulfilled orders — past 30 days
  const partial = await fetchOrders({
    status: "open",
    fulfillment_status: "partial",
    created_at_min: thirtyDaysAgo,
    limit: 250
  });

  // 3. Failed delivery — fetch all recent orders and filter by fulfillment shipment_status
  const allRecentOrders = await fetchOrders({
    status: "any",
    created_at_min: thirtyDaysAgo
  });

  const failed = allRecentOrders.filter(o =>
  o.fulfillments && o.fulfillments.some(f =>
    f.shipment_status === "failure" || 
    f.delivery_status === "failure" ||
    (o.tags && o.tags.toLowerCase().includes("delivery_failed"))
  )
);

  // 4. Fulfilled but not delivered — placed 7-30 days ago
const fulfilledNotDelivered = await fetchOrders({
  status: "any",
  fulfillment_status: "shipped",
  created_at_min: thirtyDaysAgo,
  created_at_max: sevenDaysAgo,
  limit: 250
});

const fulfilledOrders = await fetchOrders({
  status: "any",
  fulfillment_status: "fulfilled",
  created_at_min: thirtyDaysAgo,
  created_at_max: sevenDaysAgo,
  limit: 250
});

// Merge, deduplicate, and exclude delivered orders
const notDelivered = [...fulfilledNotDelivered, ...fulfilledOrders]
  .filter((o, index, self) => index === self.findIndex(t => t.id === o.id))
  .filter(o => {
    if (!o.fulfillments || o.fulfillments.length === 0) return true;
    // Exclude if any fulfillment is confirmed delivered
    return !o.fulfillments.some(f => 
      f.shipment_status === "delivered" ||
      f.shipment_status === "out_for_delivery" // optional: remove this line if you want to keep these
    );
  });

  
  const today = new Date().toDateString();

  const section = (emoji, title, color, count, table) => `
    <h3 style="color:${color};margin-top:30px">${emoji} ${title} (${count})</h3>
    ${table}
  `;

  const html = `
    <div style="font-family:sans-serif;max-width:1100px;margin:auto;padding:20px">
      <div style="background:#1a1a2e;color:white;padding:15px 20px;border-radius:8px;margin-bottom:20px">
        <h2 style="margin:0">📦 Daily Order Report — ${today}</h2>
        <p style="margin:5px 0 0;opacity:0.7;font-size:13px">
          Unfulfilled/Partial: last 30 days &nbsp;|&nbsp; 
          Failed Delivery: last 30 days &nbsp;|&nbsp; 
          Not Delivered: placed 7+ days ago
        </p>
      </div>

      ${section("🔴", "Unfulfilled Orders — Last 30 Days", "#c0392b", unfulfilled.length, buildTable(unfulfilled))}
      ${section("🟡", "Partially Fulfilled Orders — Last 30 Days", "#d68910", partial.length, buildTable(partial))}
      ${section("❌", "Failed Deliveries — Last 30 Days", "#8e44ad", failed.length, buildTable(failed, true))}
      ${section("📦", "Fulfilled but Not Delivered — Placed 7+ Days Ago", "#2980b9", notDelivered.length, buildTable(notDelivered, true))}

      <p style="color:#aaa;font-size:12px;margin-top:30px;border-top:1px solid #eee;padding-top:10px">
        This is an automated daily report from your Shopify store (bakecosmetics.com)
      </p>
    </div>
  `;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  });

  await transporter.sendMail({
    from: `"Bake Cosmetics Reports" <${GMAIL_USER}>`,
    to: REPORT_TO,
    subject: `📦 Daily Order Report — ${today}`,
    html
  });

  console.log(`✅ Report sent:
    - Unfulfilled: ${unfulfilled.length}
    - Partial: ${partial.length}
    - Failed delivery: ${failed.length}
    - Fulfilled not delivered: ${notDelivered.length}`);
}

main().catch(console.error);
