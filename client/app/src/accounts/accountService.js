(function(){
  'use strict';

  angular.module('arkclient.accounts')
         .service('accountService', ['$q', '$http', 'networkService', 'storageService', 'ledgerService', 'gettextCatalog', AccountService]);

  /**
   * Accounts DataService
   * Uses embedded, hard-coded data model; acts asynchronously to simulate
   * remote data service call(s).
   *
   * @returns {{loadAll: Function}}
   * @constructor
   */
  function AccountService($q, $http, networkService, storageService, ledgerService, gettextCatalog){

    let ark = require('arkjs');

    let crypto = require('crypto');

    let TxTypes = {
      0:"Send Ark",
      1:"Second Signature Creation",
      2:"Delegate Registration",
      3:"Vote",
      4:"Multisignature Creation"
    };

    let peer=networkService.getPeer().ip;

    function showTimestamp(time){
      let d = new Date(Date.UTC(2017, 2, 21, 13, 0, 0, 0));

      let t = parseInt(d.getTime() / 1000);

      time = new Date((time + t) * 1000);

      let currentTime = new Date().getTime();
      let diffTime = (currentTime - time.getTime()) / 1000;

      if (diffTime < 60) {
          return Math.floor(diffTime) + ' sec ago';
      }
      if (Math.floor(diffTime / 60) <= 1) {
          return Math.floor(diffTime / 60) + ' min ago';
      }
      if ((diffTime / 60) < 60) {
          return Math.floor(diffTime / 60) + ' mins ago';
      }
      if (Math.floor(diffTime / 60 / 60) <= 1) {
          return Math.floor(diffTime / 60 / 60) + ' hour ago';
      }
      if ((diffTime / 60 / 60) < 24) {
          return Math.floor(diffTime / 60 / 60) + ' hours ago';
      }
      if (Math.floor(diffTime / 60 / 60 / 24) <= 1) {
          return Math.floor(diffTime / 60 / 60 / 24) + ' day ago';
      }
      if ((diffTime / 60 / 60 / 24) < 30) {
          return Math.floor(diffTime / 60 / 60 / 24) + ' days ago';
      }
      if (Math.floor(diffTime / 60 / 60 / 24 / 30) <= 1) {
          return Math.floor(diffTime / 60 / 60 / 24 / 30) + ' month ago';
      }
      if ((diffTime / 60 / 60 / 24 / 30) < 12) {
          return Math.floor(diffTime / 60 / 60 / 24 / 30) + ' months ago';
      }
      if (Math.floor((diffTime / 60 / 60 / 24 / 30 / 12)) <= 1) {
          return Math.floor(diffTime / 60 / 60 / 24 / 30 / 12) + ' year ago';
      }

      return Math.floor(diffTime / 60 / 60 / 24 / 30 / 12) + ' years ago';
    }

    function fetchAccount(address){
      let deferred = $q.defer();
      networkService.getFromPeer('/api/accounts?address='+address).then(
        function (resp) {
          let account;
          if(resp.success){
            account = resp.account;
            account.cold=!account.publicKey;
            account.delegates = [];
            account.selectedVotes = [];
            deferred.resolve(account);
            addWatchOnlyAddress(account);
          }
          else{
            account = {
              address:address,
              balance:0,
              secondSignature:false,
              cold:true,
              delegates: [],
              selectedVotes: [],
            };
            deferred.resolve(account);
            addWatchOnlyAddress(account);
          }
        }
      );
      return deferred.promise;
    }

    function fetchAccountAndForget(address){
      let deferred = $q.defer();
      networkService.getFromPeer('/api/accounts?address='+address).then(
        function (resp) {
          if(resp.success){
            let account = storageService.get(address);
            if(!account){
              account = resp.account;
            }
            else {
              account.balance = resp.account.balance;
              account.secondSignature = resp.account.secondSignature;
            }
            account.cold=!resp.account.publicKey;
            deferred.resolve(account);
          }
          else{
            let account = storageService.get(address);
            if(!account){
              account={
                address:address,
                balance:0,
                secondSignature:false,
                cold:true
              };
            } else {
              account.username = storageService.get("username-"+address);
            }
            deferred.resolve(account);
          }
        }
      );
      return deferred.promise;
    }

    function getAccount(address){
      let account=storageService.get(address);
      if(account){
        account.transactions=storageService.get("transactions-"+address);
        account.username=storageService.get("username-"+address);
        account.delegate=storageService.get("delegate-"+address);
        account.virtual=getVirtual(address);
        return account;
      }
      else{
        return null;
      }
    }

    function createAccount(passphrase){
      let deferred = $q.defer();
      let address=ark.crypto.getAddress(ark.crypto.getKeys(passphrase).publicKey, networkService.getNetwork().version);
      fetchAccount(address).then(function(account){
        if(account){
          account.virtual=account.virtual || {};
          storageService.set("virtual-"+address,account.virtual);
          deferred.resolve(account);
        }
        else{
          deferred.reject(gettextCatalog.getString("Passphrase does not match your address"));
        }
      });
      return deferred.promise;
    }

    function savePassphrases(address, passphrase, secondpassphrase){
      let deferred = $q.defer();
      let tempaddress = ark.crypto.getAddress(ark.crypto.getKeys(passphrase).publicKey);
      if(passphrase){
        let account=getAccount(tempaddress);
        if(account && account.address === address){
          account.virtual=account.virtual || {};
          storageService.set("virtual-"+address,account.virtual);
          storageService.set("passphrase-"+address,passphrase);
          storageService.set("secondpassphrase-"+address,secondpassphrase);
          deferred.resolve(account);
        }
        else{
          deferred.reject(gettextCatalog.getString("Passphrase does not match your address"));
        }
      }
      else{ // no passphrase, meaning remove all passphrases
        storageService.set("virtual-"+address,null);
        storageService.set("passphrase-"+address,null);
        storageService.set("secondpassphrase-"+address,null);
        deferred.reject(gettextCatalog.getString("Passphrases deleted"));
      }

      return deferred.promise;
    }

    function getPassphrases(address){
      return [storageService.get("passphrase-"+address),storageService.get("secondpassphrase-"+address)];
    }

    function addWatchOnlyAddress(account){
      if(!account || !account.address || storageService.get(account.address) || account.ledger){
        return;
      }
      storageService.set(account.address,account);
      let addresses=storageService.get("addresses");
      if(!addresses){
        addresses=[];
      }
      if(addresses.indexOf(account.address)===-1){
        addresses.push(account.address);
        storageService.set("addresses",addresses);
      }
    }

    function removeAccount(account){
      if(!account || !account.address){
        return $q.when(null);
      }
      //delete account data
      storageService.set(account.address,null)
      storageService.set("transactions-"+account.address,null);
      storageService.set("voters-"+account.address,null);
      storageService.set("username-"+account.address,null);
      storageService.set("virtual-"+account.address,null);
      storageService.set("passphrase-"+account.address,null);
      storageService.set("secondpassphrase-"+account.address,null);

      //remove the address from stored addresses
      let addresses=storageService.get("addresses");
      addresses.splice(addresses.indexOf(account.address),1);
      storageService.set("addresses",addresses);
      return $q.when(account);
    }

    function formatTransaction(transaction, recipientAddress) {
      let d = new Date(Date.UTC(2017,2,21,13,0,0,0));
      let t = parseInt(d.getTime() / 1000);

      transaction.label=gettextCatalog.getString(TxTypes[transaction.type]);
      transaction.date=new Date((transaction.timestamp + t) * 1000);
      if(transaction.recipientId === recipientAddress){
        transaction.total=transaction.amount;
        if(transaction.type === 0){
          transaction.label=gettextCatalog.getString("Receive Ark");
        }
      }
      if(transaction.senderId === recipientAddress){
        transaction.total=-transaction.amount-transaction.fee;
      }
      // to avoid small transaction to be displayed as 1e-8
      transaction.humanTotal = numberToFixed(transaction.total / 100000000) + ''

      return transaction;
    }

    function getTransactions(address, offset, limit) {
      if(!offset){
        offset=0;
      }
      if(!limit){
        limit=50
      }
      let deferred = $q.defer();
      let d = new Date(Date.UTC(2017, 2, 21, 13, 0, 0, 0));
      let t = parseInt(d.getTime() / 1000);

      networkService.getFromPeer("/api/transactions?orderBy=timestamp:desc&limit="+limit+"&recipientId=" +address +"&senderId="+address).then(function (resp) {
        if(resp.success){
          for(let i= 0;i<resp.transactions.length;i++){

            // TODO - This variable is never used - do we need this?
            let transaction = formatTransaction(resp.transactions[i], address)
          }
          storageService.set("transactions-"+address,resp.transactions);
          deferred.resolve(resp.transactions);
        }
        else{
          deferred.reject(gettextCatalog.getString("Cannot get transactions"));
        }
      });
      return deferred.promise;
    }

    function getDelegate(publicKey){
      let deferred = $q.defer();
      if(!publicKey){
        deferred.reject(gettextCatalog.getString("No publicKey"));
        return deferred.promise;
      }
      networkService.getFromPeer("/api/delegates/get/?publicKey="+publicKey).then(function (resp) {
        if(resp && resp.success && resp.delegate){
          storageService.set("delegate-"+resp.delegate.address,resp.delegate);
          storageService.set("username-"+resp.delegate.address,resp.delegate.username);
          deferred.resolve(resp.delegate);
        }
        else{
          deferred.reject(gettextCatalog.getString("Cannot state if account is a delegate"));
        }
      });
      return deferred.promise;
    }

    function getActiveDelegates() {
      let deferred = $q.defer();

      networkService.getFromPeer("/api/delegates").then(function (resp) {
        if(resp && resp.success && resp.delegates) {
          deferred.resolve(resp.delegates);
        }
        else {
          deferred.reject(gettextCatalog.getString("Cannot get registered delegates"));
        }
      });
      return deferred.promise;
    }

    function getDelegateByUsername(username){
      let deferred = $q.defer();
      if(!username){
        deferred.reject("No Username");
        return deferred.promise;
      }
      username = username.toLowerCase();
      networkService.getFromPeer("/api/delegates/get/?username="+username).then(function (resp) {
        if(resp && resp.success && resp.delegate){
          storageService.set("delegate-"+resp.delegate.address,resp.delegate);
          storageService.set("username-"+resp.delegate.address,resp.delegate.username);
          deferred.resolve(resp.delegate);
        }
        else{
          deferred.reject(gettextCatalog.getString("Cannot find delegate: ")+ username);
        }
      });
      return deferred.promise;
    }

    //TODO: NOT working yet, waiting for 0.3.2
    function searchDelegates(term){
      let deferred = $q.defer();
      if(!term){
        deferred.reject(gettextCatalog.getString("No search term"));
        return deferred.promise;
      }
      networkService.getFromPeer("/api/delegates/search/?term="+term).then(function (resp) {
        if(resp && resp.success && resp.delegates){
          deferred.resolve(resp.delegates);
        }
        else{
          deferred.reject(gettextCatalog.getString("Cannot find delegates from this term: ")+term);
        }
      }, function(err){
        deferred.reject(gettextCatalog.getString("Cannot find delegates on this peer: ")+err);
      });
      return deferred.promise;
    }

    function getVotedDelegates(address){
      let deferred = $q.defer();
      networkService.getFromPeer("/api/accounts/delegates/?address="+address).then(function(resp){
        if(resp && resp.success){
          let delegates = [];
          if (resp.delegates && resp.delegates.length && resp.delegates[0]){
            delegates = resp.delegates
          }
          storageService.set("voted-"+address,delegates);
          deferred.resolve(delegates);
        }
        else{
          deferred.reject(gettextCatalog.getString("Cannot get voted delegates"));
        }
      });
      return deferred.promise;
    }

    function verifyMessage(message, publicKey, signature){
      let hash = crypto.createHash('sha256');
      hash = hash.update(new Buffer(message,"utf-8")).digest();
      let ecpair = ark.ECPair.fromPublicKeyBuffer(new Buffer(publicKey, "hex"));
      let ecsignature = ark.ECSignature.fromDER(new Buffer(signature, "hex"));
      return ecpair.verify(hash, ecsignature);
    }

    function signMessage(message, passphrase){
      let deferred = $q.defer();
      let hash = crypto.createHash('sha256');
      hash = hash.update(new Buffer(message,"utf-8")).digest();
      let ecpair = ark.crypto.getKeys(passphrase);
      deferred.resolve({signature: ecpair.sign(hash).toDER().toString("hex")});
      return deferred.promise;
    }

    function signMessageWithLedger(message, path){
      let deferred = $q.defer();
      ledgerService.signMessage(path, message).then(
        function(result){
          deferred.resolve(result);
        },
        function(error){
          deferred.reject(error);
        }
      );
      return deferred.promise;
    }

    function createTransaction(type,config){
      let deferred = $q.defer();
      if(type===0){ //send ark
        if(!ark.crypto.validateAddress(config.toAddress, networkService.getNetwork().version)){
          deferred.reject(gettextCatalog.getString("The destination address ")+config.toAddress+gettextCatalog.getString(" is erroneous"));
          return deferred.promise;
        }

        let account=getAccount(config.fromAddress);
        if(config.amount+10000000>account.balance){
          deferred.reject(gettextCatalog.getString("Not enough ARK on your account ")+config.fromAddress);
          return deferred.promise;
        }

        try{
          ark.transaction.createTransaction(config.toAddress, config.amount, config.smartbridge, config.masterpassphrase, config.secondpassphrase);
        }
        catch(e){
          deferred.reject(e);
          return deferred.promise;
        }

        transaction.senderId=config.fromAddress;

        if(config.ledger){
          delete transaction.signature;
          transaction.senderPublicKey = config.publicKey;
          ledgerService.signTransaction(config.ledger, transaction).then(
            function(result){
              console.log(result);
              transaction.signature = result.signature;
              transaction.id = ark.crypto.getId(transaction);
              deferred.resolve(transaction);
            },
            function(error){
              deferred.reject(error);
            }
          );
          return deferred.promise;
        }
        else if(ark.crypto.getAddress(transaction.senderPublicKey, networkService.getNetwork().version) !== config.fromAddress){
          deferred.reject(gettextCatalog.getString("Passphrase is not corresponding to account ")+config.fromAddress);
        }
        else {
          deferred.resolve(transaction);
        }
      }

      else if(type === 1){ // second passphrase creation
        let account=getAccount(config.fromAddress);
        if(account.balance<500000000){
          deferred.reject(gettextCatalog.getString("Not enough ARK on your account ")+config.fromAddress+", "+gettextCatalog.getString("you need at least 5 ARK to create a second passphrase"));
          return deferred.promise;
        }
        try{
          ark.signature.createSignature(config.masterpassphrase, config.secondpassphrase);
        }
        catch(e){
          deferred.reject(e);
          return deferred.promise;
        }
        if(config.ledger){
          delete transaction.signature;
          transaction.senderPublicKey = config.publicKey;
          ledgerService.signTransaction(config.ledger, transaction).then(
            function(result){
              console.log(result);
              transaction.signature = result.signature;
              transaction.id = ark.crypto.getId(transaction);
              deferred.resolve(transaction);
            },
            function(error){
              deferred.reject(error);
            }
          );
          return deferred.promise;
        }
        else if(ark.crypto.getAddress(transaction.senderPublicKey, networkService.getNetwork().version) !== config.fromAddress){
          deferred.reject(gettextCatalog.getString("Passphrase is not corresponding to account ")+config.fromAddress);
          return deferred.promise;
        }
        transaction.senderId=config.fromAddress;
        deferred.resolve(transaction);
      }

      else if(type === 2){ //delegate creation
        let account=getAccount(config.fromAddress);
        if(account.balance<2500000000){
          deferred.reject(gettextCatalog.getString("Not enough ARK on your account ")+config.fromAddress+", "+gettextCatalog.getString("you need at least 25 ARK to register delegate"));
          return deferred.promise;
        }
        console.log(config);
        try{
          ark.delegate.createDelegate(config.masterpassphrase, config.username, config.secondpassphrase);
        }
        catch(e){
          deferred.reject(e);
          return deferred.promise;
        }
        if(config.ledger){
          delete transaction.signature;
          transaction.senderPublicKey = config.publicKey;
          ledgerService.signTransaction(config.ledger, transaction).then(
            function(result){
              console.log(result);
              transaction.signature = result.signature;
              transaction.id = ark.crypto.getId(transaction);
              deferred.resolve(transaction);
            },
            function(error){
              deferred.reject(error);
            }
          );
          return deferred.promise;
        }
        else if(ark.crypto.getAddress(transaction.senderPublicKey, networkService.getNetwork().version) !== config.fromAddress){
          deferred.reject(gettextCatalog.getString("Passphrase is not corresponding to account ")+config.fromAddress);
          return deferred.promise;
        }
        transaction.senderId=config.fromAddress;
        deferred.resolve(transaction);
      }

      else if(type === 3){ //vote
        let account=getAccount(config.fromAddress);
        if(account.balance<100000000){
          deferred.reject(gettextCatalog.getString("Not enough ARK on your account ")+config.fromAddress+", "+gettextCatalog.getString("you need at least 1 ARK to vote"));
          return deferred.promise;
        }
        try{
          ark.vote.createVote(config.masterpassphrase, config.publicKeys.split(","), config.secondpassphrase);
        }
        catch(e){
          deferred.reject(e);
          return deferred.promise;
        }
        if(config.ledger){
          delete transaction.signature;
          transaction.senderPublicKey = config.publicKey;
          ledgerService.signTransaction(config.ledger, transaction).then(
            function(result){
              console.log(result);
              transaction.signature = result.signature;
              transaction.id = ark.crypto.getId(transaction);
              deferred.resolve(transaction);
            },
            function(error){
              deferred.reject(error);
            }
          );
          return deferred.promise;
        }
        else if(ark.crypto.getAddress(transaction.senderPublicKey, networkService.getNetwork().version) !== config.fromAddress){
          deferred.reject(gettextCatalog.getString("Passphrase is not corresponding to account ")+config.fromAddress);
          return deferred.promise;
        }
        transaction.senderId=config.fromAddress;
        deferred.resolve(transaction);
      }

      return deferred.promise;
    };

    // Given a final list of delegates, create a vote assets list to be sent
    // return null if could not make it
    function createDiffVote(address, newdelegates){

      function arrayObjectIndexOf(myArray, searchTerm, property) {
        for(let i = 0, len = myArray.length; i < len; i++) {
          if (myArray[i][property] === searchTerm) return i;
        }
        return -1;
      }

      let assets = [];
      let votedDelegates = storageService.get("voted-"+address) || [];
      votedDelegates = votedDelegates.map(function(delegate){
        return {
          username: delegate.username,
          address: delegate.address,
          publicKey: delegate.publicKey
        };
      });

      let delegates = newdelegates.map(function(delegate){
        return {
          username: delegate.username,
          address: delegate.address,
          publicKey: delegate.publicKey
        };
      });

      if(delegates.length>101){
        return null;
      }
      let difflist=[];
      let notRemovedDelegates=[];
      for(let i in delegates){
        let delegate = delegates[i];
        if(arrayObjectIndexOf(votedDelegates,delegate.publicKey,"publicKey") === -1){
          delegate.vote="+"
          difflist.push(delegate);
        }
        else {
          notRemovedDelegates.push(delegate);
        }
        if(difflist.length === 33){
          assets.push(difflist);
          difflist = [];
        }
      }
      for(let i in votedDelegates){
        let delegate = votedDelegates[i];
        if(arrayObjectIndexOf(notRemovedDelegates,delegate.publicKey,"publicKey") === -1){
          delegate.vote="-";
          difflist.push(delegate);
        }
        if(difflist.length === 33){
          assets.push(difflist);
          difflist = [];
        }
      }
      if(difflist.length > 0){
        assets.push(difflist);
      }
      console.log(assets);
      return assets;
    };

    function getSponsors(){
      let deferred = $q.defer();
      let result=[];
      $http.get("https://gist.githubusercontent.com/fix/a7b1d797be38b0591e725a24e6735996/raw/sponsors.json").then(function (resp) {
        let count=0;
        for(let i in resp.data){
          networkService.getFromPeer("/api/delegates/get/?publicKey="+resp.data[i].publicKey).then(function (resp2) {
            if(resp2.data && resp2.data.success && resp2.data.delegate){
              result.push(resp2.data.delegate);
            }
            count++;
            if(count === resp.data.length-1){
              deferred.resolve(result);
            }
          },
          function(error){
            count++;
          });
        }
      },function(err){
        console.log(err);
        deferred.reject(gettextCatalog.getString("Cannot get sponsors"));
      });
      return deferred.promise;
    }

    function createVirtual(passphrase){
      let deferred = $q.defer();
      let address=ark.crypto.getAddress(ark.crypto.getKeys(passphrase).publicKey, networkService.getNetwork().version);
      let account=getAccount(address);
      if(account){
        account.virtual=account.virtual || {};
        storageService.set("virtual-"+address,account.virtual);
        deferred.resolve(account.virtual);
      }
      else{
        deferred.reject(gettextCatalog.getString("Passphrase does not match your address"));
      }

      return deferred.promise;
    }

    function setToFolder(address, folder, amount){
      let virtual=getVirtual(address);
      console.log(virtual);
      let f=virtual[folder];
      if(f && amount>=0){
        f.amount=amount;
      }
      else if(!f && amount>=0){
        virtual[folder]={amount:amount};
      }
      storageService.set("virtual-"+address,virtual);
      return getVirtual(address);
    }

    function deleteFolder(address, folder){
      let virtual=storageService.get("virtual-"+address);
      delete virtual[folder];
      storageService.set("virtual-"+address,virtual);
      return getVirtual(address);
    }

    function getVirtual(address){
      let virtual=storageService.get("virtual-"+address);
      if(virtual){
        virtual.uservalue=function(folder){
          return function(value){
            if(virtual[folder]){
              if(arguments.length === 1){
                if(value===null){
                  return virtual[folder].amount=null;
                }
                else{
                  return virtual[folder].amount=value*100000000;
                }
              }
              else{
                return virtual[folder].amount===null?"":virtual[folder].amount/100000000;
              }
            }
          }
        };

        virtual.getFolders=function(){
          let folders=[];
          for (let i in virtual){
            if (virtual.hasOwnProperty(i) && typeof virtual[i] !== 'function') {
              folders.push(i);
            }
          }
          return folders;
        }
      }
      return virtual;
    }

    let allowedDelegateNameChars = /^[a-z0-9!@$&_.]+$/g;
    function sanitizeDelegateName(delegateName){
      if (!delegateName) {
        throw new Error('Delegate name is undefined');
      }
      if (delegateName !== delegateName.toLowerCase()) {
        throw new Error('Delegate name must be lowercase');
      }

      let sanitizedName = String(delegateName).toLowerCase().trim();
      if (sanitizedName === '') {
        throw new Error('Empty delegate name');
      }
      if (sanitizedName.length > 20) {
        throw new Error('Delegate name is too long, 20 characters maximum');
      }
      if (!allowedDelegateNameChars.test(sanitizedName)) {
        throw new Error('Delegate name can only contain alphanumeric characters with the exception of !@$&_.');
      }

      return sanitizedName;
    }

    function numberToFixed(x) {
      if (Math.abs(x) < 1.0) {
        let e = parseInt(x.toString().split('e-')[1]);
        if (e) {
            x *= Math.pow(10,e-1);
            x = '0.' + (new Array(e)).join('0') + x.toString().substring(2);
        }
      } else {
        let e = parseInt(x.toString().split('+')[1]);
        if (e > 20) {
            e -= 20;
            x /= Math.pow(10,e);
            x += (new Array(e+1)).join('0');
        }
      }
      return x;
    }

    function smallId(fullId) {
      return fullId.slice(0, 5) + '...' + fullId.slice(-5)
    }


    return {
      loadAllAccounts : function() {
        let accounts = storageService.get("addresses");

        if(!accounts){
          return [];
        }

        accounts = accounts.filter(function(a){
          return !a.ledger;
        });

        let uniqueaccounts=[];
        for(let i in accounts){
          if(uniqueaccounts.indexOf(accounts[i]) === -1){
            uniqueaccounts.push(accounts[i]);
          }
        }
        accounts=uniqueaccounts;
        console.log(uniqueaccounts);
        accounts=accounts.filter(function(address){
          return (storageService.get("username-"+address)!==null || storageService.get("virtual-"+address) !== null) && !storageService.get(address).ledger;
        });
        return accounts.map(function(address){
          let account=storageService.get(address);
          if(account){
            account.transactions=storageService.get("transactions-"+address);
            account.delegate=storageService.get("delegate-"+address);
            account.username=storageService.get("username-"+address);
            account.virtual=getVirtual(address);
            return account;
          }
          return {address:address}
        });
      },

      getAccount: getAccount,

      refreshAccount: function(account){
        return fetchAccount(account.address);
      },

      setUsername: function(address,username){
        storageService.set("username-"+address,username);
      },

      getUsername: function(address){
        return storageService.get("username-"+address) || address;
      },

      addWatchOnlyAddress: addWatchOnlyAddress,

      createAccount: createAccount,

      savePassphrases: savePassphrases,

      getPassphrases: getPassphrases,

      removeAccount: removeAccount,

      fetchAccount: fetchAccount,

      fetchAccountAndForget: fetchAccountAndForget,

      getTransactions: getTransactions,

      createTransaction: createTransaction,

      verifyMessage: verifyMessage,

      signMessage: signMessage,

      signMessageWithLedger: signMessageWithLedger,

      createDiffVote: createDiffVote,

      getVotedDelegates: getVotedDelegates,

      getDelegate: getDelegate,

      getActiveDelegates: getActiveDelegates,

      getDelegateByUsername: getDelegateByUsername,

      getSponsors: getSponsors,

      createVirtual: createVirtual,

      setToFolder: setToFolder,

      deleteFolder: deleteFolder,

      sanitizeDelegateName: sanitizeDelegateName,

      numberToFixed: numberToFixed,

      smallId: smallId,

      formatTransaction: formatTransaction,
    }
  }

})();