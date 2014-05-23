var util = require('util');
var PrimusAdapter = require('primus-rooms-adapter');

/**
 * Module interface.
 */

module.exports = Adapter;

/**
 * Create a new adapter.
 *
 * @param {Object} options
 * @param {Function} options.publish
 */

function Adapter(options) {
  PrimusAdapter.call(this);
  this.publish = options.publish;
}

util.inherits(Adapter, PrimusAdapter);

/**
 * Broadcasts a packet.
 *
 * Options:
 *  - `except` {Array} sids that should be excluded
 *  - `rooms` {Array} list of rooms to broadcast to
 *  - `method` {String} 'write' or 'send' if primus-emitter is present
 *
 * @param {Object} data
 * @param {Object} opts
 * @param {Object} clients Connected clients
 * @api public
 */

Adapter.prototype.broadcast = function broadcast(data, opts, clients) {
  this.publish(data, 'room', opts);
  return PrimusAdapter.prototype.broadcast.apply(this, arguments);
};