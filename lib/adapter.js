/**
 * Module dependencies.
 */

var socketKey = require('./keys/socket');
var roomKey = require('./keys/room');

/**
 * Module exports.
 */

module.exports = Adapter;

/**
 * Redis adapter constructor.
 */

function Adapter(options){
  this.ttl = options.ttl;
  this.publish = options.publish;
  this.client = options.client;
}

/**
 * Adds a socket to a room.
 *
 * @param {String} id Socket id
 * @param {String} room The room name
 * @param {Function} cb Callback
 * @api public
 */

Adapter.prototype.add = function add(id, room, cb) {
  cb = cb || noop;

  var multi = this.client.multi();

  multi
  .sadd(socketKey.format(id), room)
  .sadd(roomKey.format(room), id);

  if (this.ttl) {
    multi
    .expire(socketKey.format(id), this.ttl)
    .expire(roomKey.format(room), this.ttl);
  }

  multi.exec(cb);
};

/**
 * Get rooms socket is subscribed to.
 *
 * @param {String} id Socket id
 * @param {Function} cb callback
 * @api public
 */

Adapter.prototype.get = function get(id, cb) {
  cb = cb || noop;
  this.client.smembers(socketKey.format(id), cb);
};

/**
 * Removes a socket from a room or from all rooms
 * if a room is not passed.
 *
 * @param {String} id Socket id
 * @param {String|Function} [room] The room name or callback
 * @param {Function} cb Callback
 * @api public
 */

Adapter.prototype.del = function del(id, room, cb) {
  if (! cb) return this.delAll(id, room);

  cb = cb || noop;

  this.client.multi()
    .srem(socketKey.format(id), room)
    .srem(roomKey.format(room), id)
    .exec(cb);
};

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
 * @param {Function} cb Callback
 * @api public
 */

Adapter.prototype.broadcast = function broadcast(data, opts, clients, cb) {
  opts = opts || {};
  cb = cb || noop;
  var rooms = opts.rooms = opts.rooms || [];
  var except = opts.except = opts.except || [];
  var method = opts.method = opts.method || 'write';
  var ids = {};

  this.publish(data, 'room', opts);

  if (rooms.length) {
    var multi = this.client.multi();
    rooms.forEach(function (room) {
      multi.smembers(roomKey.format(room));
    });
    multi.exec(function (err, replies) {
      if (err) return cb(err);

      replies.forEach(function (roomIds) {
        roomIds.forEach(function (id) {
          if (ids[id] || except.indexOf(id) !== -1) return;
          if (! clients[id]) return ;
          clients[id][method].apply(clients[id], data);
          ids[id] = true;
        });
      });

      cb();
    });
  } else {
    this.client.keys('socket:*', function (err, sockets) {
      if (err) return cb(err);

      var ids = sockets.map(socketKey.parse);
      ids.forEach(function (id) {
        if (except.indexOf(id) !== -1) return;
        if (! clients[id]) return ;
        clients[id][method].apply(clients[id], data);
      });

      cb();
    });
  }
};

/**
 * Get client ids connected to this room.
 *
 * @param {String} room The room name
 * @param {Function} cb Callback
 * @api public
 */

Adapter.prototype.clients = function clients(room, cb) {
  this.client.smembers(roomKey.format(room), cb);
};

/**
 * Remove all sockets from a room.
 *
 * @param {String|Array} room
 * @param {Function} cb Callback
 * @api public
 */

Adapter.prototype.empty = function empty(room, cb) {
  this.client.del(roomKey.format(room), cb);
};

/**
 * Check to see if a room is empty.
 *
 * @param {String} room
 * @param {Function} cb Callback
 * @api public
 */

Adapter.prototype.isEmpty = function isEmpty(room, cb) {
  this.client.exists(roomKey.format(room), function (err, exists) {
    cb(err, ! exists);
  });
};

/**
 * Removes a socket from all rooms it's joined.
 *
 * @param {String} id Socket id
 * @param {Function} cb Callback
 */

Adapter.prototype.delAll = function delAll(id, cb) {
  cb = cb || noop;

  // Get rooms.
  this.get(id, function (err, rooms) {
    if (err) return cb(err);

    var multi = this.client.multi();

    // Remove id from each rooms.
    rooms.forEach(function (room) {
      multi.srem(roomKey.format(room), id);
    });

    // Remove id key.
    multi.del(socketKey.format(id));

    multi.exec(cb);
  }.bind(this));
};

/**
 * Noop function.
 */

function noop() {}