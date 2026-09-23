(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.RendaCalc = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Juro real ao ano usado quando a pessoa não informa outro. Fica na faixa
  // do que o Tesouro IPCA+ de prazo longo pagava em 17/09/2026.
  var DEFAULT_RATE = 0.07;
  var RATE_AS_OF = '17/09/2026';
  var INFLATION_AS_OF = '22/09/2026';
  var CURVE_DATE = { year: 2026, month: 9, day: 22 };
  var PREF_CURVE = {
    b1: 0.128239593529977,
    b2: 0.00895693548795422,
    b3: -0.00115462975604064,
    b4: 0.0446818985006755,
    l1: 5.99394533172506,
    l2: 0.227681678104975
  };
  var IPCA_CURVE = {
    b1: 0.0672607759789912,
    b2: -0.034407472427297,
    b3: 0.0477350360914647,
    b4: 0.0263601864661922,
    l1: 1.4259482286886,
    l2: 0.289856277114528
  };
  var PAYMENTS = 240;
  var RATE_EPS = 1e-12;

  function fail(message) {
    return { ok: false, error: message };
  }

  function isInteger(value) {
    return typeof value === 'number' && Number.isFinite(value) && Math.floor(value) === value;
  }

  function monthlyRate(annual) {
    return Math.pow(1 + annual, 1 / 12) - 1;
  }

  function dateKey(year, month, day) {
    return year * 10000 + month * 100 + day;
  }

  function datePartsKey(date) {
    return dateKey(date.year, date.month, date.day);
  }

  function addDays(date, delta) {
    var utc = Date.UTC(date.year, date.month - 1, date.day + delta);
    var next = new Date(utc);
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
  }

  function easter(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return { year: year, month: month, day: day };
  }

  function yearHolidays(year) {
    var sunday = easter(year);
    var set = {};
    function mark(date) { set[datePartsKey(date)] = true; }
    mark({ year: year, month: 1, day: 1 });
    mark(addDays(sunday, -48));
    mark(addDays(sunday, -47));
    mark(addDays(sunday, -2));
    mark({ year: year, month: 4, day: 21 });
    mark({ year: year, month: 5, day: 1 });
    mark(addDays(sunday, 60));
    mark({ year: year, month: 9, day: 7 });
    mark({ year: year, month: 10, day: 12 });
    mark({ year: year, month: 11, day: 2 });
    mark({ year: year, month: 11, day: 15 });
    mark({ year: year, month: 11, day: 20 });
    mark({ year: year, month: 12, day: 25 });
    return set;
  }

  function businessDaysUntil(target) {
    var holidays = {};
    var year;
    for (year = CURVE_DATE.year; year <= target.year; year++) {
      var marks = yearHolidays(year);
      var name;
      for (name in marks) holidays[name] = true;
    }
    var count = 0;
    var cursor = addDays(CURVE_DATE, 1);
    while (datePartsKey(cursor) <= datePartsKey(target)) {
      var dow = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day)).getUTCDay();
      if (dow !== 0 && dow !== 6 && !holidays[datePartsKey(cursor)]) count++;
      cursor = addDays(cursor, 1);
    }
    return count;
  }

  function svensson(years, curve) {
    function load(lambda) {
      if (years === 0) return 1;
      return (1 - Math.exp(-lambda * years)) / (lambda * years);
    }
    var short = load(curve.l1);
    var long = load(curve.l2);
    return curve.b1
      + curve.b2 * short
      + curve.b3 * (short - Math.exp(-curve.l1 * years))
      + curve.b4 * (long - Math.exp(-curve.l2 * years));
  }

  // Inflação implícita da curva ANBIMA até a data em que a renda começa.
  function impliedInflation(target) {
    if (datePartsKey(target) <= datePartsKey(CURVE_DATE)) {
      return { du: 0, annual: 0, factor: 1 };
    }
    var du = businessDaysUntil(target);
    var years = du / 252;
    var prefixed = svensson(years, PREF_CURVE);
    var real = svensson(years, IPCA_CURVE);
    var annual = (1 + prefixed) / (1 + real) - 1;
    return { du: du, annual: annual, factor: Math.pow(1 + annual, years) };
  }

  // A renda começa exatamente (idade escolhida − idade de hoje) anos após hoje.
  function incomeStart(today, years) {
    return { year: today.getFullYear() + years, month: today.getMonth() + 1, day: today.getDate() };
  }

  function futureValue(monthly, initial, i, n) {
    if (n <= 0) return initial;
    if (Math.abs(i) < RATE_EPS) return initial + monthly * n;
    var growth = Math.pow(1 + i, n);
    return initial * growth + monthly * ((growth - 1) / i);
  }

  function paymentForBalance(balance, i, periods) {
    if (balance <= 0) return 0;
    if (Math.abs(i) < RATE_EPS) return balance / periods;
    return balance * i / (1 - Math.pow(1 + i, -periods));
  }

  function balanceForPayment(payment, i, periods) {
    if (payment <= 0) return 0;
    if (Math.abs(i) < RATE_EPS) return payment * periods;
    return payment * (1 - Math.pow(1 + i, -periods)) / i;
  }

  function monthlyForBalance(balanceNeeded, initial, i, n) {
    var grownInitial = n <= 0 || Math.abs(i) < RATE_EPS
      ? initial
      : initial * Math.pow(1 + i, n);
    var remaining = balanceNeeded - grownInitial;
    if (remaining <= 1e-6) return 0;
    if (n <= 0) return null;
    if (Math.abs(i) < RATE_EPS) return remaining / n;
    var growth = Math.pow(1 + i, n);
    return remaining * i / (growth - 1);
  }

  function simulate(input) {
    input = input || {};
    var today = input.today instanceof Date ? input.today : new Date();
    var age = input.age;
    var retireAge = input.retireAge;

    if (!isInteger(age) || age < 14 || age > 90) {
      return fail('Informe a idade de hoje entre 14 e 90 anos.');
    }
    if (!isInteger(retireAge) || retireAge <= age || retireAge > 100) {
      return fail('A idade da aposentadoria precisa ser maior que a idade de hoje.');
    }

    var mode = input.mode === 'fromIncome' ? 'fromIncome' : 'fromContribution';
    var initial = input.initial == null ? 0 : input.initial;
    if (typeof initial !== 'number' || !Number.isFinite(initial) || initial < 0) {
      return fail('O aporte inicial não pode ser negativo.');
    }

    var annual = input.rate == null ? null : input.rate;
    if (annual != null && (typeof annual !== 'number' || !Number.isFinite(annual) || annual < 0 || annual > 0.25)) {
      return fail('Informe a taxa real ao ano entre 0 e 25, por exemplo 7.');
    }

    var years = retireAge - age;
    var n = years * 12;
    var usedRate = annual == null ? DEFAULT_RATE : annual;
    var i = monthlyRate(usedRate);
    var monthly;
    var desiredIncome = null;

    if (mode === 'fromIncome') {
      desiredIncome = input.desiredIncome;
      if (typeof desiredIncome !== 'number' || !Number.isFinite(desiredIncome) || desiredIncome < 0) {
        return fail('A renda desejada não pode ser negativa.');
      }
      var needed = balanceForPayment(desiredIncome, i, PAYMENTS);
      monthly = monthlyForBalance(needed, initial, i, n);
      if (monthly == null) {
        return fail('O valor inicial não chega nessa renda.');
      }
    } else {
      monthly = input.monthly == null ? 0 : input.monthly;
      if (typeof monthly !== 'number' || !Number.isFinite(monthly) || monthly < 0) {
        return fail('O aporte mensal não pode ser negativo.');
      }
    }

    var balance = futureValue(monthly, initial, i, n);
    var gross = paymentForBalance(balance, i, PAYMENTS);
    var contributed = initial + monthly * n;
    var start = incomeStart(today, years);
    var inflation = impliedInflation(start);

    return {
      ok: true,
      mode: mode,
      age: age,
      retireAge: retireAge,
      monthly: monthly,
      initial: initial,
      desiredIncome: desiredIncome,
      startYear: start.year,
      annualRate: usedRate,
      rateIsDefault: annual == null,
      monthlyRate: i,
      months: n,
      payments: PAYMENTS,
      balance: balance,
      totalContributed: contributed,
      interest: balance - contributed,
      grossIncome: gross,
      inflationAsOf: INFLATION_AS_OF,
      impliedInflation: inflation.annual,
      inflationFactor: inflation.factor,
      nominalIncome: gross * inflation.factor
    };
  }

  return {
    DEFAULT_RATE: DEFAULT_RATE,
    RATE_AS_OF: RATE_AS_OF,
    INFLATION_AS_OF: INFLATION_AS_OF,
    PAYMENTS: PAYMENTS,
    impliedInflation: impliedInflation,
    simulate: simulate
  };
});
