/**
 * Module exports.
 */

exports.Adapter = Adapter;

/**
 * Redis adapter constructor.
 */

function Adapter(options) {
  this.prefix = options.prefix ?? "";
  this.ttl = options.ttl || 86400;
  this.publish = options.publish;
  this.client = options.client;

  // numberOfSets # of sets you want to seperate your keys
  this.numberOfSets = options.numberOfSets || 10;
  this.interval = (this.ttl * 1000) / this.numberOfSets;
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

  const multi = this.client.multi();

  multi.sadd(this._socketKey(id), room).sadd(this._roomKey(room), id);

  if (this.ttl) {
    multi
      .expire(this._socketKey(id), this.ttl)
      .expire(this._roomKey(room), this.ttl);
  }

  multi.exec(cb);
};

/**
 * Get the list of rooms joined by the socket or the list
 * of all active rooms.
 *
 * @param {String} id Socket id
 * @param {Function} cb callback
 * @api public
 */

Adapter.prototype.get = function get(id, cb) {
  cb = cb || noop;

  if (id) {
    const socketKeys = this._getSocketKeys(id);
    this.client.sunion(socketKeys, cb);
    return;
  }

  this.client.keys(`${this.prefix}room:*`, (err, rooms) => {
    if (err) return cb(err);
    rooms = rooms.map((room) =>
      room.slice(`${this.prefix}room:`.length).replace(/\:(\d*)$/g, "")
    );

    rooms = Array.from(new Set(rooms));

    cb(undefined, rooms);
  });
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
  if (!room) return this.delAll(id, cb);

  cb = cb || noop;

  var multi = this.client.multi();

  var i = 0;
  for (; i < this.numberOfSets; i++) {
    multi.srem(this._roomKey(room, i), id);
    multi.srem(this._socketKey(id, i), room);
  }

  multi.exec(cb);
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
  const rooms = (opts.rooms = opts.rooms || []);
  const except = (opts.except = opts.except || []);
  const method = (opts.method = opts.method || "write");
  const ids = {};

  this.publish(data, "room", opts);

  if (rooms.length) {
    const multi = this.client.multi();
    rooms.forEach((room) => {
      const roomKeys = this._getRoomKeys(room);
      multi.sunion(roomKeys);
    });

    multi.exec((err, replies) => {
      if (err) {
        return cb(err);
      }

      replies.forEach((roomIds) => {
        roomIds.forEach((id) => {
          if (ids[id] || except.indexOf(id) !== -1) return;
          if (!clients[id]) return;
          clients[id][method].apply(clients[id], data);
          ids[id] = true;
        });
      });

      cb();
    });
  } else {
    // TODO replace this `KEYS` should be only used for debugging
    this.client.keys("socket:*", (err, sockets) => {
      if (err) {
        return cb(err);
      }

      let ids = sockets.map((key) =>
        key.slice(`${this.prefix}socket:`.length).replace(/\:(\d+)$/, "")
      );
      ids = Array.from(new Set(ids));
      ids.forEach((id) => {
        if (except.indexOf(id) !== -1) return;
        if (!clients[id]) return;
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
  const roomKeys = this._getRoomKeys(room);
  this.client.sunion(roomKeys, cb);
};

/**
 * Remove all sockets from a room.
 *
 * @param {String|Array} room
 * @param {Function} cb Callback
 * @api public
 */

Adapter.prototype.empty = function empty(room, cb) {
  const multi = this.client.multi();
  const roomKeys = this._getRoomKeys(room);
  roomKeys.forEach((key) => {
    multi.del(key);
  });
  multi.exec(cb);
};

/**
 * Check to see if a room is empty.
 *
 * @param {String} room
 * @param {Function} cb Callback
 * @api public
 */
Adapter.prototype.isEmpty = function isEmpty(room, cb) {
  const roomKeys = this._getRoomKeys(room);
  this.client.sunion(roomKeys, (err, clients) => {
    if (err) {
      cb(err);
      return;
    }

    cb(null, clients.length === 0);
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
  this.get(id, (err, rooms) => {
    if (err) {
      return cb(err);
    }

    const multi = this.client.multi();

    // Remove id from each rooms.
    rooms.forEach((room) => {
      const roomKeys = this._getRoomKeys(room);
      roomKeys.forEach((key) => {
        multi.srem(key, id);
      });
    });

    const socketKeys = this._getSocketKeys(id);

    // Remove id key.
    socketKeys.forEach((key) => {
      multi.del(key);
    });

    multi.exec(cb);
  });
};

Adapter.prototype._getRoomKeys = function (room) {
  const roomKeys = [];
  for (let i = 0; i < this.numberOfSets; i++) {
    roomKeys.push(this._roomKey(room, i));
  }
  return roomKeys;
};

Adapter.prototype._roomKey = function (room, offset) {
  const time = this._getTimeFraction(offset);
  return `${this.prefix}room:${room}:${time}`;
};

Adapter.prototype._getSocketKeys = function (room) {
  const roomKeys = [];
  for (let i = 0; i < this.numberOfSets; i++) {
    roomKeys.push(this._socketKey(room, i));
  }
  return roomKeys;
};

Adapter.prototype._socketKey = function (id, offset) {
  const time = this._getTimeFraction(offset);
  return `${this.prefix}socket:${id}:${time}`;
};

Adapter.prototype._getTimeFraction = function (offset) {
  const now = Date.now();
  offset = offset || 0;
  const interval = this.interval;
  return Math.floor(now / interval) - offset;
};

/**
 * Noop function.
 */

function noop() {}
