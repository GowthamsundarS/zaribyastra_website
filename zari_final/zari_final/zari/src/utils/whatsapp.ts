import { formatINR } from "../data/catalog";

export const ADMIN_WHATSAPP = "918086545337";

export interface OrderLine {
  name: string;
  size: string;
  quantity: number;
  price: number;
}

const ORDERS_KEY = "zari.orders.v1";

export function recordOrder(lines: OrderLine[], total: number): void {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    const orders = raw ? (JSON.parse(raw) as unknown[]) : [];
    orders.push({ at: Date.now(), lines, total });
    localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  } catch {
    /* non-critical */
  }
}

export function orderCount(): number {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  } catch {
    return 0;
  }
}

export function buildOrderMessage(
  lines: OrderLine[],
  total: number,
  customerName?: string
): string {
  const parts: string[] = [];
  parts.push(`Hello ZARI, I would like to purchase:`);
  parts.push(``);
  for (const l of lines) {
    parts.push(`Product: ${l.name}`);
    parts.push(`Size: ${l.size}`);
    parts.push(`Quantity: ${l.quantity}`);
    parts.push(`Price: ${formatINR(l.price)} each`);
    parts.push(``);
  }
  parts.push(`Total: ${formatINR(total)}`);
  if (customerName?.trim()) parts.push(`Name: ${customerName.trim()}`);
  parts.push(``);
  parts.push(`Please confirm my order.`);
  return parts.join("\n");
}

export function openWhatsAppOrder(
  lines: OrderLine[],
  total: number,
  customerName?: string
): void {
  const message = buildOrderMessage(lines, total, customerName);
  recordOrder(lines, total);
  window.open(
    `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener"
  );
}
