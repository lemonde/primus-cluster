# primus-cluster

![CI](https://github.com/lemonde/locky/workflows/CI/badge.svg)

Primus cluster runs Primus accross multiple servers, it use Redis to store data and distribute messages across Primus instances. For more informations you can see [Redis Pub/Sub](http://redis.io/topics/pubsub).

This project is a fork of the original project [primus-redis](https://github.com/mmalecki/primus-redis) that
is not compatible with other Primus plugins and with Primus v2+.

This plugin works with [primus-emitter](https://github.com/cayasso/primus-emitter/), [primus-rooms](https://github.com/cayasso/primus-rooms/), and [primus-resource](https://github.com/cayasso/primus-resource/).

## Usage

```js
const http = require("http");
const Primus = require("primus");
const PrimusCluster = require("primus-cluster");
const
const server = http.createServer();
const primus = new Primus(server);

primus.plugin("cluster", PrimusCluster);
```

## Options

### redis

Type: `Object` or `Function`

If you specify an **object**, the properties will be used to call `redis.createClient` method. The redis module used
will be the Redis module installed. This project doesn't have [node_redis](https://github.com/mranney/node_redis/) module as dependency.

```js
new Primus(server, {
  cluster: {
    redis: {
      port: 6379,
      host: "127.0.0.1",
      connect_timeout: 200,
    },
  },
});
```

If you specify a **function**, it will be called to create redis clients.

```js
const redis = require("redis");

new Primus(server, {
  cluster: {
    redis: createClient,
  },
});

function createClient() {
  const client = redis.createClient();
  client.select(1); // Choose a custom database.
  return client;
}
```

### channel

Type: `String`

The name of the channel to use, the default channel is "primus".

```js
new Primus(server, {
  cluster: {
    channel: "primus",
  },
});
```

### ttl

Type: `Number`

The TTL of the data stored in redis in second, the default value is 86400 (1 day). If you use [primus-rooms](https://github.com/cayasso/primus-rooms/), Primus cluster will store rooms data in redis.

```js
new Primus(server, {
  cluster: {
    ttl: 86400,
  },
});
```

## Use with other plugins

When you use primus-redis with other plugins, you must take care of calling primus-cluster after all plugins.

```js
primus.plugin("rooms", PrimusRooms);
primus.plugin("emitter", PrimusEmitter);
primus.plugin("cluster", PrimusCluster);
```

## License

MIT
