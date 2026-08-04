/**
 * Canonical permission-path keys used by assertPageWrite/can_write_page/
 * require_page_read across server functions. These are matched against
 * `user_section_access` rows and role defaults purely as opaque strings —
 * they are NOT guaranteed to be a live nav-registry route. ORDERS_PAGE in
 * particular outlived the standalone "/orders" page it was named after and
 * now gates order editing, returns, confirmations, Shopify sync and
 * WhatsApp from several different pages.
 *
 * Import from here instead of retyping the string literal, so renaming a
 * permission key is a single edit instead of a silent, ungrep-able mismatch
 * across files.
 */
export const ORDERS_PAGE = "/orders";
export const COURIERS_PAGE = "/couriers";
export const ORDER_DISTRIBUTION_PAGE = "/order-distribution";
