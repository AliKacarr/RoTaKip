'use strict';

const path = require('path');
const compression = require('compression');
const express = require('express');

function createStaticOptions(isMedia = false) {
  return {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      const extension = path.extname(filePath).toLowerCase();
      const fileName = path.basename(filePath).toLowerCase();
      const isVersionedBundle = fileName.endsWith('.min.js') || fileName.endsWith('.min.css');

      if (!isMedia && isVersionedBundle) {
        res.setHeader('Cache-Control', 'public, max-age=259200, immutable');
      } else if (!isMedia && (
        extension === '.html'
        || extension === '.js'
        || extension === '.css'
        || extension === '.json'
        || extension === ''
      )) {
        res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
      } else if ([
        '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf'
      ].includes(extension)) {
        res.setHeader('Cache-Control', 'public, max-age=259200');
      } else {
        res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate');
      }
    }
  };
}

function configureCoreMiddleware(app) {
  app.use(compression());
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin');
    next();
  });
  app.use(express.json({ limit: '100kb' }));
}

function configureStaticFiles(app, publicPath) {
  app.use(express.static(publicPath, createStaticOptions(false)));
  app.use('/uploads', express.static(path.join(publicPath, 'uploads'), createStaticOptions(true)));
  app.use('/images', express.static(path.join(publicPath, 'images'), createStaticOptions(true)));
  app.use('/groupAvatars', express.static(path.join(publicPath, 'groupAvatars'), createStaticOptions(true)));
  app.use('/groupImages', express.static(path.join(publicPath, 'groupImages'), createStaticOptions(true)));
  app.use('/userAvatars', express.static(path.join(publicPath, 'userAvatars'), createStaticOptions(true)));
  app.use('/quotes', express.static(path.join(publicPath, 'quotes'), createStaticOptions(true)));
}

module.exports = {
  configureCoreMiddleware,
  configureStaticFiles,
  createStaticOptions
};
