var expect = require('chai').expect;
var roomKey = require('../../lib/keys/socket');

describe('Socket key', function () {
  describe('#format', function () {
    it('should format key', function () {
      expect(roomKey.format('mysocket')).to.equal('socket:mysocket');
    });
  });

  describe('#parse', function () {
    it('should parse key', function () {
      expect(roomKey.parse('socket:mysocket')).to.equal('mysocket');
    });
  });

  it('should be symetric', function () {
    expect(roomKey.parse(roomKey.format('mysocket'))).to.equal('mysocket');
  });
});