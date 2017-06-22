'use strict';

angular.module('arkclient').factory('configService', function(gettextCatalog, storageService, lodash) {
  var root = {};

  var defaultConfig = {
    fees: {
      send: 10000000,
      vote: 100000000,
      delegate: 2500000000,
      secondSignature: 500000000,
      multiSignature: 500000000
    },

    currencies: [
      {name:"btc",symbol:"Ƀ"},
      {name:"usd",symbol:"$"},
      {name:"eur",symbol:"€"},
      {name:"cny",symbol:"CN¥"},
      {name:"cad",symbol:"Can$"},
      {name:"gbp",symbol:"£"},
      {name:"hkd",symbol:"HK$"},
      {name:"jpy",symbol:"JP¥"},
      {name:"rub",symbol:'\u20BD'},
      {name:"aud",symbol:"A$"}
    ],

    application: {
      windowSize: {},
      currency: {name:"btc",symbol:"Ƀ"},
      language: 'en',
      background: 'url(assets/img/images/Ark.jpg)',
      playFundsReceivedSong: false
    },

    coinmarketcap: {
      url: 'http://coinmarketcap.northpole.ro/api/v5/'
    },

    wallet: {
      unitToSatoshi: 100000000,
      unitDecimals: 8
    }
  };

  var userConfig = null;

  root.get = function() {
    var localConfig = storageService.getGlobal('config');

    userConfig = localConfig || defaultConfig;
    return userConfig;
  };

  /*
  * Override default config with user options
  * @param {Object} newOptions
  * @example 
  * configService.set({application: {language: 'pt'}});
  */
  root.set = function(newOptions) {
    var config = defaultConfig;
    var oldOptions = storageService.getGlobal('config') || {};

    if (typeof oldOptions === 'string') {
      oldOptions = JSON.parse(oldOptions);
    }

    if (typeof newOptions === 'string') {
      newOptions = JSON.parse(newOptions);
    }

    lodash.merge(config, oldOptions, newOptions);
    userConfig = config;
    storageService.setGlobal('config', config);
  };

  root.setPreference = function(preference) {
    var option = {application: preference};
    return root.set(option);
  }

  root.reset = function() {
    storageService.set('config', defaultConfig);
  };

  root.getDefaults = function() {
    return defaultConfig;
  };

  root.getPreferences = function() {
    return root.get().application;
  }

  return root;
});
