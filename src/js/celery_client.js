define('celery_client', function(require) {
  var Celery = require('celery-js');
  var config = require('config');

  return new Celery(config);
});
