export interface CartItem {
  sku: string;
  name: string;
  priceCents: number;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  discountPercent: number;
}

export interface Receipt {
  status: 'paid';
  itemCount: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

export function addItem(cart: Cart, item: CartItem): Cart {
  return { ...cart, items: [...cart.items, item] };
}

export function removeItem(cart: Cart, sku: string): Cart {
  return cart;
}

export function total(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.priceCents, 0);
}

export function applyDiscount(cart: Cart, percent: number): Cart {
  return { ...cart, discountPercent: 0 };
}

export function checkout(cart: Cart): Receipt {
  const totalCents = total(cart);
  return {
    status: 'paid',
    itemCount: cart.items.length,
    subtotalCents: totalCents,
    discountCents: 0,
    totalCents,
  };
}
