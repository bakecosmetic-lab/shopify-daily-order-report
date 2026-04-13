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
  const tracking = order.fulfillments
    .map(f => f.tracking_number)
    .filter(Boolean)
    .join(", ");
  return tracking || "—";
}

function getDeliveryStatus(order) {
  if (!order.fulfillments || order.fulfillments.length === 0) return "—";
  const statuses = order.fulfillments.map(f => f.shipment_status || "—").join(", ");
  return statuses;
}

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
          ${showTracking ? "<th>Tracking ID</th><th>Delivery Status</th>" : ""}
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
              <td><a href="https://${SHOPIFY_STORE}/admin/orders/${o.id}">#${o.order_number}</a></td>
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
    created_at_min: thirtyDaysAgo,
    limit: 250
  });

  const failed = allRecentOrders.filter(o =>
  o.fulfillments && o.fulfillments.some(f =>
    f.shipment_status === "failure" || 
    f.delivery_status === "failure" ||
    (o.tags && o.tags.toLowerCase().includes("delivery_failed"))
  )
);

  // 4. Fulfilled but not delivered — placed 7-30 days ago, still open
  const fulfilledNotDelivered = await fetchOrders({
    status: "open",
    fulfillment_status: "shipped",
    created_at_min: thirtyDaysAgo,
    created_at_max: sevenDaysAgo,
    limit: 250
  });

  // Also include 'fulfilled' status orders that are not delivered
  const fulfilledOrders = await fetchOrders({
    status: "open",
    fulfillment_status: "fulfilled",
    created_at_min: thirtyDaysAgo,
    created_at_max: sevenDaysAgo,
    limit: 250
  });

  // Merge and deduplicate
  const notDelivered = [...fulfilledNotDelivered, ...fulfilledOrders].filter((o, index, self) =>
    index === self.findIndex(t => t.id === o.id)
  );

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
