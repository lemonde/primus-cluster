/**
 * Module dependencies.
 */

var rooms = require('./rooms');
var pubSub = require('./pub-sub');

/**
 * Expose module.
 */

exports.server = primusRedis;

/**
 * Create a new PrimusRedis instance.
 *
 * @param {Primus} primus
 * @param {Object} options
 * @param {Function} options.redis.createClient
 * @param {Number} options.redis.rooms.ttl
 */

function primusRedis(primus, options) {
  // Apply rooms.
  rooms(primus, options);
  // Apply pub/sub.
  pubSub(primus, options);
}