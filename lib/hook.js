'use strict';

const bus = require('./bus');
const info = require('debug')('uptime:info');
const db = require('./db');
const http = require('http');
const https = require('https');
const validUrl = require('valid-url');
const xtend = require('xtend');
const email = require('./email');
const url = require('url');
const checkdb = db.sublevel('check');
const sitedb = db.sublevel('site');
const timeouts = [];

const check = (data) => {
  info('check: %o', data.value.url);

  timeouts.push(setTimeout(check, Number(process.env.INTERVAL), data));

  testUrl(data.value.url)
    .then((start) => saveLog(data.value.id, start))
    .then(() => markChecked(data))
    .catch(() => notify(data));
};

// --- EVENTS HOOK
bus.on('new site', sendWelcomeEmail);
bus.on('remove site', clearAllTimeoutEvent);

bus.on('app start', () => {
  info('app start at port: %o', process.env.PORT);
  bus.emit('schedule');
});

// --- END EVENTS HOOK

bus.on('schedule', (lastStreamKey) => {
  let s = checkdb.createReadStream({
    gt: lastStreamKey
  });

  s.on('data', (data) => {
    lastStreamKey = data.key;

    // make sure site is still valid
    db.sublevel('site').get(data.value.id, (err) => {
      if (err && err.notFound) {
        checkdb.del(data.key);
        return;
      }

      schedule(data);
    });
  });
});

function schedule(data) {
  let lastChecked = data.value.lastChecked;
  let time = (lastChecked + Number(process.env.INTERVAL)) - Date.now();
  if (time < 0) {
    time = 0;
  }
  // let's add some random int to time
  // make sure we didn't check a lot of sites at the same time
  time += getRandomInt(1000, 120000); // 1s to 120s

  timeouts.push(setTimeout(check, time, data));
}


function markChecked(data) {
  data.value = xtend(data.value, {
    status: 'up',
    lastChecked: Date.now(),
  });
  return Promise.resolve()
    .then(() => saveDb(data.key, data.value))
    .catch(err => console.log(err));
}

function notify(data) {
  // still down from last check
  if (data.value.status === 'down') {
    return Promise.resolve();
  }

  data.value = xtend(data.value, {
    status: 'down',
    lastChecked: Date.now(),
  });

  return Promise.resolve()
    .then(() => saveDb(data.key, data.value))
    .then(() => sendNotifyEmail(data))
    .catch(err => console.log(err));
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
    opt.method = 'HEAD';

    let start = Date.now();
    let req = opt.protocol.indexOf('https') > -1 ? https : http;
    let allowStatusCode = [200, 301, 302];
    try {
      req.request(opt, function(res) {
        if (allowStatusCode.indexOf(res.statusCode) === -1) {
          return reject(new Error('bad url'));
        }

        resolve(start);
      }).on('error', function() {
        reject(new Error('bad url'));
      }).end();
    } catch(err) {
      reject(new Error('bad url'));
    }
  });
}

function saveLog(id, start) {
  db.sublevel(id)
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
    return email.send({
      text: html,
      to: data.value.email,
      subject: `Your ${data.value.url} is down`,
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

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clearAllTimeoutEvent() {
  info('clear all scheduled event');
  for(let i = 0; i < timeouts.length; i++) {
    clearTimeout(timeouts[i]);
    timeouts.splice(i, 1);
  }

  bus.emit('schedule');
}