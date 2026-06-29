# Cart Goal

Work through this checklist. You are done only when `bun playground/goals/check.ts` prints `5/5 done`.

- [ ] `addItem(cart, item)` adds a line item and merges quantities when the SKU already exists, without mutating the original cart.
- [ ] `removeItem(cart, sku)` removes matching items by SKU and keeps every other item.
- [ ] `total(cart)` returns the final total in cents, including item quantities and the cart discount.
- [ ] `applyDiscount(cart, percent)` returns a new cart with the discount percentage set.
- [ ] `checkout(cart)` returns a paid receipt with item count, subtotal, discount, and final total.
