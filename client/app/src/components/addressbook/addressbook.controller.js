angular
  .module('arkclient.components')
  .controller('AddressbookController', ['$scope', '$mdDialog', '$mdToast', 'storageService', 'gettextCatalog', 'accountService', AddressbookController]);

function AddressbookController($scope, $mdDialog, $mdToast, storageService, gettextCatalog, accountService) {
  const self = this;
  let contacts;
  self.trim = function (str) {
    return str.replace(/^\s\s*/, '').replace(/\s\s*$/, '');
  };

  self.getContacts = function () {
    self.contacts = storageService.get('contacts');
    if (self.contacts == null || self.contacts == undefined) self.contacts = [];
  };

  self.getContacts();

  self.getContactFromAddress = function (address) {
    return self.contacts.find(c => c.address == address);
  };

  self.save = function () {
    storageService.set('contacts', self.contacts);
    self.getContacts();
    $scope.$apply;
  };

  self.isAddress = function (address) {
    return require('arkjs').crypto.validateAddress(address);
  };

  self.contactExists = function (name) {
    let i;
    for (i = 0; i < self.contacts.length; i++) {
      if (self.contacts[i].name == name) {
        return true;
      }
    }
    return false;
  };

  self.showToast = function (message, variable, error) {
    if (error) {
      $mdToast.show(
        $mdToast.simple()
          .textContent(`${gettextCatalog.getString(message)} - ${variable}`)
          .hideDelay(5000)
          .theme('error')
      );
    } else {
      $mdToast.show(
        $mdToast.simple()
          .textContent(`${gettextCatalog.getString(message)} - ${variable}`)
          .hideDelay(5000)
      );
    }
  };

  self.addAddressbookContact = function () {
    $scope.addAddressbookContact = {
      add,
      cancel
    };

    function cancel() {
      $mdDialog.hide();
    }

    function add(contactname, contactaddress) {
      self.getContacts();
      if (self.trim(contactname) == '') {
        self.showToast('this Contact Name is not valid', contactname, true);
        return;
      }
      if (self.trim(contactaddress) == '') {
        self.showToast('this Contact Address is not valid', contactaddress, true);
        return;
      }
      const newcontact = { name: contactname, address: contactaddress };
      if (self.contactExists(contactname)) {
        self.showToast('this Contact Name is already taken, please choose another one', contactname, true);
        return;
      }
      if (!self.isAddress(contactaddress)) {
        self.showToast('this seems to be not a valid Address', contactaddress, true);
        return;
      }
      self.contacts.push(newcontact);
      self.save();
      self.showToast('Contact successfully added', contactname, false);
      cancel();
    }

    $mdDialog.show({
      parent: angular.element(document.getElementById('app')),
      templateUrl: './components/addressbook/addContact.html',
      clickOutsideToClose: false,
      preserveScope: true,
      scope: $scope,
      fullscreen: true
    });
  };

  self.editAddressbookContact = function (address) {
    const contact = self.getContactFromAddress(address);
    if (!contact) {
      self.showToast('This address is not a contact', address, true);
      return;
    }
    const name = contact.name;

    $scope.editAddressbookContact = {
      cancel,
      save,
      remove,
      name,
      address
    };

    function cancel() {
      $mdDialog.hide();
    }

    function save(name, address) {
      if (self.trim(name) == '') {
        self.showToast('this Contact Name is not valid', name, true);
        return;
      }
      if (self.trim(address) == '') {
        self.showToast('this Contact Address is not valid', address, true);
        return;
      }
      self.getContacts();
      if (!self.contactExists(name)) {
        self.showToast('this Contact Name doesnt exist', name, true);
        return;
      }
      if (!self.isAddress(address)) {
        self.showToast('this seems to be not a valid Address', address, true);
        return;
      }
      for (i = 0; i < self.contacts.length; i++) {
        if (self.contacts[i].name == name) {
          self.contacts[i].address = address;
        }
      }
      self.save();
      self.showToast('Contact successfully saved', name, false);
      cancel();
    }

    function remove(name) {
      self.getContacts();
      if (!self.contactExists(name)) {
        self.showToast('this Contact-Name doesnt exist: ', name, true);
        return;
      }
      for (i = 0; i < self.contacts.length; i++) {
        if (self.contacts[i].name == name) {
          delete self.contacts[i];
          self.contacts.splice(i, 1);
        }
      }
      self.save();
      self.showToast('Contact successfully removed', name, false);
      cancel();
    }

    $mdDialog.show({
      parent: angular.element(document.getElementById('app')),
      templateUrl: './components/addressbook/editContact.html',
      clickOutsideToClose: false,
      preserveScope: true,
      scope: $scope,
      fullscreen: true
    });
  };

  self.openMenu = function ($mdOpenMenu, ev) {
    $mdOpenMenu(ev);
  };

  self.getStats = function (account, contact) {
    const stats = {
      income: {
        amount: 0,
        transactions: 0
      },
      expend: {
        amount: 0,
        transactions: 0
      }
    };

    const transactions = storageService.get(`transactions-${account}`);

    if (transactions) {
      const incomeTx = transactions.filter(el => el.senderId == contact);

      const expendTx = transactions.filter(el => el.recipientId == contact);

      stats.income.transactions = incomeTx.length;
      stats.expend.transactions = expendTx.length;

      if (incomeTx.length > 0) {
        const incomeAmount = incomeTx.map(tx => tx.amount).reduce((prev, el) => prev + el);

        stats.income.amount = accountService.numberToFixed(incomeAmount / 100000000).toFixed(2);
      }

      if (expendTx.length > 0) {
        const expendAmount = expendTx.map(tx => tx.amount).reduce((prev, el) => prev + el);

        stats.expend.amount = accountService.numberToFixed(expendAmount / 100000000).toFixed(2);
      }
    }

    return stats;
  };
}

