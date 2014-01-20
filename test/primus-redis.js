var http = require('http');
var Primus = require('primus');
var redis = require('redis');
var PrimusRedis = require('..');
var expect = require('chai').expect;
var PORT = 3456;

describe('PrimusRedis', function () {
  var primus0, primus1, expectClientToReceive;

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

    expectClientToReceive = function getClient(primus, expectedMsg) {
      var client = new (primus.Socket)('http://localhost:' + --PORT);
      client.on('data', function (msg) {
        expect(expectedMsg).to.equal(msg);
        client.end();
      });
    };
  });

  it('should "write" message to clients', function () {
    expectClientToReceive(primus0, 'Hello world');
    expectClientToReceive(primus1, 'Hello world');
    primus0.write('Hello world');
  });
});