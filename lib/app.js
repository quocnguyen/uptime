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
  getStats()
    .then((data) => res.render('home.html', data));
});

// remove site
app.get('/remove/:siteid', (req, res) => {
  res.setHeader('Content-Type', 'text/html');

  db.sublevel('site')
    .del(req.params.siteid, err => {
      if (err) {
        res.statusCode = 400;
        return res.end(err.toString());
      }
      bus.emit('remove site');
      res.end('removed');
    });
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
        db.sublevel(id)
          .createReadStream({
            keys: false,
            limit: 50,
            reverse: true
          })
          .on('data', (value) => {
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
    bus.emit('schedule');
    return getStats()
      .then((data) => {
        res.render('home.html', xtend(data, {
          msg: `http://${process.env.VIRTUAL_HOST}/${siteid}`
        }));
      });
  })
  .catch((err) => {
    getStats()
      .then((data) => {
        res.render('home.html', xtend(data, {
          msg: err.toString()
        }));
      });
  });

});

function savetoDB(body) {
  return new Promise((resolve, reject) => {
    let key = shortid.generate();
    let site = {
      id: key,
      email: body.email.trim(),
      url: body.url.trim(),
    };

    let checkdb = db.sublevel('check');
    let sitedb = db.sublevel('site');

    checkdb.put(Date.now(), site, function(err) {
      sitedb.put(key, xtend(site, {
        created: Date.now(),
        lastchecked: Date.now(),
        downtime: 0,
      }));

      if (err) { return reject('save fail'); }
      bus.emit('new site', site);
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
    opt.method = 'HEAD';

    let req = opt.protocol.indexOf('https') > -1 ? https : http;
    let allowStatusCode = [200, 301, 302];
    try {
      req.request(opt, function(res) {
        if (allowStatusCode.indexOf(res.statusCode) === -1) {
          return reject(new Error('bad url'));
        }

        resolve();
      })
      .on('error', function() {
        reject(new Error('bad url'));
      })
      .end();
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

function getStats() {
  let totalSites = 0;
  let s = db.sublevel('site').createReadStream({values: false});
  s.on('data', () => totalSites++);
  return new Promise((resolve) => {
    s.on('end', () => {
      let yesterday = Math.floor(86400000 / Number(process.env.INTERVAL));
      let lastWeek = Math.floor((86400000 * 7) / Number(process.env.INTERVAL));
      let lastMonth = Math.floor((86400000 * 30) / Number(process.env.INTERVAL));

      resolve({
        totalSites: totalSites,
        yesterday: yesterday * totalSites,
        lastWeek: lastWeek * totalSites,
        lastMonth: lastMonth * totalSites,
      });
    });
  });

}
function json(obj) {
  return JSON.stringify(obj);
}
module.exports = http.createServer((req, res) => {
  app(req, res, finalhandler(req, res));
});
