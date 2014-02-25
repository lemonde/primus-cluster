/**
 * Expose methods.
 */

exports.format = format;
exports.parse = parse;

/**
 * Format socket key.
 *
 * @param {String} id
 * @returns {String} key
 */

function format(id) {
  return 'socket:' + id;
}

/**
 * Parse socket key.
 *
 * @param {String} key
 * @returns {String} id
 */

function parse(key) {
  return key.replace(/^socket:/, '');
}