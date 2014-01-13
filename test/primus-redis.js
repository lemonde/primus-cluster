var http = require('http');
var Primus = require('primus');
var redis = require('redis');
var PrimusRedis = require('..');
var expect = require('chai').expect;
var PORT = 3456;

describe('PrimusRedis', function () {
  var primus0, primus1, getClient;

  beforeEach(function () {
    primus0 = createPrimus();
    primus1 = createPrimus();

    function createPrimus() {
      var server = http.createServer();
      var primus = new Primus(server, {
        redis: {
          createClient: redis.createClient.bind(redis)
        },
        transformer: 'websockets'
      });
      primus.use('redis', PrimusRedis);
      server.listen(PORT++);
      return primus;
    }

    getClient = function getClient(primus) {
      var client = new (primus.Socket)('http://localhost:' + --PORT);
      client.on('data', function (msg) {
        expect(msg).to.equal('Hello world');
        client.end();
      });
    };
  });

  it('should send message to clients', function () {
    getClient(primus0);
    getClient(primus1);
    primus0.write('Hello world');
  });
});