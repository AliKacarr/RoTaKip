'use strict';

const mongoose = require('mongoose');

// Günün sözü modeli
const vecizeSchema = new mongoose.Schema({
  sentence: String
});
const Vecize = mongoose.model('Vecize', vecizeSchema, 'vecizeler');

// Rastgele ayet modeli
const ayetSchema = new mongoose.Schema({
  sentence: String
});

const Ayet = mongoose.model('Ayet', ayetSchema, 'ayetler');

// Hadis modeli
const hadisSchema = new mongoose.Schema({
  sentence: String
});

const Hadis = mongoose.model('Hadis', hadisSchema, 'hadisler');

// Dua modeli
const duaSchema = new mongoose.Schema({
  sentence: String
});

const Dua = mongoose.model('Dua', duaSchema, 'dualar');


// Hatırlatmalar şeması
const hatirlatmaSchema = new mongoose.Schema({
  sentence: String
});

const Hatirlatma = mongoose.model('hatırlatmalar', hatirlatmaSchema, 'hatırlatmalar');



module.exports = {
  Ayet,
  Dua,
  Hadis,
  Hatirlatma,
  Vecize
};
