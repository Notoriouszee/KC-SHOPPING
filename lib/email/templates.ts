import { formatNaira } from "../domain/money";

/**
 * HTML email templates.
 *
 * Table-based layout with inline styles: email clients ignore most modern CSS, so
 * this is deliberately old-fashioned. Everything is responsive down to 320px and
 * the dark header carries the K&C Shopping wordmark (the gold logo is a raster
 * asset, so the header uses type instead of an image that clients may block).
 */

type LineItem = { name: string; quantity: number; unitPriceKobo: number };

export type OrderEmailData = {
  reference: string;
  shopName: string;
  customerName: string;
  customerPhone: string | null;
  totalKobo: number;
  paymentStatus: string;
  status: string;
  items: LineItem[];
  deliveryAddress: string | null;
  orderUrl: string;
  imageUrl?: string | null;
  supportEmail: string;
};

const BRAND = "#0a0a0a";
const MUTED = "#6b6b6b";
const LINE = "#e6e6e6";
const SUPPORT_EMAIL = "kandcshopping11@gmail.com";

function shell(title: string, preheader: string, body: string, footerNote: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f4;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};">
            <tr>
              <td style="background:${BRAND};padding:22px 28px;">
                <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:0.16em;color:#ffffff;">
                  K&amp;C&nbsp;SHOPPING
                </div>
                <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.22em;color:#b9b9b9;padding-top:6px;">
                  A CURATED MARKETPLACE
                </div>
              </td>
            </tr>
            ${body}
            <tr>
              <td style="padding:18px 28px 26px;border-top:1px solid ${LINE};">
                <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${MUTED};">
                  ${escapeHtml(footerNote)}
                </p>
                <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED};">
                  Questions? Email
                  <a href="mailto:${SUPPORT_EMAIL}" style="color:${BRAND};">${SUPPORT_EMAIL}</a>
                </p>
              </td>
            </tr>
          </table>
          <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a9a9a;">
            &copy; K&amp;C Shopping
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function itemsTable(items: LineItem[]): string {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;">
          ${escapeHtml(item.name)}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${MUTED};text-align:center;white-space:nowrap;">
          &times;&nbsp;${item.quantity}
        </td>
        <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;text-align:right;white-space:nowrap;">
          ${formatNaira(item.unitPriceKobo * item.quantity)}
        </td>
      </tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 4px;">
    <tr>
      <td style="background:${BRAND};">
        <a href="${escapeHtml(href)}"
           style="display:inline-block;padding:13px 26px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#ffffff;text-decoration:none;">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>`;
}

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Sent to the seller when a customer places an order. */
export function sellerNewOrderEmail(data: OrderEmailData) {
  const subject = "New Order Received — K&C Shopping";

  const body = `
    <tr>
      <td style="padding:28px 28px 0;">
        <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#111;font-weight:normal;">
          New order received
        </h1>
        <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:${MUTED};">
          ${escapeHtml(data.customerName)} has placed an order in ${escapeHtml(data.shopName)}.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid ${LINE};">
          <tr>
            <td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED};">
              Order reference
            </td>
            <td style="padding:14px 16px;font-family:'Courier New',monospace;font-size:14px;color:#111;text-align:right;">
              ${escapeHtml(data.reference)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 16px 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED};">
              Amount
            </td>
            <td style="padding:0 16px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;text-align:right;">
              ${formatNaira(data.totalKobo)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:22px 28px 0;">
        <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};">
          Items
        </p>
        ${itemsTable(data.items)}
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${MUTED};">
        <p style="margin:0;">Customer: ${escapeHtml(data.customerName)}${data.customerPhone ? ` &middot; ${escapeHtml(data.customerPhone)}` : ""}</p>
        ${data.deliveryAddress ? `<p style="margin:4px 0 0;">Deliver to: ${escapeHtml(data.deliveryAddress)}</p>` : ""}
        <p style="margin:4px 0 0;">Payment: ${escapeHtml(data.paymentStatus)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 28px;">
        ${button(data.orderUrl, "Manage this order")}
      </td>
    </tr>`;

  const text = [
    "New Order Received — K&C Shopping",
    "",
    `${data.customerName} placed an order in ${data.shopName}.`,
    `Reference: ${data.reference}`,
    `Amount: ${formatNaira(data.totalKobo)}`,
    "",
    ...data.items.map((item) => `- ${item.name} x${item.quantity} — ${formatNaira(item.unitPriceKobo * item.quantity)}`),
    "",
    data.deliveryAddress ? `Deliver to: ${data.deliveryAddress}` : "",
    `Payment: ${data.paymentStatus}`,
    "",
    `Manage this order: ${data.orderUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    html: shell(
      subject,
      `New order ${data.reference} in ${data.shopName}`,
      body,
      "You are receiving this because you sell on K&C Shopping.",
    ),
    text,
  };
}

/** Sent to the customer when the seller marks the order out for delivery. */
export function outForDeliveryEmail(data: OrderEmailData) {
  const subject = "Your Order Is on Its Way! — K&C Shopping";

  const body = `
    <tr>
      <td style="padding:28px 28px 0;">
        <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#111;font-weight:normal;">
          Your order is on its way
        </h1>
        <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:${MUTED};">
          Good news — ${escapeHtml(data.shopName)} has dispatched your order.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 28px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid ${LINE};">
          <tr>
            <td style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED};">Reference</td>
            <td style="padding:14px 16px;font-family:'Courier New',monospace;font-size:14px;color:#111;text-align:right;">${escapeHtml(data.reference)}</td>
          </tr>
          <tr>
            <td style="padding:0 16px 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED};">Items</td>
            <td style="padding:0 16px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;text-align:right;">
              ${escapeHtml(data.items.map((item) => `${item.name} x${item.quantity}`).join(", "))}
            </td>
          </tr>
          ${data.deliveryAddress ? `<tr>
            <td style="padding:0 16px 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${MUTED};">Delivering to</td>
            <td style="padding:0 16px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;text-align:right;">${escapeHtml(data.deliveryAddress)}</td>
          </tr>` : ""}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${MUTED};">
        <p style="margin:0;">If anything looks wrong, reply to this email or contact the shop before accepting the delivery.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 28px 28px;">
        ${button(data.orderUrl, "View your order")}
      </td>
    </tr>`;

  const text = [
    "Your Order Is on Its Way! — K&C Shopping",
    "",
    `${data.shopName} has dispatched your order.`,
    `Reference: ${data.reference}`,
    `Items: ${data.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}`,
    data.deliveryAddress ? `Delivering to: ${data.deliveryAddress}` : "",
    "",
    `View your order: ${data.orderUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject,
    html: shell(
      subject,
      `Order ${data.reference} is out for delivery`,
      body,
      "You are receiving this because you placed an order on K&C Shopping.",
    ),
    text,
  };
}