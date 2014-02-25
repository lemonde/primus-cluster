var expect = require('chai').expect;
var roomKey = require('../../lib/keys/room');

describe('Room key', function () {
  describe('#format', function () {
    it('should format key', function () {
      expect(roomKey.format('myroom')).to.equal('room:myroom');
    });
  });
});