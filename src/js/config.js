// Checkout configuration

define(function(require) {
  return {
    // For testing on sandbox
    apiHost: 'https://api-sandbox.trycelery.com',
    debug: true,
    features: {
      taxes: false,
      coupons: false
    },
    pixels: {
      checkout: {
        pixel: '11111',
        value: '0.0'
      },
      purchase: {
        pixel: '22222',
        value: '0.0'
      }
    }
  };
});
