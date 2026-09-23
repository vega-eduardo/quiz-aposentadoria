const assert = require('assert');
const calc = require('./calc');

const today = new Date(2026, 8, 23);

function spec(monthly, initial, annual, months) {
  const i = Math.pow(1 + annual, 1 / 12) - 1;
  const growth = Math.pow(1 + i, months);
  const balance = initial * growth + monthly * ((growth - 1) / i);
  const income = balance * i / (1 - Math.pow(1 + i, -240));
  return { balance, income };
}

const base = calc.simulate({
  mode: 'fromContribution',
  age: 25,
  retireAge: 60,
  monthly: 300,
  initial: 0,
  today
});

assert.strictEqual(base.ok, true);
assert.strictEqual(base.startYear, 2061);
assert.strictEqual(base.months, 420);
assert.strictEqual(base.annualRate, calc.DEFAULT_RATE);
assert.strictEqual(base.rateIsDefault, true);
assert.strictEqual(base.payments, 240);

const expected = spec(300, 0, calc.DEFAULT_RATE, 420);
assert.ok(Math.abs(base.balance - expected.balance) < 1e-6);
assert.ok(Math.abs(base.grossIncome - expected.income) < 1e-6);
assert.strictEqual(base.totalContributed, 126000);
assert.ok(Math.abs(base.interest - (base.balance - 126000)) < 1e-6);
assert.ok(base.interest > base.totalContributed);

// A inflação implícita vai de 22/09/2026 até o dia em que a renda começa.
const horizon = calc.impliedInflation({ year: 2061, month: 9, day: 23 });
assert.ok(horizon.du > 34 * 252 && horizon.du < 35 * 252);
assert.ok(horizon.annual > 0.03 && horizon.annual < 0.10);
assert.ok(Math.abs(base.impliedInflation - horizon.annual) < 1e-12);
assert.ok(Math.abs(base.nominalIncome - base.grossIncome * horizon.factor) < 1e-6);
assert.ok(base.nominalIncome > base.grossIncome);
assert.strictEqual(base.inflationAsOf, '22/09/2026');
assert.strictEqual(calc.impliedInflation({ year: 2026, month: 9, day: 22 }).factor, 1);

// Começar mais cedo significa mais meses de aporte e renda maior.
const at20 = calc.simulate({ age: 20, retireAge: 65, monthly: 300, today });
const at26 = calc.simulate({ age: 26, retireAge: 65, monthly: 300, today });
const at30 = calc.simulate({ age: 30, retireAge: 65, monthly: 300, today });
assert.strictEqual(at20.months, 540);
assert.strictEqual(at26.months, 468);
assert.strictEqual(at30.months, 420);
assert.ok(at20.grossIncome > at26.grossIncome);
assert.ok(at26.grossIncome > at30.grossIncome);
assert.ok(at20.nominalIncome > at26.nominalIncome);
assert.ok(at26.nominalIncome > at30.nominalIncome);
assert.strictEqual(at20.startYear, 2071);
assert.strictEqual(at26.startYear, 2065);

// Só a distância até a idade escolhida importa.
const sameSpan = calc.simulate({ age: 30, retireAge: 65, monthly: 300, today });
assert.strictEqual(sameSpan.nominalIncome.toFixed(6), base.nominalIncome.toFixed(6));

const longer = calc.simulate({ age: 25, retireAge: 61, monthly: 300, today });
assert.ok(longer.grossIncome > base.grossIncome);
assert.ok(longer.nominalIncome > base.nominalIncome);

const inverse = calc.simulate({
  mode: 'fromIncome',
  age: 25,
  retireAge: 60,
  desiredIncome: base.grossIncome,
  initial: 0,
  today
});
assert.ok(Math.abs(inverse.monthly - 300) < 0.01);

const custom = calc.simulate({
  mode: 'fromContribution',
  age: 25,
  retireAge: 60,
  monthly: 300,
  initial: 0,
  today,
  rate: 0.05
});
assert.strictEqual(custom.annualRate, 0.05);
assert.strictEqual(custom.rateIsDefault, false);
assert.ok(custom.grossIncome < base.grossIncome);

const flat = calc.simulate({
  mode: 'fromContribution',
  age: 40,
  retireAge: 45,
  monthly: 100,
  initial: 1000,
  rate: 0,
  today
});
assert.strictEqual(flat.months, 60);
assert.strictEqual(flat.balance, 7000);
assert.ok(Math.abs(flat.grossIncome - 7000 / 240) < 1e-9);

const short = calc.simulate({ age: 64, retireAge: 65, monthly: 100, today });
assert.strictEqual(short.months, 12);
assert.strictEqual(short.startYear, 2027);

assert.strictEqual(calc.simulate({ age: 10, retireAge: 65, monthly: 100, today }).ok, false);
assert.strictEqual(calc.simulate({ age: 30, retireAge: 30, monthly: 100, today }).ok, false);
assert.strictEqual(calc.simulate({ age: 30, retireAge: 65, monthly: -1, today }).ok, false);
assert.strictEqual(calc.simulate({ age: 30, retireAge: 65, monthly: 100, rate: 0.3, today }).ok, false);
assert.strictEqual(calc.simulate({ age: 30, retireAge: 65, monthly: 100, initial: -5, today }).ok, false);

console.log('calc.test.js ok');
