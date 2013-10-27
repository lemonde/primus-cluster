var http = require('http'),
    assert = require('assert'),
    Primus = require('primus'),
    cb = require('assert-called'),
    PrimusRedis = require('../'),
    PORT = 3456;

var server = http.createServer(),
    primus0, primus1,
    clients = 0;

function getPrimus() {
  var server = http.createServer();
  var primus = new Primus(server, {
    redis: {
      host: 'localhost',
      port: 6379
    },
    transformer: 'websockets'
  });
  primus.use('Redis', PrimusRedis);
  server.listen(PORT++);
  return primus;
}

function getClient(primus) {
  ++clients;
  var client = new (primus.Socket)('http://localhost:' + --PORT);
  client.on('open', cb(function () {
    console.log('client open');
  }));
  client.on('data', cb(function (msg) {
    console.log('client got message');
    assert.equal(msg, 'Hello world');
    client.end();
    if (--clients === 0) {
      process.exit();
    }
  }));
}

primus0 = getPrimus();
primus1 = getPrimus();
getClient(primus0);
getClient(primus1);
primus0.write('Hello world');
