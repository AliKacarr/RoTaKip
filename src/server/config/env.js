'use strict';

const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');

require('dotenv').config({
  path: path.join(projectRoot, '.env'),
  quiet: true
});

module.exports = {
  projectRoot
};
