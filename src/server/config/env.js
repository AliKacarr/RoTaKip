'use strict';

const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const publicPath = path.join(projectRoot, 'public');

require('dotenv').config({
  path: path.join(projectRoot, '.env'),
  quiet: true
});

module.exports = {
  projectRoot,
  publicPath
};
