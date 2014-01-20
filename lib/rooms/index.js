/**
 * Module dependencies.
 */

var Adapter = require('./adapter');

/**
 * Expose module.
 */

module.exports = rooms;

/**
 * Rooms plugin.
 * Attach a redis rooms adapter.
 */

function rooms(primus, options) {
  if (! primus.$ || ! primus.$.rooms) return ;

  options.redis.rooms = options.redis.rooms || {};

  // Create redis rooms client.
  var roomsClient = options.redis.createClient();

  // Create rooms adapter.
  var roomsAdapter = new Adapter({
    client: roomsClient,
    ttl: options.redis.rooms.ttl
  });

  // Replace the default adapter to ensure our adapter
  // is used in every new channel.
  primus.$.rooms.Adapter = function () {
    return roomsAdapter;
  };

  // Use our adapter on the actual primus instance.
  primus.adapter(roomsAdapter);

  // Listen "close" event to quit redis client when primus is destroyed.
  primus.on('close', function () {
    roomsClient.quit();
  });
}