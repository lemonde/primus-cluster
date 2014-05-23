var sinon = require('sinon');
var expect = require('chai').use(require('sinon-chai')).expect;
var Adapter = require('../lib/adapter');
var PrimusAdapter = require('primus-rooms-adapter');

describe('Adapter', function () {
  var adapter, client, publish;

  beforeEach(function () {
    publish = sinon.spy();
    adapter = new Adapter({
      client: client,
      publish: publish
    });
    sinon.spy(PrimusAdapter.prototype, 'broadcast');
  });

  afterEach(function () {
    PrimusAdapter.prototype.broadcast.restore();
  });

  describe('#broadcast', function () {
    it('should publish data and call parent prototype', function () {
      adapter.broadcast('some-data', { method: 'send', except: ['jose'] }, []);
      expect(publish).to.be.calledWith('some-data', 'room', { method: 'send', except: ['jose'] });
      expect(PrimusAdapter.prototype.broadcast).to.have.been.calledOnce;
      expect(PrimusAdapter.prototype.broadcast)
        .to.have.been.calledWith('some-data', { method: 'send', except: ['jose'] }, []);
    });
  });
});