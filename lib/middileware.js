'use strict';

const view = require('consolidate');
const path = require('path');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
const xtend = require('xtend');
const helmet = require('helmet');
const qs = require('querystring');

module.exports = function(app) {
  // locals
  app.use((req, res, next) => {
    res.locals = res.locals || {};
    next();
  });
  // render
  app.use((req, res, next) => {
    res.setHeader('Content-Type', 'text/html; charset=utf8');

    res.render = function render(filename, locals) {
      let file = path.resolve(__dirname, '..', 'views', filename);
      locals = locals || {};
      locals = xtend(locals, res.locals || {});
      view.mustache(file, locals, (err, html) => {
        if (err) { return next(err); }
        res.end(html);
      });
    };
    next();
  });

  app.use((req, res, next) => {
    req.body = {};
    if (req.method !== 'POST') { return next(); }

    let body = '';
    req.on('data', function(buf) {
      body += buf.toString();
    });
    req.on('end', function() {
      req.body = qs.parse(body);
      next();
    });
  });

  // cookie-parser
  app.use(cookieParser());

  app.use(helmet());

  // csrf protected
  if (process.env.NODE_ENV !== 'test') {
    app.use(csurf({
      cookie: true
    }));
    app.use((req, res, next) => {
      res.locals = res.locals || {};
      res.locals.csrfToken = req.csrfToken();
      next();
    });
  }

  app.use((err, req, res, next) => {
    if (err.code !== 'EBADCSRFTOKEN') {
      return next(err);
    }

    res.statusCode = 500;
    res.end('bad csrf');
  });

};