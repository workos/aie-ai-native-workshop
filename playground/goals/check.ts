import { addItem, applyDiscount, checkout, removeItem, total } from './cart.ts';
import type { Cart, CartItem } from './cart.ts';

interface Check {
  label: string;
  run: () => void;
}

function assertEqual<T>(actual: T, expected: T, detail: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${detail}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const keyboard: CartItem = { sku: 'kbd', name: 'Keyboard', priceCents: 12000, quantity: 1 };
const cable: CartItem = { sku: 'usb', name: 'USB cable', priceCents: 1500, quantity: 2 };
const notebook: CartItem = { sku: 'note', name: 'Notebook', priceCents: 800, quantity: 3 };

const checks: Check[] = [
  {
    label: 'addItem merges matching SKUs without mutating the original cart',
    run: () => {
      const cart: Cart = { items: [keyboard], discountPercent: 0 };
      const next = addItem(cart, { ...keyboard, quantity: 2 });
      assertEqual(cart.items[0].quantity, 1, 'original quantity');
      assertEqual(next.items.length, 1, 'line count after merge');
      assertEqual(next.items[0].quantity, 3, 'merged quantity');
    },
  },
  {
    label: 'removeItem removes the requested SKU and keeps other items',
    run: () => {
      const cart: Cart = { items: [keyboard, cable, notebook], discountPercent: 0 };
      const next = removeItem(cart, 'usb');
      assertEqual(next.items.map((item) => item.sku), ['kbd', 'note'], 'remaining SKUs');
    },
  },
  {
    label: 'total includes quantities and discount',
    run: () => {
      const cart: Cart = { items: [cable, notebook], discountPercent: 20 };
      assertEqual(total(cart), 4320, 'discounted total cents');
    },
  },
  {
    label: 'applyDiscount returns a new cart with the requested percentage',
    run: () => {
      const cart: Cart = { items: [keyboard], discountPercent: 0 };
      const next = applyDiscount(cart, 15);
      assertEqual(cart.discountPercent, 0, 'original discount');
      assertEqual(next.discountPercent, 15, 'new discount');
    },
  },
  {
    label: 'checkout returns a paid receipt with subtotal, discount, and total',
    run: () => {
      const cart: Cart = { items: [keyboard, cable], discountPercent: 10 };
      assertEqual(checkout(cart), {
        status: 'paid',
        itemCount: 3,
        subtotalCents: 15000,
        discountCents: 1500,
        totalCents: 13500,
      }, 'receipt');
    },
  },
];

let done = 0;

for (const check of checks) {
  try {
    check.run();
    done += 1;
    console.log(`☑ ${check.label}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`☐ ${check.label} - ${message}`);
  }
}

console.log(`${done}/${checks.length} done`);
if (done !== checks.length) process.exit(1);
console.log(`✅ ${done}/${checks.length} done`);
