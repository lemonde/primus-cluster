var redis = require('redis');
var async = require('async');
var sinon = require('sinon');
var expect = require('chai').use(require('sinon-chai')).expect;
var Adapter = require('../lib/adapter');

describe('Adapter', function () {
  var adapter, client, publish;

  beforeEach(function (done) {
    publish = sinon.spy();
    client = redis.createClient();
    adapter = new Adapter({
      client: client,
      publish: publish
    });

    client.flushdb(done);
  });

  afterEach(function (done) {
    client.flushdb(done);
  });

  describe('#add', function () {
    it('should add a socket into a room', function (done) {
      adapter.add('12', 'my:room:name', function (err) {
        if (err) return done(err);
        adapter.get('12', function(err, rooms){
          if (err) return done(err);

          expect(rooms).to.contain('my:room:name');
          done();
        });
      });
    });

    it('should expire after given ttl', function (done) {
      adapter.ttl = 1;
      adapter.add('12', 'my:room:name', function (err) {
        if (err) return done(err);
        setTimeout(function(){
          adapter.get('12', function(err, rooms) {
            if (err) return done(err);

            expect(rooms).to.not.contain('my:room:name');
            done();
          });
        }, 1100);
      });
    });

    it('should not expire', function (done) {
      adapter.ttl = 100;
      adapter.add('12', 'my:room:name', function (err) {
        if (err) return done(err);

        setTimeout(function(){
          adapter.get('12', function(err, rooms) {
            if (err) return done(err);

            expect(rooms).to.contain('my:room:name');
            done();
          });
        }, 1100);

      });
    });

  });

  describe('#get', function () {
    beforeEach(function (done) {
      async.series([
        adapter.add.bind(adapter, '12', 'my:room:name'),
        adapter.add.bind(adapter, '12', 'my:second:room:name')
      ], done);
    });

    it('should return client rooms', function (done) {
      adapter.get('12', function (err, rooms) {
        if (err) return done(err);
        expect(rooms).to.have.members(['my:room:name', 'my:second:room:name']);
        done();
      });
    });

    it('should return all rooms when the `id` argument is falsy', function (done) {
      adapter.get(null, function (err, rooms) {
        if (err) return done(err);
        expect(rooms).to.have.members(['my:room:name', 'my:second:room:name']);
        done();
      });
    });
  });

  describe('#del', function () {
    beforeEach(function (done) {
      async.series([
        adapter.add.bind(adapter, '12', 'my:room:name'),
        adapter.add.bind(adapter, '12', 'my:second:room:name')
      ], done);
    });

    it('should remove room from a client', function (done) {
      adapter.del('12', 'my:room:name', function (err) {
        if (err) return done(err);
        adapter.get('12', function(err, rooms) {
          if (err) return done(err);

          expect(rooms).to.not.contain('my:room:name');
          done();
        });
      });
    });

    it('should remove client from a room', function(done){
      adapter.del('12', 'my:room:name', function (err) {
        if (err) return done(err);
        adapter.clients('my:room:name', function(err, client) {
          if (err) return done(err);

          expect(client).to.not.contain('12');
          done();
        });
      });
    })

    it('should remove all rooms from the client if called without room', function (done) {
      adapter.del('12', null, function (err) {
        if (err) return done(err);
        adapter.get('12', function(err, rooms) {
          if (err) return done(err);
          expect(rooms).to.be.eql([]);
          done();
        });
      });
    });


    it('should remove client from all rooms if called without room', function (done) {
      adapter.del('12', null, function (err) {
        if (err) return done(err);

        async.series([
          adapter.clients.bind(adapter, 'my:room:name'),
          adapter.clients.bind(adapter, 'my:second:room:name')
        ], function(err, results) {
          results.forEach(function(result){
            expect(result).to.not.contain('12');
          });
          done();
        });
      });
    });

  });

  describe('#clients', function () {
    beforeEach(function (done) {
      async.series([
        adapter.add.bind(adapter, '12', 'my:room:name'),
        adapter.add.bind(adapter, '13', 'my:room:name')
      ], done);
    });

    it('should return clients', function (done) {
      adapter.clients('my:room:name', function (err, ids) {
        if (err) return done(err);
        expect(ids).to.have.members(['12', '13']);
        done();
      });
    });
  });

  describe('#broadcast', function () {
    var clients, data;

    beforeEach(function (done) {
      async.series([
        adapter.add.bind(adapter, 'marc', 'news'),
        adapter.add.bind(adapter, 'jose', 'sport'),
        adapter.add.bind(adapter, 'jose', 'news'),
        adapter.add.bind(adapter, 'greg', 'news'),
        adapter.add.bind(adapter, 'vincent', 'sport'),
        adapter.add.bind(adapter, 'ludowic', 'sport'),
        adapter.add.bind(adapter, 'ludowic', 'news'),
        adapter.add.bind(adapter, 'samuel', 'geek')
      ], done);

      function createSocket() {
        return {
          write: sinon.spy(),
          send: sinon.spy()
        };
      }

      clients = {
        'marc': createSocket(),
        'jose': createSocket(),
        'greg': createSocket(),
        'vincent': createSocket(),
        'ludowic': createSocket(),
        'samuel': createSocket()
      };

      data = ['mydata'];
    });

    it('should broadcast to all clients', function (done) {
      adapter.broadcast(data, {}, clients, function (err) {
        if (err) return done(err);
        Object.keys(clients).forEach(function (id) {
          var socket = clients[id];
          expect(socket.write).to.be.calledOnce;
        });
        done();
      });
    });

    it('should broadcast to a specific room', function (done) {
      adapter.broadcast(data, { rooms: ['sport', 'geek'] }, clients, function (err) {
        if (err) return done(err);
        expect(clients.marc.write).to.not.be.called;
        expect(clients.jose.write).to.be.calledOnce;
        expect(clients.greg.write).to.not.be.called;
        expect(clients.vincent.write).to.be.calledOnce;
        expect(clients.ludowic.write).to.be.calledOnce;
        expect(clients.samuel.write).to.be.calledOnce;
        done();
      });
    });

    it('should not send to excepted clients (with rooms)', function (done) {
      adapter.broadcast(data, { rooms: ['sport', 'geek'], except: ['jose'] }, clients, function (err) {
        if (err) return done(err);
        expect(clients.marc.write).to.not.be.called;
        expect(clients.jose.write).to.not.be.called;
        expect(clients.greg.write).to.not.be.called;
        expect(clients.vincent.write).to.be.calledOnce;
        expect(clients.ludowic.write).to.be.calledOnce;
        expect(clients.samuel.write).to.be.calledOnce;
        done();
      });
    });

    it('should not send to excepted clients (without rooms)', function (done) {
      adapter.broadcast(data, { except: ['jose'] }, clients, function (err) {
        if (err) return done(err);
        expect(clients.marc.write).to.be.calledOnce;
        expect(clients.jose.write).to.not.be.called;
        expect(clients.greg.write).to.be.calledOnce;
        expect(clients.vincent.write).to.be.calledOnce;
        expect(clients.ludowic.write).to.be.calledOnce;
        expect(clients.samuel.write).to.be.calledOnce;
        done();
      });
    });

    it('should called a custom method', function (done) {
      adapter.broadcast(data, { method: 'send' }, clients, function (err) {
        if (err) return done(err);
        expect(clients.marc.send).to.be.calledOnce;
        expect(clients.jose.send).to.be.calledOnce;
        expect(clients.greg.send).to.be.calledOnce;
        expect(clients.vincent.send).to.be.calledOnce;
        expect(clients.ludowic.send).to.be.calledOnce;
        expect(clients.samuel.send).to.be.calledOnce;
        done();
      });
    });

    it('should publish data', function (done) {
      adapter.broadcast(data, { method: 'send', except: ['jose'] }, clients, function (err) {
        if (err) return done(err);
        expect(publish).to.be.calledWith(data, 'room', { method: 'send', except: ['jose'], rooms: [] });
        done();
      });
    });
  });

  describe('#empty', function () {
    beforeEach(function (done) {
      async.series([
        adapter.add.bind(adapter, '12', 'my:room:name'),
        adapter.add.bind(adapter, '13', 'my:room:name')
      ], done);
    });

    it('should remove all clients from a room', function (done) {
      adapter.empty('my:room:name', function (err) {
        if (err) return done(err);
        adapter.clients('my:room:name', function(err, clients){
          if (err) return done(err);
          expect(clients).to.have.length(0);
          done();
        })
      });
    });
  });

  describe('#isEmpty', function () {
    beforeEach(function (done) {
      async.series([
        adapter.add.bind(adapter, '12', 'my:room:name'),
        adapter.add.bind(adapter, '13', 'my:room:name')
      ], done);
    });

    it('should return true if the room is empty', function (done) {
      adapter.isEmpty('my:second:room:name', function (err, empty) {
        if (err) return done(err);
        expect(empty).to.be.true;
        done();
      });
    });

    it('should return false if the room is not empty', function (done) {
      adapter.isEmpty('my:room:name', function (err, empty) {
        if (err) return done(err);
        expect(empty).to.be.false;
        done();
      });
    });
  });

  describe("#_getTimeFraction", function() {
    beforeEach(function() {
      this.clock = sinon.useFakeTimers();
    });

    afterEach(function() {
      this.clock.restore();
    });

    it('should substract from the current time interval when offset provided', function() {
      var current = adapter._getTimeFraction();
      var oneBefore = adapter._getTimeFraction(1);
      expect(current - 1).to.be.equal(oneBefore);
    });

    it('should change fraction every 10 seconds if ttl is 100 seconds', function() {
      adapter = new Adapter({ttl: 100});
      var current = adapter._getTimeFraction();
      this.clock.tick(10 * 1000);
      var next = adapter._getTimeFraction();
      expect(current + 1).to.be.equal(next);
    });

    it('should change time every 2h and 24min by default', function() {
      var current = adapter._getTimeFraction();
      this.clock.tick( (2 * 60 + 24) * 60 * 1000 );
      var next = adapter._getTimeFraction();
      expect(current + 1).to.be.equal(next);
    });

  });
});