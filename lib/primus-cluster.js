/**
 * Module dependencies.
 */

const { Adapter } = require("./adapter");

/**
 * Expose module.
 */

exports.server = function (primus, options) {
  return new PrimusCluster(primus, options);
};

/**
 * Create a new PrimusCluster instance.
 * Enable pub/sub for write and send method (if avalaible).
 *
 * @param {Primus} primus
 * @param {Object} options
 */

function PrimusCluster(
  primus,
  {
    cluster: {
      prefix = "primus-cluster:",
      channel = `${prefix}pubsub`,
      ttl = 86400,
      redis = {},
    } = {},
  } = {}
) {
  this.primus = primus;
  this.channel = channel;
  this.silent = false;

  // Generate a random id for this cluster node.
  this.id = Math.random();

  this.initializeClients(redis);
  this.initializeAdapter({ ttl, prefix });
  this.wrapPrimusMethods();
  this.initializeMessageDispatcher();

  this.primus.on("close", this.close.bind(this));
}

/**
 * Initialize Redis clients.
 */

PrimusCluster.prototype.initializeClients = function initializeClients(
  options
) {
  this.clients = {};

  // Create redis clients.
  ["pub", "sub", "storage"].forEach(
    function (name) {
      var client = createClient();

      // Forward errors to Primus.
      client.on(
        "error",
        function (err) {
          this.primus.emit("error", err);
        }.bind(this)
      );

      this.clients[name] = client;
    }.bind(this)
  );

  /**
   * Create a new redis client.
   *
   * @returns {RedisClient}
   */

  function createClient() {
    if (typeof options === "function") return options();

    try {
      return require("redis").createClient(options);
    } catch (err) {
      throw new Error("You must add redis as dependency.");
    }
  }
};

PrimusCluster.prototype.initializeAdapter = function initializeAdapter({
  ttl,
  prefix,
}) {
  // Create adapter.
  const adapter = new Adapter({
    publish: this.publish.bind(this),
    client: this.clients.storage,
    ttl: ttl,
    prefix,
  });

  // Replace adapter in options.
  this.primus.options.rooms = this.primus.options.rooms || {};
  this.primus.options.rooms.adapter = adapter;

  // Replace adapter in primus and in rooms plugin.
  if (this.primus.adapter) this.primus.adapter = adapter;
  if (this.primus._rooms) this.primus._rooms.adapter = adapter;
};

/**
 * Wrap primus methods.
 */

PrimusCluster.prototype.wrapPrimusMethods = function wrapPrimusMethods() {
  ["write", "send"].forEach((method) => {
    if (!this.primus[method]) return;
    this.primus["__original" + method] = this.primus[method];
    Object.defineProperty(this.primus, method, {
      value: (...args) => {
        this.publish(args, "primus", { method: method });
        this.primus["__original" + method].apply(this.primus, args);
      },
    });
  });
};

/**
 * Initialize the message dispatcher to dispatch message over cluster nodes.
 */

PrimusCluster.prototype.initializeMessageDispatcher =
  function initializeMessageDispatcher() {
    this.clients.sub.subscribe(this.channel);

    this.clients.sub.on("message", (channel, message) => {
      this.dispatchMessage(message);
    });
  };

/**
 * Dispatch message depending on its type.
 *
 * @param {Object} msg
 */

PrimusCluster.prototype.dispatchMessage = function dispatchMessage(msg) {
  this.primus.decoder(msg, (err, msg) => {
    // Do a "save" emit('error') when we fail to parse a message. We don't
    // want to throw here as listening to errors should be optional.
    if (err) {
      if (this.primus.listeners("error").length) {
        this.primus.emit("error", err);
      }
      return;
    }

    // If message have no type, we ignore it.
    if (!msg.type) return;

    // If we are the emitter, we ignore it.
    if (msg.id === this.id) return;

    this.callDispatcher(msg);
  });
};

/**
 * Call the dispatcher in silent mode.
 *
 * @param {Object} msg
 */

PrimusCluster.prototype.callDispatcher = function callDispatcher(msg) {
  // Enter silent mode.
  this.silent = true;

  // Call the dispatcher.
  this[msg.type + "MessageDispatcher"](msg);

  // Exit silent mode.
  this.silent = false;
};

/**
 * Room message dispatcher.
 * Handle message published by adapter.
 *
 * @param {Object} msg
 */

PrimusCluster.prototype.roomMessageDispatcher = function roomMessageDispatcher(
  msg
) {
  msg.opts.rooms.forEach((room) => {
    const rooms = this.primus.room(room).except(msg.opts.except);
    rooms[msg.opts.method].apply(rooms, Array.from(msg.data));
  });
};

/**
 * Primus message dispatcher.
 * Write message on the current primus server.
 *
 * @param {Object} msg
 */

PrimusCluster.prototype.primusMessageDispatcher =
  function primusMessageDispatcher(msg) {
    this.primus["__original" + msg.opts.method].apply(
      this.primus,
      Array.from(msg.data)
    );
  };

/**
 * Publish message over the cluster.
 *
 * @param {mixed} data
 * @param {String} type ('primus', 'room')
 * @param {Object} [opts]
 */

PrimusCluster.prototype.publish = function publish(data, type, opts = {}) {
  // In silent mode, we do nothing.
  if (this.silent) return;

  const message = {
    id: this.id,
    data: data,
    type: type,
    opts: opts,
  };

  this.primus.encoder(message, (err, msg) => {
    // Do a "save" emit('error') when we fail to parse a message. We don't
    // want to throw here as listening to errors should be optional.
    if (err) {
      if (this.primus.listeners("error").length) {
        this.primus.emit("error", err);
      }
      return;
    }

    this.clients.pub.publish(this.channel, msg);
  });
};

/**
 * Called when primus is closed.
 * Quit all redis clients.
 */

PrimusCluster.prototype.close = function close() {
  Object.values(this.clients).forEach((client) => {
    client.quit();
  });
};
