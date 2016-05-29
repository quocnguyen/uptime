'use strict';

const bus = require('./bus');
const info = require('debug')('uptime:info');
const db = require('./db');
const enqueue = require('enqueue');
const http = require('http');
const https = require('https');
const validUrl = require('valid-url');
const xtend = require('xtend');
const email = require('./email');
const url = require('url');
const checkdb = db.sublevel('check');
const sitedb = db.sublevel('site');

const check = enqueue((data, done) => {
  info('check: %o', data.value.url);

  setTimeout(() => {
    check(data);
  }, process.env.INTERVAL);

  testUrl(data.value.url)
    .then((start) => saveLog(data.value.id, start))
    .then(() => markChecked(data, done))
    .catch(() => notify(data, done));

}, {
  concurrency: 1,
});

// --- EVENTS HOOK
bus.on('new site', sendWelcomeEmail);

bus.on('app start', () => {
  info('app start at port: %o', process.env.PORT);
  bus.emit('schedule');
});

// --- END EVENTS HOOK

// remember last checked key
var lastStreamKey = '';
var tmp = '';
bus.on('schedule', () => {
  // info('lastStreamKey: %o', lastStreamKey);
  checkdb.createReadStream({
    limit: 10,
    gt: lastStreamKey
  }).on('data', (data) => {
    lastStreamKey = data.key;
    let time = (data.value.lastChecked + Number(process.env.INTERVAL)) - Date.now();
    if (time < 0) {
      time = 0;
    }

    setTimeout(() => {
      check(data);
    }, time);
  })
  .on('end', () => {
    if (tmp !== '' && tmp !== lastStreamKey) {
      tmp = lastStreamKey;
      return bus.emit('schedule');
    }
  });
});


function markChecked(data, done) {
  data.value = xtend(data.value, {
    status: 'up',
    lastChecked: Date.now(),
  });
  return Promise.resolve()
    .then(() => saveDb(data.key, data.value))
    .then(() => done())
    .catch((err) => {
      console.log(err);
      done();
    });
}

function notify(data, done) {
  if (data.value.status === 'down') {
    return done();
  }

  data.value = xtend(data.value, {
    status: 'down',
    lastChecked: Date.now(),
  });

  return Promise.resolve()
    .then(() => saveDb(data.key, data.value))
    .then(() => sendNotifyEmail(data))
    .then(() => done())
    .catch((err) => {
      console.log(err);
      done();
    });
}

function saveDb(key, value) {
  return new Promise((resolve, reject) => {
    db.batch([
      {type: 'put', key: key, value: value, prefix: checkdb},
      {type: 'put', key: value.id, value: value, prefix: sitedb},
    ], function(err) {
      if (err) { return reject(err); }
      resolve();
    });
  });
}


function testUrl(site) {

  return new Promise((resolve, reject) => {
    // empty
    if ( ! site) {
      return reject(new Error('missing url'));
    }

    // not valid
    if ( ! validUrl.isUri(site)) {
      return reject(new Error('bad url'));
    }

    // serious check
    let opt = url.parse(site);
    opt.headers = {
      'User-Agent': process.env.USER_AGENT,
    };

    let start = Date.now();
    let req = opt.protocol.indexOf('https') > -1 ? https : http;
    try {
      req.get(opt, function(res) {
        if (res.statusCode !== 200) {
          return reject(new Error('bad url'));
        }
        resolve(start);
      }).on('error', function() {
        reject(new Error('bad url'));
      });
    } catch(err) {
      reject(new Error('bad url'));
    }
  });
}

function saveLog(id, start) {
  db.sublevel('log')
    .put(Date.now(), {
      id: id,
      responseTime: Date.now() - start,
      checked: Date.now(),
    });
}

function sendNotifyEmail(data) {
  info('email: %o', data.value.email);

  return email.render('down.html', {
    url: data.value.url,
    domain: 'http://' + process.env.VIRTUAL_HOST
  })
  .then(function(html) {
    return new Promise((resolve, reject) => {
      email.send({
        text: html,
        to: data.value.email,
        subject: `Your ${data.value.url} is down`,
      }, function(err) {
        if (err) { return reject(err); }
        resolve();
      });
    });
  });
}

function sendWelcomeEmail(site) {
  info('email: %o', site.email);

  return email.render('welcome.html', {
    id: site.id,
    url: site.url,
    domain: 'http://' + process.env.VIRTUAL_HOST
  })
  .then(function(html) {
    return new Promise((resolve, reject) => {
      email.send({
        text: html,
        to: site.email,
        subject: `Your performance url for ${site.url}`,
      }, function(err) {
        if (err) { return reject(err); }
        resolve();
      });
    });
  });
}