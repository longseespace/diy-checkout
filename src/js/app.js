define(function(require) {
  'use strict';

  var $ = require('jquery');
  var celeryClient = require('celery_client');
  var shop = require('shop');
  var coupon = require('coupon');
  var config = require('config');
  var debounce = require('util').debounce;

  var templates = require('templates/index');
  var overlayTemplate = templates.overlay;
  var modalTemplate = templates.modal;
  var formatMoney = require('format').formatMoney;
  var form = require('form').initialize();
  var confirmation = require('confirmation').initialize();

  require('jquery.transit');

  return {
    initialize: function(options) {
      if (this.initialized) {
        return this;
      }

      if (options && options.slug) {
        celeryClient.config.slug = options.slug;
      }

      var $overlay = this.$overlay = $(overlayTemplate());
      var $modal = this.$el = $(modalTemplate());
      var $form = this.$form = form.$el;
      var $confirmation = this.$confirmation = confirmation.$el;
      var self = this;

      this.children = [$overlay, $modal];

      // Tax cache
      this._taxes = {};

      // Binding
      $.each([
        'show',
        'hide',
        'updateOrderSummary',
        'updateDiscount',
        'createOrder',
        'handleOrder',
        'handleError',
        'showShop',
        'showConfirmation'
      ], $.proxy(function(i, methodName) {
        this[methodName] = $.proxy(this[methodName], this);
      }, this));

      this.$modalBody = $modal.find('.Celery-Modal-body');

      // Currently does not take slug from data-celery
      $(document.body).on('click', '[data-celery]', this.show);
      this.$el.on('click', '.Celery-ModalCloseButton', this.hide);

      $form.on('valid', this.createOrder);
      $form.on('change', 'select, [name=variant]', this.updateOrderSummary);
      $form.on('keyup', '[name=coupon]', debounce(this.updateDiscount, 500));
      $form.on('click', '.Celery-Button--shipping-info', this.showShippingForm);

      $form.on('change', '[name=country]', function(){
        if (self._getCountry() == 'us') {
          self.countryUpdated(true);
        } else {
          self.countryUpdated(false);
        }
      });

      $form.find('select').change();

      $form.on('click', '.Celery-ModalBackButton', this.showPaymentForm);

      this.showShop();

      this.initialized = true;

      if (navigator.appVersion.indexOf("Mac")!=-1) {
        $(document.body).addClass('mac');
      }

      // Zip cache
      this._zipcodes = {};
      $form.on('blur', '[name=zip]', function(){
        if (self._getCountry() == 'us') {
          self.autofill(self._getZip());  
        };
      });

      return this;
    },

    countryUpdated: function(isUS) {
      var $group = form.$el.find('#group-state');
      if (isUS) {
        $group.find('input').attr('disabled', 'disabled');
        $group.find('select').removeAttr('disabled').val('al');
        $group.find('.Celery-Select').removeClass('u-hidden');

        form.$el.find('[name=zip]').attr('placeholder', 'Zip Code').data('celery-validate', 'required');
        form.$el.find('[name=city]').data('celery-validate', 'required');
      } else {
        $group.find('input').removeAttr('disabled').val('');
        $group.find('select').attr('disabled', 'disabled');
        $group.find('.Celery-Select').addClass('u-hidden');

        form.$el.find('[name=zip]').attr('placeholder', 'Postal Code').data('celery-validate', '');
        form.$el.find('[name=city]').data('celery-validate', '');
      }
    },

    autofill: function(zip) {
      var lat;
      var lng;

      var compIsType = function(t, s) { 
        for(var z = 0; z < t.length; ++z) 
          if(t[z] == s)
            return true;
        return false;
      }

      var geocoder = new google.maps.Geocoder();
      geocoder.geocode({ 'address': zip }, function (results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
          geocoder.geocode({'latLng': results[0].geometry.location}, function(results, status) {
            if (status == google.maps.GeocoderStatus.OK) {
              if (results[1]) {
                var a = results[0].address_components;
                var city, state;
                for (var i = 0; i < a.length; ++i){
                  var t = a[i].types;
                  if (compIsType(t, 'administrative_area_level_1')) {
                    state = a[i].short_name.toLowerCase(); //store the state
                  } else if(compIsType(t, 'locality')) {
                    city = a[i].long_name; //store the city
                  }
                }
                
                form.$el.find('[name=city]').val(city);
                form.$el.find('[name=state]').val(state);
              }
            }
          });
        }
      }); 
    },

    loadShop: function() {
      // TODO: Support passing slug
      var el = $('[data-celery]').first();
      var slug = el && $(el).data('celery') || '';

      if (slug) {
        celeryClient.config.slug = slug;
      }

      var tasks = [this.updateVariants, this.updateOrderSummary];

      shop.fetch(function(){
        for (var i = 0; i < tasks.length; i++) {
          var task = tasks[i];
          task();
        };
      });
    },

    showShippingForm: function(e) {
      e.preventDefault();

      var $paymentInfo = $('#payment-info');
      var $shippingInfo = $('#shipping-info');
      var $buyButton = form.$el.find('.Celery-Button--buy');
      var $shippingButton = form.$el.find('.Celery-Button--shipping-info');

      var $closeButton = form.$el.find('.Celery-ModalCloseButton');
      var $backButton = form.$el.find('.Celery-ModalBackButton');

      if (!$shippingInfo.hasClass('u-hidden')) {
        return;
      };

      var $email = form.$el.find('.Celery-TextInput--email');
      var $cardNumber = form.$el.find('.Celery-TextInput--cardNumber');
      var $expiry = form.$el.find('.Celery-TextInput--expiry');
      var $cvc = form.$el.find('.Celery-TextInput--cvc');

      if (($email.hasClass('is-valid') && 
        $cardNumber.hasClass('is-valid') &&
        $expiry.hasClass('is-valid') &&
        $cvc.hasClass('is-valid')) || false) 
      {
        $paymentInfo.transition({ opacity: 0, x: -100 }, 400, function() {
          $paymentInfo.addClass('u-hidden');
          $shippingInfo.addClass('ready');
        });

        $shippingInfo.removeClass('u-hidden');

        $shippingInfo.transition({ opacity: 1 }, 600, function() {
          $shippingInfo.addClass('animated');
        })

        $buyButton.removeClass('u-hidden');
        $shippingButton.addClass('u-hidden');

        $backButton.removeClass('u-hidden');
        $closeButton.addClass('u-hidden');
      } else {
        form.validateField($email);
        form.validateField($cardNumber);
        form.validateField($expiry);
        form.validateField($cvc);
      }
    },

    showPaymentForm: function(e) {
      e.preventDefault();

      var $paymentInfo = $('#payment-info');
      var $shippingInfo = $('#shipping-info');
      var $buyButton = form.$el.find('.Celery-Button--buy');
      var $shippingButton = form.$el.find('.Celery-Button--shipping-info');

      var $closeButton = form.$el.find('.Celery-ModalCloseButton');
      var $backButton = form.$el.find('.Celery-ModalBackButton');

      $shippingInfo.removeClass('animated');
      $shippingInfo.removeClass('ready');

      $shippingInfo.transition({ opacity: 0 }, 400, function() {
        $shippingInfo.addClass('u-hidden');
      })

      $paymentInfo.removeClass('u-hidden');
      $paymentInfo.transition({ opacity: 1, x: 0 }, 400, function() {
        // $paymentInfo.addClass('u-hidden');
      });

      $buyButton.addClass('u-hidden');
      $shippingButton.removeClass('u-hidden');

      $backButton.addClass('u-hidden');
      $closeButton.removeClass('u-hidden');
    },

    updateVariants: function() {
      var shopData = shop.data;
      if (!shopData) return;

      var variants = shop.data.product.variants;
      if (!variants) return;

      var $variants = form.$el.find('.Celery-Form-group--variant select');
      $variants.html('');
      for (var i = 0; i < variants.length; i++) {
        var item = variants[i];
        $variants.append('<option value="'+item.id+'">'+item.name+'</option>');
      };
    },

    show: function() {
      var self = this;

      // Load shop data if it wasn't loaded yet
      if (!shop.data.user_id) {
        this.loadShop();
      }

      $(document.body).append(this.children);
      this.showShop();
      // Sets display
      this.$overlay.removeClass('u-hidden');
      this.$el.removeClass('u-hidden');

      // next tick
      setTimeout(function() {
        // is-hidden uses opacity/transform so the transition occurs
        self.$overlay.removeClass('is-hidden');
        self.$el.removeClass('is-hidden');
      }, 0);
      return this;
    },

    hide: function() {
      var self = this;

      this.clear();

      // is-hidden uses opacity/transform so the transition occurs
      this.$overlay.addClass('is-hidden');
      this.$el.addClass('is-hidden');

      setTimeout(function() {
        // Sets display after 300ms
        self.$overlay.addClass('u-hidden');
        self.$el.addClass('u-hidden');
        self.showShop();
      }, 300);

      return this;
    },

    clear: function() {
      this.$form.find('input').val('');
      this.$form.find('.is-invalid, .is-valid').removeClass('is-invalid is-valid');
    },

    updateOrderSummary: function() {
      var shopData = shop.data;

      if (!shopData) return;

      var quantity = this._getQuantity();
      var price = formatMoney(this._getPrice());
      var shipping = formatMoney(this._getShipping());

      var $form = this.$form;

      if (config.features.taxes && celeryClient.config.userId) {
        this.updateTaxes();
      }

      if (config.features.coupons && celeryClient.config.userId) {
        this.updateDiscount();
      }

      this.updateTotal();

      $form.find('.Celery-OrderSummary-price--price').text(price);
      $form.find('.Celery-OrderSummary-price--shipping').text(shipping);
      $form.find('.Celery-OrderSummary-number--quantity').text(quantity);
    },

    createOrder: function() {
      var order = this._generateOrder();

      celeryClient.createOrder(order, this.handleOrder);
    },

    handleOrder: function(err, res) {
      if (err) {
        return this.handleError(err);
      }

      this.showConfirmation(res.data);
      this.onConfirmation(res.data);
    },

    onConfirmation: function(data) {
      // Runs on confirmation with order data
    },

    handleError: function(err) {
      var $errors = this.$form.find('.Celery-FormSection--errors');

      $errors.find('.Celery-FormSection-body').text(err.message);
      $errors.removeClass('u-hidden');
      form.enableBuyButton();
    },

    hideErrors: function() {
      var $errors = this.$form.find('.Celery-FormSection--errors');
      $errors.addClass('u-hidden');
    },

    hideHeader: function() {
      this.$el.find('.Celery-Modal-header').addClass('is-hidden');
    },

    showHeader: function() {
      this.$el.find('.Celery-Modal-header').removeClass('is-hidden');
    },

    showShop: function() {
      this.showHeader();
      this.hideErrors();
      confirmation.$el.detach();
      this.$modalBody.append(this.$form);
    },

    showConfirmation: function(data) {
      confirmation.render(data);
      this.hideHeader();
      this.$form.detach();
      this.$modalBody.append(confirmation.$el);
    },

    updateTaxes: function() {
      var countryCode = this._getCountry();
      var zip = this._getZip();

      // Cache hit
      if (this._taxes[countryCode + zip] !== undefined) {
        var taxRate = this._taxes[countryCode + zip];
        var tax = taxRate * this._getSubtotal();

        tax = formatMoney(tax);
        this.$form.find('.Celery-OrderSummary-price--taxes').text(tax);
        this.updateTotal();

        return;
      }

      celeryClient.fetchTaxes({
        shipping_country: countryCode,
        shipping_zip: zip
      }, $.proxy(function(err, data) {
        if (err || !data || !data.data || data.data.base === undefined) {
          return;
        }

        this._taxes[countryCode + zip] = data.data.base;

        this.updateTaxes();
      }, this));
    },

    // Coupon adds a discount
    updateDiscount: function() {
      var code = this._getCouponCode();
      var priceSelector = '.Celery-OrderSummary-price--coupon';
      var operatorSelector = '.Celery-OrderSummary-operator.coupon';
      var lineSelector = '.Celery-OrderSummary-line.coupon';
      var groupSelector = lineSelector + ', ' + operatorSelector;

      coupon.validate(code, $.proxy(function(valid) {
        var discount;

        this.updateTotal();

        // TODO: Move coupon live validation to form
        form._setCouponValidationClass(valid);

        if (!valid || code === '') {
          $(groupSelector).hide();
          return;
        }

        // TODO: Discount logic instead of assuming single flat amount
        discount = formatMoney(this._getDiscount());

        $(priceSelector).text(discount);
        $(groupSelector).show();
      }, this));
    },

    updateTotal: function() {
      var total = formatMoney(this._getTotal());

      this.$form.find('.Celery-OrderSummary-price--total').text(total);
    },

    _generateOrder: function() {
      var $form = this.$form;
      var order = {
        buyer: {},
        shipping_address: {},
        line_items: [],
        payment_source: {
          card: {
            number: '',
            exp_month: '',
            exp_year: '',
            cvc: ''
          }
        }
      };

      order.user_id = shop.data.user_id;
      order.buyer.email = this._getFieldValue('email');

      // Card
      var card = order.payment_source.card;

      card.number = this._getFieldValue('card_number');
      card.cvc = this._getFieldValue('cvc');

      // Card Expiry
      var expiry = this._getFieldValue('expiry');
      var expiryParts = expiry.split('/');

      card.exp_month = expiryParts[0].trim();
      card.exp_year = expiryParts[1].trim();

      // Shipping
      order.shipping_address.first_name = this._getFirstName();
      order.shipping_address.last_name = this._getLastName();
      order.shipping_address.line1 = this._getAddress();
      order.shipping_address.line2 = this._getApt();
      order.shipping_address.zip = this._getZip();
      order.shipping_address.city = this._getCity();
      order.shipping_address.country = this._getCountry() || 'zz';
      
      // Buyer
      order.buyer.first_name = this._getFirstName();
      order.buyer.last_name = this._getLastName();
      order.buyer.notes = this._getNotes();

      // Coupon
      if (config.features.coupons) {
        var couponCode = this._getCouponCode();

        if (couponCode) {
          order.discount_codes = [couponCode];
        }
      }

      // Line Item
      var lineItem = {
        product_id: shop.data.product._id,
        variant_id: this._getVariant(),
        quantity: this._getQuantity()
      };

      order.line_items.push(lineItem);

      return order;
    },

    _getDiscount: function() {
      // TODO: Replace with coupon logic
      var code = this._getCouponCode();
      var data = coupon.data[code];

      return data && data.amount || 0;
    },

    _getCouponCode: function() {
      var code = this._getFieldValue('coupon') || '';

      return code.toLowerCase();
    },

    _getVariant: function() {
      return this._getFieldValue('variant');
    },

    _getQuantity: function() {
      return this._getFieldValue('quantity');
    },

    _getCountry: function() {
      return this._getFieldValue('country');
    },

    _getFirstName: function() {
      return this._getFieldValue('first_name');
    },

    _getLastName: function() {
      return this._getFieldValue('last_name');
    },

    _getAddress: function() {
      return this._getFieldValue('line1');
    },

    _getApt: function() {
      return this._getFieldValue('line2');
    },

    _getCity: function() {
      return this._getFieldValue('city');
    }, 

    _getState: function() {
      return this._getFieldValue('state');
    }, 

    _getZip: function() {
      return this._getFieldValue('zip');
    },

    _getNotes: function() {
      return this._getFieldValue('notes');
    },

    _getFieldValue: function(fieldName) {
      var $field = this.$form.find('[name=' + fieldName + ']:enabled');

      if (!$field.length) {
        return;
      }

      return $field.val();
    },

    _getPrice: function() {
      var product = shop.data.product;
      var variantId = this._getVariant();
      var variant = 0;

      if (product && product.variants && product.variants.length > 0 && variantId) {
        for (var i = 0; i < product.variants.length; i++) {
          var item = product.variants[i];
          if (item.id == variantId) {
            variant = item;
            break;
          };
        };
      }

      if (typeof(variant) === 'object') {
        return variant.price;
      };

      return product && product.price;
    },

    _getSubtotal: function() {
      return this._getPrice() * this._getQuantity();
    },

    _getShipping: function() {
      var quantity = this._getQuantity();
      var rates = this._getShippingRates();

      if (!rates) {
        return 0;
      }

      var base = rates.base || 0;
      var item = rates.item || 0;

      if (!base && !item) {
        return 0;
      }

      return base + ((quantity - 1) * item);
    },

    // Gets shipping rates based on country, falls back to base
    _getShippingRates: function() {
      var rates = shop.data.shipping_rates;
      var result = rates;

      if (!rates || !rates.countries || !rates.countries.length) {
        return result;
      }

      var countryCode = this._getCountry();

      $.each(rates.countries, function(i, country) {
        if (country.code === countryCode) {
          result = country;
          return;
        }
      });

      return result;
    },

    _getTaxes: function() {
      var countryCode = this._getCountry();
      var zip = this._getZip();

      if (this._taxes[countryCode + zip] !== undefined) {
        var taxRate = this._taxes[countryCode + zip];
        var taxes = taxRate * this._getSubtotal();

        return taxes;
      }

      return 0;
    },

    _getTotal: function() {
      var quantity = this._getQuantity();
      var price = this._getPrice();
      var shipping = this._getShipping();
      var discount = this._getDiscount();
      var taxes = this._getTaxes();

      return (quantity * price) + shipping + taxes - discount;
    }
  };
});
