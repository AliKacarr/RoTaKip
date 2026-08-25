import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';

export default defineConfig([
  {
    ignores: [
      'node_modules/**',
      'whatsapp-analytics-bots/**',
      'public/**/*.min.js',
      'public/OneSignalSDK*.js',
      'public/groups.min.js',
      'public/index.min.js'
    ]
  },
  {
    files: ['**/*.js'],
    plugins: { js },
    extends: ['js/recommended'],
    rules: {
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        caughtErrors: 'none'
      }],
      'no-undef': 'warn',
      'no-useless-assignment': 'off',
      'no-useless-escape': 'off',
      'no-self-assign': 'off',
      'no-empty': 'off'
    }
  },
  {
    files: ['**/*.js'],
    ignores: ['public/**'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node
    }
  },
  {
    files: ['anket/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        document: 'readonly'
      }
    }
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        html2canvas: 'readonly',
        Chart: 'readonly',
        ChartDataLabels: 'readonly'
      }
    },
    rules: {
      // Birden fazla script aynı sayfada paylaşılıyor; no-undef burası için gürültü
      'no-undef': 'off'
    }
  }
]);
