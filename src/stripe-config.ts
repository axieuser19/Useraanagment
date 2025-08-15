export interface StripeProduct {
  id: string;
  priceId: string;
  name: string;
  description: string;
  mode: 'payment' | 'subscription';
  price: number;
}

// Base products that don't change
export const baseStripeProducts: StripeProduct[] = [
  // Standard plan hidden - frontend only change
  // {
  //   id: 'standard_product',
  //   priceId: 'standard_price',
  //   name: 'Standard',
  //   description: 'Pause your subscription while keeping your account and data safe',
  //   mode: 'subscription',
  //   price: 0.00,
  // },
];

// Function to create dynamic products with real IDs
export function createStripeProducts(productConfig?: any): StripeProduct[] {
  return [
    ...baseStripeProducts,
    {
      id: productConfig?.pro?.product_id || import.meta.env.VITE_STRIPE_PRO_PRODUCT_ID || 'your_stripe_pro_product_id_here',
      priceId: productConfig?.pro?.price_id || import.meta.env.VITE_STRIPE_PRO_PRICE_ID || 'your_stripe_pro_price_id_here',
      name: 'Go Pro',
      description: 'Advanced AI workflows with unlimited access',
      mode: 'subscription',
      price: 45.00,
    },
    {
      id: productConfig?.limited_time?.product_id || import.meta.env.VITE_STRIPE_LIMITED_TIME_PRODUCT_ID || 'your_stripe_limited_time_product_id_here',
      priceId: productConfig?.limited_time?.price_id || import.meta.env.VITE_STRIPE_LIMITED_TIME_PRICE_ID || 'your_stripe_limited_time_price_id_here',
      name: 'Limited Time',
      description: 'Special limited time offer',
      mode: 'subscription',
      price: 5.00,
    },
    // TEAM PRO TEMPORARILY HIDDEN
    // {
    //   id: productConfig?.team?.product_id || 'your_stripe_team_product_id_here',
    //   priceId: productConfig?.team?.price_id || 'your_stripe_team_price_id_here',
    //   name: 'Team Pro',
    //   description: 'Team subscription with management capabilities for up to 5 members',
    //   mode: 'subscription',
    //   price: 175.00,
    // },
  ];
}

// Default export for backward compatibility
export const stripeProducts = createStripeProducts();

export const getProductById = (id: string): StripeProduct | undefined => {
  return stripeProducts.find(product => product.id === id);
};

export const getProductByPriceId = (priceId: string): StripeProduct | undefined => {
  return stripeProducts.find(product => product.priceId === priceId);
};