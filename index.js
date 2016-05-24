'use strict';

require('dotenv').config({silent: true});
const app = require('./lib/app');
const bus = require('./lib/bus');

app.listen(process.env.PORT, () => {
  bus.emit('app start');
});