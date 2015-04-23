define('saspixel', function(require) {
  return {
    push: function(data) {
      var image = new Image(1,1); 
      var amount = data.amount / 100;
      image.src = "//shareasale.com/sale.cfm?amount="+ amount + "&tracking="+ data.orderId +"&transtype=sale&merchantID=" + data.merchantId;
    }
  }
});
