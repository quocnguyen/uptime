'use strict';

require('./hook');
const http = require('http');
const https = require('https');
const url = require('url');
const finalhandler = require('finalhandler');
const Router = require('router');
const validUrl = require('valid-url');
const shortid = require('shortid');
const db = require('./db');
const bus = require('./bus');
const xtend = require('xtend');

const app = new Router();
require('./middileware')(app);

app.get('/', (req, res) => {
  res.render('home.html');
});

app.get('/stat/:siteid', (req, res) => {
  db
    .sublevel('site')
    .get(req.params.siteid, function(err, value) {
      if (err) {
        res.statusCode = 404;
        return res.end('not found');
      }
      getLogs(value.id, res);
      function getLogs(id) {
        let logs = [];
        db.sublevel('log')
          .createReadStream({
            keys: false,
          })
          .on('data', (value) => {
            if (value.id === id)
              logs.push({
                checked: value.checked,
                responseTime: value.responseTime
              });
          })
          .on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(json({
              logs: logs
            }));
          });
      }
    });
});

app.get('/:siteid', (req, res) => {
  db.sublevel('site')
  .get(req.params.siteid, function(err, value) {
    if (err) {
      res.statusCode = 404;
      return res.end('not found');
    }

    res.render('stat.html', {
      siteid: req.params.siteid,
      site: value,
    });
  });


});


app.post('/', (req, res) => {
  Promise.resolve()
  .then(() => testUrl(req.body.url))
  .then(() => testEmail(req.body.email))
  .then(() => savetoDB(req.body))
  .then((siteid) => {
    res.render('home.html', {
      msg: `http://${process.env.VIRTUAL_HOST}/${siteid}`
    });
    bus.emit('schedule');
  })
  .catch((err) => {
    res.render('home.html', {
      msg: err.toString(),
    });
  });

});

function savetoDB(body) {
  return new Promise((resolve, reject) => {
    let key = shortid.generate();
    let value = {
      id: key,
      email: body.email.trim(),
      url: body.url.trim(),
    };

    let checkdb = db.sublevel('check');
    let sitedb = db.sublevel('site');

    checkdb.put(Date.now(), value, function(err) {
      sitedb.put(key, xtend(value, {
        created: Date.now(),
        lastchecked: Date.now(),
        downtime: 0,
      }));

      if (err) { return reject('save fail'); }
      resolve(key);
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

    let req = opt.protocol.indexOf('https') > -1 ? https : http;
    try {
      req.get(opt, function(res) {
        if (res.statusCode !== 200) {
          return reject(new Error('bad url'));
        }

        resolve();
      }).on('error', function() {
        reject(new Error('bad url'));
      });
    } catch(err) {
      reject(new Error('bad url'));
    }
  });
}

function testEmail(email) {
  return new Promise((resolve, reject) => {
    // empty
    if ( ! email) {
      return reject(new Error('missing email'));
    }

    // not valid
    if ( ! /.+\@.+\..+/.test(email)) {
      return reject(new Error('bad email'));
    }

    // serious check ? no
    resolve();
  });
}

function json(obj) {
  return JSON.stringify(obj);
}
module.exports = http.createServer((req, res) => {
  app(req, res, finalhandler(req, res));
});