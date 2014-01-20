# primus-redis
[![Build Status](https://travis-ci.org/neoziro/primus-redis.png)](https://travis-ci.org/neoziro/primus-redis)

`primus-redis` is a Redis store for [Primus](https://github.com/primus/primus).
It takes care of distributing messages to other instances using [Redis Pub/Sub](http://redis.io/topics/pubsub).

This fork of primus redis work with [primus-emitter](https://github.com/cayasso/primus-emitter/), [primus-rooms](https://github.com/cayasso/primus-rooms/), and [primus-resource](https://github.com/cayasso/primus-resource/).

It doesn't work with [primus-multiplex](https://github.com/cayasso/primus-multiplex/), so if you want to use [primus-resource](https://github.com/cayasso/primus-resource/), you must take care of requiring resource with the multiplex option setted to `false`.

## Usage

```js
var http = require('http');
var Primus = require('primus');
var PrimusRedis = require('primus-redis');

var server = http.createServer();
var primus = new Primus(server, {
  redis: {
    createClient: createClient,
    channel: 'primus', // Optional, defaults to `'primus'`
    rooms: {
      ttl: 2000 // Optional, defaults to `86400000` (one day).
    }
  }
});

// Create redis client.
function createClient() {
  var client = redis.createClient({
    host: 'localhost'
  });

  // You can choose another db.
  client.select(1);

  return client;
}

primus.use('redis', PrimusRedis);
```

## Use with other plugins

When you use primus-redis with other plugins, you must take care of calling primus-redis after all plugins.


```js
primus.use('rooms', PrimusRooms);
primus.use('rooms', PrimusEmitter);
primus.use('redis', PrimusRedis);
```

## License

MIT