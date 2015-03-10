define(function(require) {
  return {
    push: function(data) {
      var image = new Image(1,1); 
      image.src = "//www.facebook.com/offsite_event.php?id=" + data.pixel + "&amp;value=" + data.value + "&amp;currency=USD";

      console.log("Pixel pushed: ", data.pixel, data.value);
    }
  }
});
