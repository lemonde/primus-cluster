/**
 * Module dependencies.
 */

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
  var createClient = options.redis.createClient;
  var channel = options.redis.channel || 'primus';
  var ttl = options.redis.ttl;
  var originalWrite = primus.write;
  var subscribed = false;
  var publishQueue = [];

  var sub = createClient();
  var pub = createClient();

  function subscribe() {
    sub.once('subscribe', function () {
      subscribed = true;
      drain();
    });
    sub.subscribe(channel);
  }

  function drain() {
    publishQueue.forEach(function (data) {
      pub.publish(channel, data);
    });
    publishQueue = [];
  }

  function publish(data) {
    if (! subscribed)
      return publishQueue.push(data);

    pub.publish(channel, data, function (err) {
      if (err) {
        subscribed = false;
        publishQueue.push(data);
        drain();
      }
    });
  }

  primus.write = publish;

  sub.on('message', function (channel, msg) {
    originalWrite.call(primus, msg);
  });

  subscribe();

  options.adapter = options.adapter || new RoomsAdapter({
    client: createClient(),
    ttl: ttl
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