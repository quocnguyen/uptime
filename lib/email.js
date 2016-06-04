/*!
 * lingo
 * Copyright(c) 2016-2016 quocnguyen
 */

'use strict';

const emailjs = require('emailjs');
const xtend = require('xtend');
const cons = require('consolidate');
const path = require('path');

const smtp = {
  user: process.env.SMTP_USER,
  password: process.env.SMTP_PASSWORD,
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  ssl: Number(process.env.SMTP_SSL) === 1 ? true : false,
};

if (process.env.NODE_ENV === 'production') {
  smtp.tls = {ciphers: 'SSLv3'};
}

const server = emailjs.server.connect(smtp);

exports.render = function render(filename, data) {
  return new Promise((resolve, reject) => {
    cons.mustache(
      path.resolve(__dirname, '../views/emails/', filename),
      data || {}, function(err, html) {
      if (err) { return reject(err); }
      resolve(html);
    });
  });
};

exports.send = function send(msg) {
  if ( process.env.NODE_ENV !== 'production') {
    return Promise.resolve();
  }

  msg = xtend(msg, {
    from: process.env.ADMIN_EMAIL,
    attachment: [{
      data: msg.text || '',
      alternative: true
    }]
  });

  var message = emailjs.message.create(msg);
  return new Promise((resolve, reject) => {
    server.send(message, function(err, res){
      if (err) { return reject(err); }
      resolve(res);
    });
  });

};