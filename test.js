'use strict';

require('dotenv').config({silent: true});
const db = require('./lib/db');

db.sublevel('site').createReadStream({
})
  .on('data', (data) => {
    console.log(data);
  });
