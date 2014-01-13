# primus-redis
[![Build Status](https://travis-ci.org/mmalecki/primus-redis.png)](https://travis-ci.org/mmalecki/primus-redis)

`primus-redis` is a Redis store for [Primus](https://github.com/primus/primus).
It takes care of distributing messages to other instances using [Redis Pub/Sub](http://redis.io/topics/pubsub).

## Usage

```js
var http = require('http');
var Primus = require('primus');
var PrimusRedis = require('primus-redis');

var server = http.createServer();
var primus = new Primus(server, {
  redis: {
    createClient: createClient,
    channel: 'primus' // Optionale, defaults to `'primus'`
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

## License

MIT