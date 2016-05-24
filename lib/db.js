'use strict';

const level = require('level');
const path = require('path');
const db = path.resolve(__dirname, '../', process.env.DB);
const sublevel = require('level-sublevel');
module.exports = sublevel(level(db, {
  valueEncoding: 'json'
}));