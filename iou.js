var fs = require('fs');
var util = require('util');
var bigrat = require('big-rational');

var objForEach = function(obj, f) {
  Object.keys(obj).forEach(function(k) {
    f(k, obj[k]);
  });
};

exports.openLedger = function(path) {
  // parse file
  var iou = JSON.parse(fs.readFileSync(path));
  // init iou object
  iou.date.from = new Date(iou.date.from);
  iou.date.to = new Date(iou.date.to);
  iou.participants = new Set(iou.participants);
  iou.participantsAll = iou.participants;
  iou.expenses.forEach(function(expense) {
    expense.date = new Date(expense.date);
    var totsum = bigrat();
    var creditors = {};
    expense.creditors.forEach(function(creditor) {
      creditor.amount = bigrat(creditor.amount);
      creditors[creditor.name] = creditor;
    });
    expense.creditors = creditors;
    expense.debtorsSplit = expense.hasOwnProperty('debtorsSplit') ?
      new Set(expense.debtorsSplit) : iou.participants;
    expense.debtorsSplit.forEach(function(debtor) {
      iou.participantsAll.add(debtor);
    });
  });
  stats(iou);
  return iou;
};

var addTo = function(obj, name, val) {
  obj[name] = obj[name].add(val);
};

var stats = function(iou) {
  iou.stats = {
    debit: {},
    credit: {},
    balances: {},
    totalExpenses: bigrat()
  };
  iou.participantsAll.forEach(function(participant) {
    iou.stats.debit[participant] = bigrat();
    iou.stats.credit[participant] = bigrat();
  });
  iou.expenses.forEach(function(expense) {
    var totsum = bigrat();
    objForEach(expense.creditors, function(name, creditor) {
      addTo(iou.stats.debit, name, creditor.amount);
      totsum = totsum.add(creditor.amount);
    });
    var totsplit = totsum.divide(expense.debtorsSplit.size);
    expense.debtorsSplit.forEach(function(debtor) {
      addTo(iou.stats.credit, debtor, totsplit);
    });
    addTo(iou.stats, 'totalExpenses', totsum);
    expense.totalExpenses = totsum;
    expense.splitDebt = totsplit;
  });
  iou.participantsAll.forEach(function(p) {
    iou.stats.balances[p] = iou.stats.debit[p].subtract(iou.stats.credit[p]);
  });
};

var paddings = function(strs) {
  var lengths = strs.map(function(p) {
    return p.length;
  });
  var maxlength = Math.max.apply(null, lengths);
  var pads = lengths.map(function(l) {
    return Array(maxlength - l).fill(' ').join('');
  });
  return pads;
};

var strValOrNone = function(val) {
  return val.isZero() ? '' : val.toDecimal(2);
};

exports.csvreport = function(ledger) {
  var ps = [...ledger.participantsAll].sort();
  var report =
    util.format('Event,%s,\n', ps.join(',,')) +
    util.format(',%s\n',
        Array(ps.length).fill('Debit,Credit').join(',')) +
    ledger.expenses.map(function(expense) {
      return util.format('%s,%s\n', expense.title, ps.map(function(p) {
        return util.format('%s,%s',
            expense.creditors.hasOwnProperty(p) ?
              expense.creditors[p].amount.toDecimal(2) : '',
            expense.debtorsSplit.has(p) ?
              expense.splitDebt.toDecimal(2) : '');
      }).join(','));
    }).join('') +
    util.format('Total Expenses,%s\n', ps.map(function(p) {
      return util.format('%s,%s',
          strValOrNone(ledger.stats.debit[p]),
          strValOrNone(ledger.stats.credit[p]))
    }).join(',')) +
    util.format('Balances,%s\n', ps.map(function(p) {
      return util.format('%s,', strValOrNone(ledger.stats.balances[p]));
    }).join(','));
  return report;
};
