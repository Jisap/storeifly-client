/**
 * Diccionario y utilidades para métodos de pago admitidos en StoreiFly.
 * Alineado con `VALID_PAYMENT_METHODS` del backend (`storeController.ts`).
 */

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash_on_delivery: "Cash on Delivery",
  mobile_money: "Mobile Money",
  bank_transfer: "Bank Transfer",
  cod: "Cash on Delivery",
};

/**
 * Convierte un código de método de pago (ej. 'cash_on_delivery') a un texto legible para clientes ('Cash on Delivery').
 */
export const formatPaymentMethod = (method?: string | null): string => {
  if (!method) return "Not specified";
  const clean = method.toLowerCase().trim();
  if (PAYMENT_METHOD_LABELS[clean]) {
    return PAYMENT_METHOD_LABELS[clean];
  }
  return clean
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};
