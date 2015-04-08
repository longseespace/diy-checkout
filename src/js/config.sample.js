// Checkout configuration

define(function(require) {
  return {
    // For testing on sandbox
    apiHost: 'https://api-sandbox.trycelery.com',
    debug: false,
    features: {
      taxes: false,
      coupons: false,
      shipping: false,
      conversionTracking: false,
      seal: false
    },
    pixels: {
      checkout: {
        pixel: '6021977713251',
        value: '0.0'
      },
      purchase: {
        pixel: '6021977717651',
        value: '0.0'
      }
    }
  };
});
