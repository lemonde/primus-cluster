var http = require('http');
var async = require('async');
var sinon = require('sinon');
var expect = require('chai').use(require('sinon-chai')).expect;
var Primus = require('primus');
var PrimusEmitter = require('primus-emitter');
var PrimusRooms = require('primus-rooms');
var PrimusCluster = require('..');
var redis = require('redis');

function createPrimus(options) {
  var server = http.createServer();
  var primus = new Primus(server, options);

  // Plugins.
  primus.use('emitter', PrimusEmitter);
  primus.use('rooms', PrimusRooms);
  primus.use('cluster', PrimusCluster);

  primus.on('connection', function (spark) {
    spark.join('myroom');
  });

  // Listen.
  server.listen(0);
  primus.port = server.address().port;

  return primus;
}

function getClient(primus, cb) {
  var client = new (primus.Socket)('http://localhost:' + primus.port);
  client.on('open', function () {
    cb(null, client);
  });
}

function expectClientToReceive(client, expectedMsg, cb) {
  client.on('data', function (msg) {
    expect(expectedMsg).to.eql(msg);
    cb();
  });
}

describe('Primus cluster', function () {

  describe('redis option', function () {
    beforeEach(function () {
      sinon.spy(redis, 'createClient');
    });

    afterEach(function () {
      redis.createClient.restore();
    });

    it('should accept nothing', function () {
      createPrimus();

      expect(redis.createClient).to.be.called;
    });

    it('should accept an object', function () {
      createPrimus({
        cluster: {
          redis: {
            host: 'localhost',
            port: 6379,
            socket_nodelay: true
          }
        }
      });

      expect(redis.createClient).to.be.calledWith(6379, 'localhost', { socket_nodelay: true });
    });

    it('should accept a function', function () {
      createPrimus({
        cluster: {
          redis: redis.createClient
        }
      });

      expect(redis.createClient).to.be.called;
    });
  });

  describe('E2E', function () {
    var servers, clients;

    beforeEach(function (done) {
      var cbs = [];
      servers = [];
      clients = [];

      for(var i = 0; i < 2; i ++) {
        servers[i] = createPrimus();
        cbs.push(getClient.bind(null, servers[i]));
      }

      async.parallel(cbs, function (err, _clients) {
        if (err) return done(err);
        clients = _clients;
        done();
      });
    });

    afterEach(function (done) {
      var destroys = servers.map(function (server) {
        return server.destroy.bind(server);
      });

      async.parallel(destroys, done);
    });

    it('should forward message using "write" method', function (done) {
      async.parallel([
        expectClientToReceive.bind(null, clients[0], 'hello'),
        expectClientToReceive.bind(null, clients[1], 'hello')
      ], done);

      servers[0].write('hello');
    });

    it('should forward message using "send" method', function (done) {
      async.parallel([
        expectClientToReceive.bind(null, clients[0], { type: 0, data: ['hello'] }),
        expectClientToReceive.bind(null, clients[1], { type: 0, data: ['hello'] })
      ], done);

      servers[0].send('hello');
    });

    it('should forward room message', function (done) {
      async.parallel([
        expectClientToReceive.bind(null, clients[0], 'hello'),
        expectClientToReceive.bind(null, clients[1], 'hello')
      ], done);

      servers[0].room('myroom').write('hello');
    });
  });
});