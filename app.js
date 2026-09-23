(function () {
  var QUESTIONS = ['age', 'retire', 'money'];
  var step = 'intro';
  var lastValue = '';

  var brl = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  var $ = function (id) { return document.getElementById(id); };

  function formatPercent(rate) {
    return (rate * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + '%';
  }

  function formatDuration(months) {
    if (months <= 0) return 'menos de um mês';
    var years = Math.floor(months / 12);
    var rest = months % 12;
    var parts = [];
    if (years === 1) parts.push('1 ano');
    else if (years > 1) parts.push(years + ' anos');
    if (rest === 1) parts.push('1 mês');
    else if (rest > 1) parts.push(rest + ' meses');
    return parts.join(' e ');
  }

  function parseAge(raw) {
    var text = String(raw).trim();
    if (!text) return { empty: true };
    if (!/^\d{1,3}$/.test(text)) return { invalid: true };
    return { value: Number(text) };
  }

  function parseMoney(raw) {
    var text = String(raw).trim().replace(/\s/g, '').replace(/R\$/gi, '').replace(/%/g, '');
    if (!text) return { empty: true };
    if (/[.,]$/.test(text)) text = text.slice(0, -1);
    if (!text) return { incomplete: true };

    var hasComma = text.indexOf(',') !== -1;
    var hasDot = text.indexOf('.') !== -1;
    if (hasComma && hasDot) {
      if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
        text = text.replace(/\./g, '').replace(',', '.');
      } else {
        text = text.replace(/,/g, '');
      }
    } else if (hasComma) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (hasDot) {
      var parts = text.split('.');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
        text = text.replace(/\./g, '');
      }
    }

    if (!/^\d+(\.\d+)?$/.test(text)) return { invalid: true };
    return { value: Number(text) };
  }

  function showError(message) {
    var node = $('error');
    node.hidden = false;
    node.textContent = message;
  }

  function clearError() {
    $('error').hidden = true;
  }

  function showStep(name) {
    step = name;
    clearError();
    document.querySelectorAll('[data-step]').forEach(function (section) {
      section.hidden = section.getAttribute('data-step') !== name;
    });

    var index = QUESTIONS.indexOf(name);
    var progress = $('progress-wrap');
    progress.hidden = index === -1;
    if (index !== -1) {
      $('progress-label').textContent = 'Pergunta ' + (index + 1) + ' de ' + QUESTIONS.length;
      $('progress-bar').style.width = ((index + 1) / QUESTIONS.length * 100) + '%';
    }

    var onQuestion = index !== -1;
    $('nav').hidden = !onQuestion;
    $('next').textContent = name === 'money' ? 'Ver a renda' : 'Continuar';
    $('page-title').hidden = name !== 'intro';
    $('method').hidden = name !== 'result';

    window.scrollTo(0, 0);
    if (name === 'result') return;
    var focusTarget = document.querySelector('[data-step="' + name + '"] input, [data-step="' + name + '"] .choice, [data-step="' + name + '"] .continue');
    if (focusTarget) focusTarget.focus();
  }

  function validateAge() {
    var age = parseAge($('age').value);
    if (age.empty) return 'Diz quantos anos você tem.';
    if (age.invalid) return 'Use só o número da idade, sem letras.';
    if (age.value < 14 || age.value > 90) return 'Esta conta vale dos 14 aos 90 anos.';
    return '';
  }

  function validateRetire() {
    var age = parseAge($('age').value);
    var retire = parseAge($('retire').value);
    if (retire.empty) return 'Diz com quantos anos você quer começar a receber.';
    if (retire.invalid) return 'Use só o número da idade, sem letras.';
    if (!age.value || retire.value <= age.value) return 'Essa idade precisa ser maior do que a sua idade de hoje.';
    if (retire.value > 100) return 'Coloque uma idade até 100 anos.';
    return '';
  }

  function validateMoney() {
    var money = parseMoney($('money').value);
    if (money.empty || money.incomplete) return 'Diz quanto consegue guardar por mês.';
    if (money.invalid) return 'Escreva o valor assim: 300 ou 1.500,50.';
    if (money.value <= 0) return 'Coloque um valor maior que zero. Pode ser pouco.';
    return '';
  }

  function currentAnswers() {
    var age = parseAge($('age').value);
    var retire = parseAge($('retire').value);
    var money = parseMoney($('money').value);
    return {
      age: age.value,
      retireAge: retire.value,
      money: money.value
    };
  }

  function addStat(list, label, value) {
    var row = document.createElement('div');
    var dt = document.createElement('dt');
    var dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    row.append(dt, dd);
    list.append(row);
  }

  // Recebe textos e nós; strings viram texto puro, nós entram como estão.
  function addParagraph(parent, pieces) {
    var p = document.createElement('p');
    pieces.forEach(function (piece) {
      p.append(typeof piece === 'string' ? document.createTextNode(piece) : piece);
    });
    parent.append(p);
  }

  function strong(text) {
    var node = document.createElement('strong');
    node.textContent = text;
    return node;
  }

  function setValue(text) {
    var node = $('result-value');
    if (text !== lastValue) {
      node.classList.remove('settling');
      void node.offsetWidth;
      node.classList.add('settling');
      lastValue = text;
    }
    node.textContent = text;
  }

  function renderStory() {
    var answers = currentAnswers();
    var result = RendaCalc.simulate({
      mode: 'fromContribution',
      age: answers.age,
      retireAge: answers.retireAge,
      monthly: answers.money,
      initial: 0,
      today: new Date()
    });
    if (!result.ok) {
      showError(result.error);
      return;
    }
    clearError();

    var income = brl.format(result.grossIncome);
    var monthly = brl.format(result.monthly);
    var duration = formatDuration(result.months);

    $('result-kicker').textContent = 'Você se aposentará com';
    setValue(brl.format(result.nominalIncome));
    $('result-caption').textContent = 'por mês, em reais de ' + result.startYear;

    var story = $('story');
    story.replaceChildren();
    addParagraph(story, [
      strong(income),
      ' em reais de hoje, por 20 anos. ' + monthly + ' por mês, dos ' + answers.age + ' aos ' + answers.retireAge + ' (' + duration + ').'
    ]);

    var stats = $('stats');
    stats.replaceChildren();
    addStat(stats, 'Tempo guardando', duration);
    addStat(stats, 'Por mês', monthly);
    addStat(stats, 'Sai do bolso', brl.format(result.totalContributed));
    addStat(stats, 'Saldo no início da renda', brl.format(result.balance));
    addStat(stats, 'Desse saldo, o juro', brl.format(result.interest));
    addStat(stats, 'Em reais de hoje', income);
    addStat(stats, 'Inflação estimada', formatPercent(result.impliedInflation) + ' ao ano');
    addStat(stats, 'Juro além da inflação', 'IPCA + ' + formatPercent(result.annualRate));
  }

  function advance() {
    var message = '';
    if (step === 'age') message = validateAge();
    if (step === 'retire') message = validateRetire();
    if (step === 'money') message = validateMoney();
    if (message) {
      showError(message);
      return;
    }
    clearError();
    var index = QUESTIONS.indexOf(step);
    if (index < QUESTIONS.length - 1) showStep(QUESTIONS[index + 1]);
    else {
      showStep('result');
      renderStory();
    }
  }

  function back() {
    var index = QUESTIONS.indexOf(step);
    if (index > 0) showStep(QUESTIONS[index - 1]);
    else showStep('intro');
  }

  function resetQuiz() {
    lastValue = '';
    ['age', 'retire', 'money'].forEach(function (id) {
      $(id).value = '';
    });
    showStep('intro');
  }

  function renderConstants() {
    document.querySelectorAll('.rates-date').forEach(function (node) {
      node.textContent = RendaCalc.RATE_AS_OF;
    });
    document.querySelectorAll('.default-rate').forEach(function (node) {
      node.textContent = formatPercent(RendaCalc.DEFAULT_RATE);
    });
  }

  $('sim').addEventListener('submit', function (event) {
    event.preventDefault();
    if (step === 'intro' || step === 'result') return;
    advance();
  });

  $('sim').addEventListener('input', function () {
    if (step !== 'result') clearError();
  });

  $('start').addEventListener('click', function () { showStep('age'); });
  $('next').addEventListener('click', advance);
  $('back').addEventListener('click', back);
  $('back-result').addEventListener('click', function () { showStep('money'); });
  $('restart').addEventListener('click', resetQuiz);

  renderConstants();
  showStep('intro');
})();
