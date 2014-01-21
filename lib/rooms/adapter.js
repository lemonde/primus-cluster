/**
 * Module exports.
 */

module.exports = Adapter;

/**
 * Redis adapter constructor.
 */

function Adapter(options){
  this.client = options.client;
  this.ttl = options.ttl || 86400000;
}

/**
 * Adds a socket from a room.
 *
 * @param {String} id Socket id
 * @param {String} room The room name
 * @param {Function} cb Callback
 */

Adapter.prototype.add = function add(id, room, cb) {
  cb = cb || noop;

  var multi = this.client.multi();

  multi
  .sadd(socketKey(id), room)
  .sadd(roomKey(room), id);

  if (this.ttl) {
    var ttlSecond = Math.round(this.ttl / 1000);
    multi
    .expire(socketKey(id), ttlSecond)
    .expire(roomKey(room), ttlSecond);
  }

  multi.exec(cb);
};

/**
 * Get rooms socket is subscribed to.
 *
 * @param {String} id Socket id
 * @param {Function} cb callback
 */

Adapter.prototype.get = function get(id, cb) {
  cb = cb || noop;
  this.client.smembers(socketKey(id), cb);
};

/**
 * Removes a socket from a room.
 *
 * @param {String} id Socket id
 * @param {String} room The room name
 * @param {Function} cb Callback
 */

Adapter.prototype.del = function del(id, room, cb) {
  cb = cb || noop;
  this.client.multi()
    .srem(socketKey(id), room)
    .srem(roomKey(room), id)
    .exec(cb);
};

/**
 * Removes a socket from all rooms it's joined.
 *
 * @param {String} socket id
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
      multi.srem(roomKey(room), id);
    });

    // Remove id key.
    multi.del(socketKey(id));

    multi.exec(cb);
  }.bind(this));
};

/**
 * Get client ids connected to this room.
 *
 * @param {String} room The room name
 * @param {Function} cb Callback
 */

Adapter.prototype.clients = function clients(room, cb) {
  this.client.smembers(roomKey(room), cb);
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
  var rooms = opts.rooms || [];
  var except = opts.except || [];
  var method = opts.method || 'write';
  var ids = {};

  if (rooms.length) {
    var multi = this.client.multi();
    rooms.forEach(function (room) {
      multi.smembers(roomKey(room));
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

      var ids = sockets.map(socketValue);
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
 * Format a socket key.
 *
 * @param {String} id
 * @returns {String}
 */

function socketKey(id) {
  return 'socket:' + id;
}

/**
 * Get socket value from socket key.
 *
 * @param {String} key
 * @returns {String}
 */

function socketValue(key) {
  return key.replace(/^socket:/, '');
}

/**
 * Format a room key.
 *
 * @param {String} room
 * @returns {String}
 */

function roomKey(room) {
  return 'room:' + room;
}

/**
 * Noop function.
 */

function noop() {}