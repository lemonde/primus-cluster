/**
 * Module dependencies.
 */

var _ = require('lodash');

/**
 * Expose module.
 */

module.exports = function (primus, options) {
  return new PubSub(primus, options);
};

/**
 * Create a new PubSub instance.
 * Enable pub/sub for write and send method (if avalaible).
 *
 * @param {Primus} primus
 * @param {Object} options
 */

function PubSub(primus, options) {
  this.primus = primus;

  // Define redis channel.
  this.channel = options.redis.channel || 'primus';

  // Create pub and sub redis clients.
  this.pub = options.redis.createClient();
  this.sub = options.redis.createClient();
  this.id = Math.random();

  // Wrap "write" and "send" methods.
  this.wrapMethods();

  // Subscribe and listen messages on redis channel.
  this.sub.subscribe(this.channel);
  this.sub.on('message', this.onMessage.bind(this));

  // Listen "close" event.
  this.primus.on('close', this.onClose.bind(this));
}

/**
 * Publish a write over redis.
 */

PubSub.prototype.publish = function (spark, method, args) {
  this.pub.publish(this.channel, JSON.stringify({
    id: this.id,
    args: _.toArray(args),
    props: {
      _broadcast: spark._broadcast,
      _rms: spark._rms,
      _except: spark._except
    },
    method: method
  }));
};

/**
 * Wrap "write" and "send" methods to enable pub/sub on it.
 */

PubSub.prototype.wrapMethods = function () {
  this.primusMethods = {};
  this.sparkMethods = {};

  _.each(['write', 'send'], function (method) {
    this.wrapPrimusMethod(method);
    this.wrapSparkMethod(method);
  }, this);
};

/**
 * Wrap a primus method.
 *
 * @param {String} method
 */

PubSub.prototype.wrapPrimusMethod = function (method) {
  if (! this.primus[method]) return ;

  var self = this;

  // Backup primus method.
  this.primusMethods[method] = this.primus[method];

  // Wrap primus method.
  this.primus[method] = function () {
    self.publish(this, method, arguments);
    return self.primusMethods[method].apply(this, arguments);
  };
};

/**
 * Wrap spark method.
 *
 * @param {String} method
 */

PubSub.prototype.wrapSparkMethod = function (method) {
  if (! this.primus.Spark.prototype[method]) return ;

  var self = this;

  // Backup spark method.
  this.sparkMethods[method] = this.primus.Spark.prototype[method];

  // Wrap spark method.
  this.primus.Spark.prototype[method] = function () {
    if (this._broadcast) self.publish(this, method, arguments);
    return self.sparkMethods[method].apply(this, arguments);
  };
};

/**
 * On redis message.
 *
 * @param {String} channel
 * @param {String} msg
 */

PubSub.prototype.onMessage = function (channel, msg) {
  // Parse message.
  try { msg = JSON.parse(msg); }
  catch (err) { return ; }

  // If we are the emitter, we do nothing.
  if (msg.id === this.id) return ;

  // Backup properties.
  var properties = _.keys(msg.props);
  var bckProperties = _.pick(this.primus, properties);

  // Apply properties.
  _.extend(this.primus, msg.props);

  // Call write method.
  this.primusMethods[msg.method].apply(this.primus, msg.args);

  // Restore properties.
  _.extend(this.primus, bckProperties);
};

/**
 * Called when primus is destroyed.
 * Close pub/sub redis connections.
 */

PubSub.prototype.onClose = function () {
  this.pub.quit();
  this.sub.quit();
};