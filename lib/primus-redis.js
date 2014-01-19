/**
 * Module dependencies.
 */

var _ = require('lodash');
var RoomsAdapter = require('./rooms-adapter');

/**
 * Expose module.
 */

module.exports = PrimusRedis;

/**
 * Create a new PrimusRedis instance.
 *
 * @param {Primus} primus
 * @param {Object} options
 * @param {RedisClient} options.pub
 * @param {RedisClient} options.sub
 */

function PrimusRedis(primus, options) {
  // Create room adapter.
  var roomClient = options.redis.createClient();
  var roomsAdapter = new RoomsAdapter({
    client: roomClient,
    ttl: options.redis.ttl
  });
  var redisChannel = options.redis.channel || 'primus';

  // Set room adapter.
  if (primus.$ && primus.$.rooms) {
    primus.$.rooms.Adapter = function () {
      return roomsAdapter;
    };
    primus.adapter(roomsAdapter);
  }

  var sub = options.redis.createClient();
  var pub = options.redis.createClient();
  var id = Math.random();

  function publish(spark, method, args) {
    pub.publish(redisChannel, JSON.stringify({
      id: id,
      args: _.toArray(args),
      props: {
        _broadcast: spark._broadcast,
        _rms: spark._rms,
        _except: spark._except
      },
      method: method
    }));
  }

  var primusMethods = {};
  var sparkMethods = {};

  ['write', 'send'].forEach(function (method) {
    // Backup primus method.
    primusMethods[method] = primus[method];

    // Backup spark method.
    sparkMethods[method] = primus.Spark.prototype[method];

    // Wrap primus method.
    primus[method] = function () {
      publish(this, method, arguments);
      return primusMethods[method].apply(this, arguments);
    };

    // Wrap spark method.
    primus.Spark.prototype[method] = function () {
      if (this._broadcast) publish(this, method, arguments);
      return sparkMethods[method].apply(this, arguments);
    };
  });

  sub.subscribe(redisChannel);

  sub.on('message', function (channel, msg) {
    msg = JSON.parse(msg);
    if (msg.id === id) return ;

    // Backup properties.
    var properties = _.keys(msg.props);
    var bckProperties = _.pick(primus, properties);

    // Apply properties.
    _.extend(primus, msg.props);

    // Call write method.
    primusMethods[msg.method].apply(primus, msg.args);

    // Restore properties.
    _.extend(primus, bckProperties);
  });
}

/**
 * Expose server.
 */

PrimusRedis.server = PrimusRedis;

/**
 * Expose `RoomsAdapter` object.
 */

PrimusRedis.RoomsAdapter = RoomsAdapter;