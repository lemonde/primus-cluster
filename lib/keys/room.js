/**
 * Expose methods.
 */

exports.format = format;

/**
 * Format room key.
 *
 * @param {String} room
 * @returns {String} key
 */

function format(room) {
  return 'room:' + room;
}