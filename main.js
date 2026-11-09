// Интерактивность сайта «Новая Реальность».
document.addEventListener('DOMContentLoaded', () => {
  // Мобильное меню.
  const menuToggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  if (menuToggle && nav) {
    menuToggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      menuToggle.textContent = isOpen ? '×' : '☰';
    });
    nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
      nav.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.textContent = '☰';
    }));
  }

  // Плавное появление блоков при прокрутке.
  const revealItems = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    revealItems.forEach(item => observer.observe(item));
  } else {
    revealItems.forEach(item => item.classList.add('visible'));
  }

  // Наклон реалистичной бутылки вслед за мышью. На сенсорных экранах остаётся плавное покачивание.
  const bottleScene = document.querySelector('[data-bottle-scene]');
  const bottleTilt = document.querySelector('[data-bottle-tilt]');
  if (bottleScene && bottleTilt && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    bottleScene.addEventListener('pointermove', event => {
      const rect = bottleScene.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      bottleTilt.style.setProperty('--tilt-y', `${x * 18}deg`);
      bottleTilt.style.setProperty('--tilt-x', `${y * -12}deg`);
    });
    bottleScene.addEventListener('pointerleave', () => {
      bottleTilt.style.setProperty('--tilt-y', '0deg');
      bottleTilt.style.setProperty('--tilt-x', '0deg');
    });
  }

  // Интерактивные шаги цикла термопластавтомата.
  const thermoSteps = [...document.querySelectorAll('[data-thermo-step]')];
  const thermoScene = document.querySelector('[data-thermo-scene]');
  const thermoTitle = document.querySelector('[data-thermo-title]');
  const thermoDescription = document.querySelector('[data-thermo-description]');
  const thermoNumber = document.querySelector('[data-thermo-number]');
  thermoSteps.forEach((button, index) => button.addEventListener('click', () => {
    thermoSteps.forEach((step, stepIndex) => {
      const active = stepIndex === index;
      step.classList.toggle('active', active);
      step.setAttribute('aria-pressed', String(active));
    });
    if (thermoTitle) thermoTitle.textContent = button.dataset.title || '';
    if (thermoDescription) thermoDescription.textContent = button.dataset.description || '';
    if (thermoNumber) thermoNumber.textContent = String(index + 1).padStart(2, '0');
    if (thermoScene) thermoScene.dataset.activeStep = String(index + 1);
  }));

  // Чат: если Netlify Function и ключ OpenAI настроены — работает ИИ.
  // При локальном запуске через Live Server остаются справочные ответы без ИИ.
  const chatLaunch = document.querySelector('.chat-launch');
  const chatPanel = document.querySelector('.chat-panel');
  const chatClose = document.querySelector('.chat-close');
  const chatLog = document.querySelector('[data-chat-log]');
  const chatForm = document.querySelector('[data-chat-form]');
  const chatInput = document.querySelector('[data-chat-input]');
  const chatStatus = document.querySelector('[data-chat-status]');
  const quickQuestions = document.querySelectorAll('[data-chat-question]');
  const conversation = [];
  let isSending = false;

  const setChatStatus = (message, online = false) => {
    if (!chatStatus) return;
    chatStatus.textContent = message;
    chatStatus.closest('span')?.classList.toggle('is-ai-online', online);
  };

  const appendMessage = (text, type = 'bot') => {
    if (!chatLog) return null;
    const node = document.createElement('div');
    node.className = `chat-message ${type === 'user' ? 'user-message' : 'bot-message'}`;
    node.textContent = text;
    chatLog.appendChild(node);
    chatLog.scrollTop = chatLog.scrollHeight;
    return node;
  };

  const localAnswer = question => {
    const q = question.toLocaleLowerCase('ru');
    if (/(преформ|заготов)/.test(q)) return 'ПЭТ-преформа — это заготовка, из которой на следующем этапе выдувают бутылку или другую тару. При подборе важны масса, тип горловины, геометрия и назначение будущей упаковки. Точные исполнения и наличие лучше уточнить у менеджера.';
    if (/(гранул|сырь|вторич|переработ)/.test(q)) return 'В ассортиментных направлениях компании есть ПЭТ-гранулы. Компания работает с первичным и вторичным сырьём. Марка материала, цвет, показатели и допустимость применения зависят от задачи и должны быть подтверждены спецификацией.';
    if (/(бутыл|бан|флакон|ёмкост|емкост|тар|упаков)/.test(q)) return 'Компания указывает среди продукции ПЭТ-бутылки, банки, флаконы и полимерную упаковку. Объём, форма, цвет, горловина, укупорка и требования к контакту с продуктом согласуются для конкретной позиции.';
    if (/(термокег|кег|комплектующ)/.test(q)) return 'Термокега описана как пластиковая ёмкость по принципу термоса. В опубликованной спецификации указан объём 20 л, внутренняя ёмкость из пищевого пластика, слой пенополиуретановой теплоизоляции и внешний корпус из ударопрочного пластика. В комплект входят кран для розлива и ключ для сброса давления. По информации страницы термокеги, закрытая ёмкость при хранении не выше +12 °C может сохранять продукт до 20 суток. Срок и условия обязательно сверяйте с маркировкой конкретной партии. Актуальное наличие и комплектацию уточнит менеджер: +7 (992) 147-61-01.';
    if (/(термопласт|лить|пресс.?форм|впрыск|производств|технолог)/.test(q)) return 'При литье под давлением полимерные гранулы подаются из бункера в нагревательный цилиндр. Шнек перемещает и расплавляет материал, затем расплав впрыскивается в закрытую пресс-форму. После охлаждения изделие извлекают. Конкретные режимы зависят от марки полимера, формы и оборудования.';
    if (/(квас|напит|морс|лимонад|саян|рускол|кола)/.test(q)) return 'В опубликованной линейке «Русский Квас» указаны: хлебный квас фильтрованный пастеризованный, хлебный квас живого брожения, лимонад «Саянъ», морс «Клюква» и «РусКола». Для большинства позиций указан формат ПЭТ 1,5 л (упаковка 6 шт.) и ПЭТ-кега 30 л; для кваса живого брожения, лимонада и морса также указана термокега 20 л. Фильтрованный квас и «РусКола» представлены без термокеги в опубликованном списке. Ассортимент и упаковка могут меняться — подтвердите заказ у менеджера: +7 (992) 147-61-01. Подробная презентация: kvass.html.';
    if (/(цен|стоим|прайс|сколько)/.test(q)) return 'Цена зависит от вида изделия, массы, материала, объёма партии, требований к упаковке и логистики. В открытом каталоге цены пока не указаны. Отправьте запрос через страницу «Контакты» — менеджер уточнит параметры и подготовит ответ.';
    if (/(достав|отгруз|срок|налич|опт|минимальн)/.test(q)) return 'Условия поставки, минимальная партия, наличие и срок изготовления зависят от выбранной позиции. Эти параметры необходимо подтвердить у менеджера. Телефон: +7 (992) 147-61-01.';
    if (/(контакт|менедж|телефон|позвон|адрес|где вы|как связ)/.test(q)) return 'Связаться с компанией можно по телефону +7 (992) 147-61-01. Адрес: Волгоградская область, Городищенский район, р. п. Городище, ул. Фрунзе, д. 1, помещение 2. График: понедельник–пятница, 08:00–17:00. Форма запроса находится на странице «Контакты».';
    if (/(кто вы|компан|новая реальност|чем занимает)/.test(q)) return 'ООО «Новая Реальность» — производственная компания из рабочего посёлка Городище Волгоградской области. Основные продуктовые направления: ПЭТ-преформы, ПЭТ-тара и упаковка, полимерные гранулы, а также «Русский Квас». Компания работает с первичным и вторичным сырьём.';
    return 'Я могу рассказать об ассортименте ПЭТ-преформ и тары, полимерных гранулах, вторичном сырье, термопластавтомате, термокегах и «Русском Квасе». Уточните, пожалуйста, какой продукт или задача вас интересует. Для точной цены и наличия свяжу вас с менеджером: +7 (992) 147-61-01.';
  };

  const sendChatMessage = async rawText => {
    const message = String(rawText || '').trim();
    if (!message || isSending) return;
    isSending = true;
    appendMessage(message, 'user');
    if (chatInput) chatInput.value = '';
    const typing = appendMessage('Печатает…', 'bot');
    typing?.classList.add('typing-message');
    if (chatInput) chatInput.disabled = true;
    const sendButton = chatForm?.querySelector('button[type="submit"]');
    if (sendButton) sendButton.disabled = true;

    let answer = '';
    let aiWorked = false;
    try {
      const response = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: conversation.slice(-8) })
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && typeof result.reply === 'string' && result.reply.trim()) {
        answer = result.reply.trim();
        aiWorked = true;
        setChatStatus('ИИ-консультант онлайн', true);
      } else if (result.code === 'AI_NOT_CONFIGURED') {
        answer = `${localAnswer(message)}\n\nСейчас сайт работает в демонстрационном режиме. Для свободного общения с ИИ нужно добавить ключ OpenAI в настройки Netlify.`;
        setChatStatus('Демо-режим · ИИ не настроен');
      } else {
        throw new Error(result.error || 'Не удалось получить ответ');
      }
    } catch (error) {
      answer = localAnswer(message);
      setChatStatus('Справочный режим · ИИ подключается на хостинге');
    }

    typing?.remove();
    appendMessage(answer, 'bot');
    conversation.push({ role: 'user', content: message }, { role: 'assistant', content: answer });
    if (conversation.length > 16) conversation.splice(0, conversation.length - 16);
    if (!aiWorked && !window.location.hostname.endsWith('netlify.app') && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setChatStatus('Справочный режим · ИИ временно недоступен');
    }
    isSending = false;
    if (chatInput) { chatInput.disabled = false; chatInput.focus(); }
    if (sendButton) sendButton.disabled = false;
  };

  if (chatLaunch && chatPanel) {
    const toggleChat = open => {
      const shouldOpen = typeof open === 'boolean' ? open : !chatPanel.classList.contains('open');
      chatPanel.classList.toggle('open', shouldOpen);
      chatPanel.setAttribute('aria-hidden', String(!shouldOpen));
      chatLaunch.setAttribute('aria-expanded', String(shouldOpen));
      if (shouldOpen) setTimeout(() => chatInput?.focus(), 80);
    };
    chatLaunch.addEventListener('click', () => toggleChat());
    chatClose?.addEventListener('click', () => toggleChat(false));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') toggleChat(false); });
    quickQuestions.forEach(button => button.addEventListener('click', () => sendChatMessage(button.dataset.chatQuestion)));
    chatForm?.addEventListener('submit', event => {
      event.preventDefault();
      sendChatMessage(chatInput?.value || '');
    });
    setChatStatus('Справочная база готова · ИИ после настройки Netlify');
  }

  // В годе в подвале всегда отображается текущий год.
  document.querySelectorAll('[data-current-year]').forEach(node => { node.textContent = new Date().getFullYear(); });

  // Каталог: поиск, категории, фильтры и избранное.
  const catalog = document.querySelector('[data-catalog]');
  if (catalog) {
    const cards = [...catalog.querySelectorAll('.product-card')];
    const search = catalog.querySelector('[data-search]');
    const count = catalog.querySelector('[data-count]');
    const empty = catalog.querySelector('[data-empty]');
    let category = 'all';
    const favoriteKey = 'nr-favorites-v2';
    let favorites = [];
    try { favorites = JSON.parse(localStorage.getItem(favoriteKey) || '[]'); } catch { favorites = []; }

    const paintFavorites = () => catalog.querySelectorAll('.favorite-btn').forEach(button => {
      const active = favorites.includes(button.dataset.productId);
      button.classList.toggle('is-favorite', active);
      button.setAttribute('aria-label', active ? 'Убрать из избранного' : 'Добавить в избранное');
      button.textContent = active ? '♥' : '♡';
    });
    const applyFilters = () => {
      const term = (search?.value || '').trim().toLocaleLowerCase('ru');
      const chosenTypes = [...catalog.querySelectorAll('[data-type-filter]:checked')].map(input => input.value);
      let visible = 0;
      cards.forEach(card => {
        const text = `${card.dataset.searchText || ''} ${card.textContent}`.toLocaleLowerCase('ru');
        const matchesTerm = !term || text.includes(term);
        const matchesCategory = category === 'all' || card.dataset.category === category;
        const matchesType = chosenTypes.length === 0 || chosenTypes.includes(card.dataset.type);
        const show = matchesTerm && matchesCategory && matchesType;
        card.hidden = !show;
        if (show) visible++;
      });
      if (count) count.textContent = `Найдено позиций: ${visible}`;
      if (empty) empty.hidden = visible !== 0;
    };
    search?.addEventListener('input', applyFilters);
    catalog.querySelectorAll('[data-type-filter]').forEach(input => input.addEventListener('change', applyFilters));
    catalog.querySelectorAll('.category-pill').forEach(button => button.addEventListener('click', () => {
      category = button.dataset.category || 'all';
      catalog.querySelectorAll('.category-pill').forEach(pill => pill.classList.toggle('active', pill === button));
      applyFilters();
    }));
    catalog.querySelectorAll('.favorite-btn').forEach(button => button.addEventListener('click', () => {
      const id = button.dataset.productId;
      favorites = favorites.includes(id) ? favorites.filter(item => item !== id) : [...favorites, id];
      try { localStorage.setItem(favoriteKey, JSON.stringify(favorites)); } catch { /* Избранное доступно до закрытия вкладки. */ }
      paintFavorites();
    }));
    catalog.querySelector('[data-clear-filters]')?.addEventListener('click', () => {
      if (search) search.value = '';
      catalog.querySelectorAll('[data-type-filter]').forEach(input => { input.checked = false; });
      category = 'all';
      catalog.querySelectorAll('.category-pill').forEach(pill => pill.classList.toggle('active', pill.dataset.category === 'all'));
      applyFilters();
    });
    paintFavorites();
    applyFilters();
  }

  // Интерактивный предварительный конструктор ПЭТ-упаковки.
  const configurator = document.querySelector('[data-configurator]');
  if (configurator) {
    const svg = configurator.querySelector('[data-config-svg]');
    const body = configurator.querySelector('[data-config-body]');
    const neck = configurator.querySelector('[data-config-neck]');
    const capGroup = configurator.querySelector('[data-config-cap-group]');
    const liquid = configurator.querySelector('[data-config-liquid]');
    const typeButtons = [...configurator.querySelectorAll('[data-config-type]')];
    const colorButtons = [...configurator.querySelectorAll('[data-config-color]')];
    const volume = configurator.querySelector('[data-config-volume]');
    const use = configurator.querySelector('[data-config-use]');
    const material = configurator.querySelector('[data-config-material]');
    const closure = configurator.querySelector('[data-config-closure]');
    const cap = configurator.querySelector('[data-config-cap]');
    const quantity = configurator.querySelector('[data-config-quantity]');
    const nameOutput = configurator.querySelector('[data-config-preview-name]');
    const subtitleOutput = configurator.querySelector('[data-config-preview-subtitle]');
    const summaryOutput = configurator.querySelector('[data-config-summary]');
    const volumeLabel = configurator.querySelector('[data-config-volume-label]');
    const statusOutput = configurator.querySelector('[data-config-status]');
    const copyButton = configurator.querySelector('[data-config-copy]');
    const sendButton = configurator.querySelector('[data-config-send]');

    const products = {
      bottle: {
        name: 'ПЭТ-бутылка',
        body: 'M178 154 L178 116 Q178 106 190 106 L230 106 Q242 106 242 116 L242 154 L263 184 Q273 198 273 218 L273 451 Q273 470 254 470 L166 470 Q147 470 147 451 L147 218 Q147 198 157 184 Z',
        neck: 'M178 119 L178 88 Q178 82 187 82 L233 82 Q242 82 242 88 L242 119',
        liquid: 'M151 355 Q210 342 269 355 L269 451 Q269 468 251 468 L169 468 Q151 468 151 451Z',
        shape: 'бутылка'
      },
      preform: {
        name: 'ПЭТ-преформа',
        body: 'M186 145 L186 112 L177 101 L177 83 Q177 77 185 77 L235 77 Q243 77 243 83 L243 101 L234 112 L234 145 L247 171 L247 447 Q247 463 231 463 L189 463 Q173 463 173 447 L173 171 Z',
        neck: 'M177 103 L177 88 Q177 80 185 80 L235 80 Q243 80 243 88 L243 103',
        liquid: 'M177 400 Q210 394 243 400 L243 447 Q243 461 230 461 L190 461 Q177 461 177 447Z',
        shape: 'заготовка'
      },
      container: {
        name: 'Полимерная ёмкость',
        body: 'M157 164 L157 130 Q157 121 168 121 L252 121 Q263 121 263 130 L263 164 Q282 176 282 204 L282 438 Q282 462 258 462 L162 462 Q138 462 138 438 L138 204 Q138 176 157 164 Z',
        neck: 'M183 132 L183 103 Q183 95 193 95 L227 95 Q237 95 237 103 L237 132',
        liquid: 'M142 350 Q210 338 278 350 L278 438 Q278 459 257 459 L163 459 Q142 459 142 438Z',
        shape: 'ёмкость'
      }
    };
    const colors = {
      clear: {label:'прозрачный', stops:['#8bb9c8','#e9fbff','#ffffff','#a4d1df','#5b94a8'], edge:'#d9f0f6'},
      blue: {label:'голубой', stops:['#367c9c','#91d9f0','#c8f1fb','#4da1c3','#245b7a'], edge:'#b6e8f5'},
      amber: {label:'янтарный', stops:['#87501f','#d38a3e','#ffd18a','#b86a2d','#623818'], edge:'#ffe0a9'},
      green: {label:'зелёный', stops:['#386b4e','#9bc9a3','#e5f4d8','#6eaa7c','#315d45'], edge:'#d6f0d9'}
    };
    const capColors = {
      black:['#111a20','#536671','#10191f'],
      white:['#c9d9de','#ffffff','#91aab2'],
      blue:['#245c77','#63a9c4','#17435b'],
      none:['#111a20','#536671','#10191f']
    };
    let selectedType = 'bottle';
    let selectedColor = 'clear';

    const currentConfig = () => {
      const product = products[selectedType];
      const amount = Math.max(1, Math.floor(Number(quantity?.value) || 1));
      if (quantity) quantity.value = String(amount);
      return {
        type: product.name,
        volume: volume?.value || 'не указан',
        purpose: use?.value || 'не указано',
        material: material?.value || 'обсудить',
        closure: selectedType === 'preform' ? 'Без крышки / преформа' : (closure?.value || 'уточнить'),
        color: colors[selectedColor].label,
        cap: (selectedType === 'preform' || closure?.value === 'Без крышки / преформа') ? 'без крышки' : ({black:'графитовая',white:'белая',blue:'голубая'}[cap?.value] || 'уточнить'),
        quantity: amount
      };
    };
    const makeSummary = config => `${config.type} · ${config.volume} · ${config.color} · ${config.quantity.toLocaleString('ru-RU')} шт.`;
    const makeMessage = config => [
      'Предварительный запрос из конструктора ПЭТ-упаковки:',
      `Тип изделия: ${config.type}`,
      `Объём / размер: ${config.volume}`,
      `Назначение: ${config.purpose}`,
      `Предпочтение по сырью: ${config.material}`,
      `Укупорка: ${config.closure}`,
      `Цвет изделия в эскизе: ${config.color}`,
      `Цвет крышки в эскизе: ${config.cap}`,
      `Ориентировочное количество: ${config.quantity.toLocaleString('ru-RU')} шт.`,
      '',
      'Прошу связаться для уточнения технической возможности, характеристик, стоимости и условий поставки.',
      'Примечание: параметры предварительные, эскиз не является чертежом или согласованной спецификацией.'
    ].join('\n');

    const updatePreview = () => {
      const product = products[selectedType];
      const palette = colors[selectedColor];
      const config = currentConfig();
      if (svg) {
        svg.dataset.product = selectedType;
        svg.setAttribute('aria-label', `Эскиз: ${product.name}, ${config.volume}, ${config.color} цвет`);
      }
      if (body) body.setAttribute('d', product.body);
      if (neck) neck.setAttribute('d', product.neck);
      if (liquid) liquid.setAttribute('d', product.liquid);
      const bodyStops = [...configurator.querySelectorAll('#configBody stop')];
      bodyStops.forEach((stop, index) => stop.setAttribute('stop-color', palette.stops[index] || palette.stops[palette.stops.length - 1]));
      const edgeStops = [...configurator.querySelectorAll('#configEdge stop')];
      edgeStops.forEach((stop, index) => stop.setAttribute('stop-color', index === 1 ? palette.edge : palette.stops[index === 0 ? 0 : 4]));
      const activeCap = cap?.value || 'black';
      const capStops = [...configurator.querySelectorAll('#configCap stop')];
      capStops.forEach((stop, index) => stop.setAttribute('stop-color', capColors[activeCap][index]));
      const noCap = selectedType === 'preform' || closure?.value === 'Без крышки / преформа';
      if (capGroup) capGroup.style.display = noCap ? 'none' : '';
      if (liquid) liquid.style.opacity = selectedType === 'preform' ? '0' : (selectedColor === 'clear' ? '.08' : '.24');
      typeButtons.forEach(button => {
        const active = button.dataset.configType === selectedType;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      colorButtons.forEach(button => {
        const active = button.dataset.configColor === selectedColor;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      if (selectedType === 'preform' && closure) closure.value = 'Без крышки / преформа';
      if (volumeLabel) volumeLabel.textContent = selectedType === 'preform' ? 'Объём готовой бутылки' : 'Объём / размер изделия';
      if (nameOutput) nameOutput.textContent = product.name;
      if (subtitleOutput) subtitleOutput.textContent = `${config.color} исполнение · ${config.cap}`;
      if (summaryOutput) summaryOutput.textContent = makeSummary(config);
      configurator.dispatchEvent(new CustomEvent('configurator:change', {
        detail: { type: selectedType, color: selectedColor, cap: activeCap, hasCap: !noCap }
      }));
    };

    typeButtons.forEach(button => button.addEventListener('click', () => {
      const previousType = selectedType;
      selectedType = button.dataset.configType || 'bottle';
      if (closure) {
        closure.disabled = selectedType === 'preform';
        if (selectedType === 'preform') closure.value = 'Без крышки / преформа';
        else if (previousType === 'preform') closure.value = 'Винтовая крышка';
      }
      updatePreview();
    }));
    colorButtons.forEach(button => button.addEventListener('click', () => {
      selectedColor = button.dataset.configColor || 'clear';
      updatePreview();
    }));
    [volume, use, material, closure, cap, quantity].forEach(field => field?.addEventListener('change', updatePreview));
    quantity?.addEventListener('input', updatePreview);

    copyButton?.addEventListener('click', async () => {
      const text = makeMessage(currentConfig());
      try {
        await navigator.clipboard.writeText(text);
        if (statusOutput) statusOutput.textContent = 'Параметры скопированы. Их можно вставить в письмо или сообщение менеджеру.';
      } catch {
        if (statusOutput) statusOutput.textContent = 'Браузер не разрешил копирование. Используйте кнопку передачи пожеланий менеджеру.';
      }
    });
    sendButton?.addEventListener('click', () => {
      const message = makeMessage(currentConfig());
      const params = new URLSearchParams({product:'custom', message});
      window.location.href = `contacts.html?${params.toString()}#request`;
    });
    updatePreview();
  }

  // Если пользователь пришёл из карточки каталога, подставляем нужный продукт в форму.
  const productSelect = document.querySelector('#topic');
  const productHidden = document.querySelector('input[name="product"]');
  if (productSelect || productHidden) {
    const productNames = {
      preforms: 'ПЭТ-преформы', bottles: 'ПЭТ-бутылки и тара', containers: 'Полимерные ёмкости',
      granules: 'ПЭТ-гранулы', kegs: 'Термокеги и комплектующие', profiles: 'Профили и пластиковые изделия',
      custom: 'Изделие под заказ', kvass: 'Напитки линейки «Русский Квас»',
      'kvass-filtered': 'Квас хлебный фильтрованный пастеризованный',
      'kvass-live': 'Квас хлебный живого брожения', sayan: 'Лимонад «Саянъ»',
      cranberry: 'Морс «Клюква»', ruskola: 'Напиток «РусКола»'
    };
    const product = new URLSearchParams(window.location.search).get('product');
    if (product && productNames[product]) {
      const label = productNames[product];
      if (productHidden) productHidden.value = label;
      if (productSelect) {
        const beverageProducts = ['kvass', 'kvass-filtered', 'kvass-live', 'sayan', 'cranberry', 'ruskola'];
        const optionValue = beverageProducts.includes(product) ? 'Русский Квас' : label;
        const option = [...productSelect.options].find(item => item.value === optionValue || item.textContent.trim().replace(/[«»]/g, '') === optionValue.replace(/[«»]/g, ''));
        if (option) productSelect.value = option.value;
      }
    }
  }

  const incomingMessage = new URLSearchParams(window.location.search).get('message');
  const messageField = document.querySelector('#message');
  if (incomingMessage && messageField) messageField.value = incomingMessage;

  // Демонстрационная форма честно предупреждает, что заявка пока не отправляется.
  document.querySelectorAll('[data-demo-form]').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    const status = form.querySelector('.form-status');
    if (status) status.textContent = 'Это демонстрационная форма: заявка пока НЕ отправлена. Перед запуском подключим реальную отправку на почту или в CRM.';
    form.reset();
  }));

  // Интерактивная виртуальная экскурсия по двум направлениям компании.
  const virtualTour = document.querySelector('[data-virtual-tour]');
  if (virtualTour) {
    const routes = {
      pet: {
        label: 'ПОЛИМЕРНЫЙ ЦИКЛ',
        steps: [
          {short:'Сырьё', kicker:'ВХОДНОЙ МАТЕРИАЛ', title:'Сырьё и гранулы', description:'Производственная цепочка начинается с выбора полимерного сырья. В зависимости от назначения изделия используют соответствующий материал и согласованные требования к его свойствам.', fact:'Свойства исходного материала влияют на технологию обработки и характеристики будущего изделия.', caption:'Полимерное сырьё и гранулы', tags:['ПЭТ','Гранулы','Сырьё'], link:'catalog.html#granules', linkText:'Посмотреть гранулы', bottom:'Материал определяет возможности изделия.', note:'Точный состав и показатели подтверждаются спецификацией.'},
          {short:'Подготовка', kicker:'ПОДГОТОВКА МАТЕРИАЛА', title:'Подготовка к переработке', description:'Перед формованием материал подготавливают с учётом его типа, состояния и требований к конечному продукту. Конкретные операции и параметры зависят от сырья и оборудования.', fact:'Корректная подготовка помогает обеспечить стабильность дальнейшего технологического процесса.', caption:'Подготовка материала к обработке', tags:['Сырьё','Технология','Параметры'], link:'index.html#thermoplast', linkText:'О технологии термопластов', bottom:'Подготовка связывает сырьё и технологию.', note:'Фактический порядок операций зависит от конкретной позиции.'},
          {short:'Формование', kicker:'ПОЛУЧЕНИЕ ФОРМЫ', title:'Формование изделия', description:'При литье под давлением расплав термопласта поступает в полость пресс-формы и принимает заданную геометрию. Это общая схема процесса формования термопластов, а не утверждение о конкретной линии или режиме предприятия.', fact:'Геометрия пресс-формы и характеристики материала определяют форму будущей детали.', caption:'Схема формования в пресс-форме', tags:['Термопласт','Пресс-форма','Литьё'], link:'index.html#thermoplast', linkText:'Изучить принцип литья', bottom:'Форма изделия задаётся инструментом и требованиями.', note:'Технологический маршрут для каждой позиции уточняется отдельно.'},
          {short:'Продукт', kicker:'ГОТОВОЕ ИЗДЕЛИЕ', title:'Контроль и готовая продукция', description:'Готовое изделие оценивают по согласованным требованиям: форме, внешнему виду, размерам и другим показателям спецификации. Для каждой позиции перечень проверок определяется её назначением.', fact:'Покупателю важно получить изделие с параметрами, подходящими под его линию розлива или производственную задачу.', caption:'Готовое полимерное изделие', tags:['Преформы','ПЭТ-тара','Упаковка'], link:'catalog.html', linkText:'Перейти в каталог', bottom:'Результат должен соответствовать задаче заказчика.', note:'Наличие, размеры и технические параметры подтвердит менеджер.'}
        ]
      },
      drinks: {
        label: 'НАПРАВЛЕНИЕ НАПИТКОВ',
        steps: [
          {short:'Подготовка', kicker:'СЫРЬЁ И КОМПОНЕНТЫ', title:'Подготовка компонентов', description:'На подготовительном этапе подбирают и подготавливают компоненты для напитка в соответствии с рецептурой. Конкретные ингредиенты и пропорции определяются видом продукта.', fact:'Качество исходных компонентов и точность рецептуры формируют основу вкуса будущего напитка.', caption:'Подготовка сырья и компонентов', tags:['Компоненты','Рецептура','Подготовка'], link:'kvass.html#products', linkText:'Посмотреть напитки', bottom:'Характер продукта начинается с компонентов.', note:'Состав и рецептура каждой позиции уточняются по её маркировке.'},
          {short:'Брожение', kicker:'ФОРМИРОВАНИЕ ВКУСА', title:'Брожение', description:'Для хлебного кваса этап брожения является частью формирования вкусового профиля. Его параметры зависят от рецептуры и выбранного вида напитка.', fact:'Фильтрованный пастеризованный квас и квас живого брожения — разные продуктовые позиции; условия их обращения могут различаться.', caption:'Этап брожения хлебного кваса', tags:['Квас','Брожение','Вкус'], link:'kvass.html#products', linkText:'К линейке кваса', bottom:'Технология должна соответствовать выбранному виду напитка.', note:'Не переносите условия хранения одной позиции на другую.'},
          {short:'Купаж', kicker:'ФОРМИРОВАНИЕ ПРОДУКТА', title:'Купажирование', description:'На этапе купажирования формируют согласованный вкус напитка. Подход зависит от вида продукта и рецептуры: квас, лимонад, морс и газированный напиток имеют разные особенности.', fact:'Единый ассортимент включает напитки с разными вкусовыми профилями и требованиями к упаковке.', caption:'Купажирование напитка', tags:['Купаж','Вкус','Ассортимент'], link:'kvass.html#products', linkText:'Открыть ассортимент', bottom:'Каждая позиция сохраняет собственный вкусовой профиль.', note:'Неизвестные детали рецептур не раскрываем и не додумываем.'},
          {short:'Проверка', kicker:'ПЕРЕД РОЗЛИВОМ', title:'Проверка качества', description:'Перед передачей на розлив напиток проходит предусмотренные для него проверки. Набор контрольных показателей зависит от продукта и применяемых требований.', fact:'Точные показатели качества и методы контроля должны подтверждаться документацией производителя.', caption:'Контроль перед розливом', tags:['Контроль','Качество','Партия'], link:'contacts.html#request', linkText:'Уточнить документацию', bottom:'Проверка помогает подготовить продукт к следующему этапу.', note:'Не публикуем неподтверждённые лабораторные значения.'},
          {short:'Розлив', kicker:'ГОТОВЫЙ НАПИТОК', title:'Розлив и формат поставки', description:'Готовый напиток направляют в выбранный формат упаковки. В открытом ассортименте описаны ПЭТ-бутылка 1,5 л, ПЭТ-кега 30 л и термокега 20 л для отдельных позиций.', fact:'Формат упаковки зависит от конкретного напитка. Перед заказом менеджер подтверждает актуальную линейку и доступные варианты.', caption:'Розлив и варианты упаковки', tags:['ПЭТ 1,5 л','ПЭТ-кега 30 л','Термокега 20 л'], link:'kvass.html#thermokeg', linkText:'Изучить термокегу', bottom:'Выберите формат, подходящий вашей точке продаж.', note:'Актуальное наличие и сроки поставки подтверждает менеджер.'}
        ]
      }
    };

    const trackButtons = [...virtualTour.querySelectorAll('[data-tour-track-choice]')];
    const stepList = virtualTour.querySelector('[data-tour-step-list]');
    const artwork = virtualTour.querySelector('[data-tour-artwork]');
    const get = selector => virtualTour.querySelector(selector);
    const fields = {
      current:get('[data-tour-current]'), total:get('[data-tour-total]'), label:get('[data-tour-visual-label]'),
      kicker:get('[data-tour-kicker]'), big:get('[data-tour-big-number]'), eyebrow:get('[data-tour-eyebrow]'),
      title:get('[data-tour-title]'), description:get('[data-tour-description]'), fact:get('[data-tour-fact]'),
      caption:get('[data-tour-art-caption]'), tags:get('[data-tour-tags]'), link:get('[data-tour-link]'),
      bottom:get('[data-tour-bottom-title]'), note:get('[data-tour-bottom-note]'), progress:get('[data-tour-progress-line]'),
      prev:get('[data-tour-prev]'), next:get('[data-tour-next]'), helper:get('[data-tour-helper]')
    };
    let activeTrack = 'pet';
    let activeStep = 0;
    let tourAutoplayTimer = null;
    const autoplayButton = get('[data-tour-autoplay]');
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const stopTourAutoplay = () => {
      if (tourAutoplayTimer) window.clearInterval(tourAutoplayTimer);
      tourAutoplayTimer = null;
      if (autoplayButton) {
        autoplayButton.setAttribute('aria-pressed', 'false');
        autoplayButton.innerHTML = '▶ <span>Показать цикл</span>';
      }
    };

    const startTourAutoplay = () => {
      if (reduceMotion) {
        fields.helper.textContent = 'Автопоказ отключён настройкой уменьшения анимации в устройстве.';
        return;
      }
      stopTourAutoplay();
      tourAutoplayTimer = window.setInterval(() => {
        const last = routes[activeTrack].steps.length - 1;
        activeStep = activeStep >= last ? 0 : activeStep + 1;
        renderTour();
      }, 4300);
      if (autoplayButton) {
        autoplayButton.setAttribute('aria-pressed', 'true');
        autoplayButton.innerHTML = 'Ⅱ <span>Остановить</span>';
      }
    };

    const renderTour = () => {
      const route = routes[activeTrack];
      const item = route.steps[activeStep];
      const number = String(activeStep + 1).padStart(2, '0');
      if (artwork) {
        artwork.dataset.track = activeTrack;
        artwork.dataset.step = String(activeStep);
        artwork.classList.remove('is-changing');
        // Restart the short scene transition without restarting the continuous motion loops.
        void artwork.offsetWidth;
        artwork.classList.add('is-changing');
        window.setTimeout(() => artwork.classList.remove('is-changing'), 520);
      }
      virtualTour.dataset.track = activeTrack;
      fields.current.textContent = number;
      fields.total.textContent = String(route.steps.length).padStart(2, '0');
      fields.label.textContent = route.label;
      fields.kicker.textContent = `${activeTrack === 'pet' ? 'ПЭТ И ПОЛИМЕРЫ' : 'НАПИТКИ'} / ЭТАП ${number}`;
      fields.big.textContent = number;
      fields.eyebrow.textContent = item.kicker;
      fields.title.textContent = item.title;
      fields.description.textContent = item.description;
      fields.fact.textContent = item.fact;
      fields.caption.textContent = item.caption;
      fields.bottom.textContent = item.bottom;
      fields.note.textContent = item.note;
      fields.link.href = item.link;
      fields.link.innerHTML = `${item.linkText} <b>↗</b>`;
      fields.tags.replaceChildren(...item.tags.map(tag => {
        const span = document.createElement('span'); span.textContent = tag; return span;
      }));
      fields.progress.style.width = `${((activeStep + 1) / route.steps.length) * 100}%`;
      fields.prev.disabled = activeStep === 0;
      fields.next.disabled = activeStep === route.steps.length - 1;
      fields.helper.textContent = activeStep === route.steps.length - 1 ? 'Маршрут завершён — выберите другой или задайте вопрос' : 'Выберите этап или продолжайте по порядку';
      stepList.replaceChildren(...route.steps.map((step, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `tour-step-button${index === activeStep ? ' active' : ''}${index < activeStep ? ' done' : ''}`;
        button.setAttribute('aria-pressed', String(index === activeStep));
        button.setAttribute('aria-label', `Этап ${index + 1}: ${step.title}`);
        button.innerHTML = `<span class="step-dot">${String(index + 1).padStart(2, '0')}</span><b></b>`;
        button.querySelector('b').textContent = step.short;
        button.addEventListener('click', () => { activeStep = index; renderTour(); });
        return button;
      }));
      trackButtons.forEach(button => {
        const active = button.dataset.tourTrackChoice === activeTrack;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    };

    trackButtons.forEach(button => button.addEventListener('click', () => {
      if (button.dataset.tourTrackChoice === activeTrack) return;
      stopTourAutoplay();
      activeTrack = button.dataset.tourTrackChoice;
      activeStep = 0;
      renderTour();
    }));
    fields.prev.addEventListener('click', () => {
      stopTourAutoplay();
      if (activeStep > 0) { activeStep -= 1; renderTour(); }
    });
    fields.next.addEventListener('click', () => {
      stopTourAutoplay();
      if (activeStep < routes[activeTrack].steps.length - 1) { activeStep += 1; renderTour(); }
    });
    stepList.addEventListener('click', event => {
      if (event.target.closest('[data-tour-step-list] .tour-step-button')) stopTourAutoplay();
    });
    if (autoplayButton) autoplayButton.addEventListener('click', () => {
      if (tourAutoplayTimer) stopTourAutoplay();
      else startTourAutoplay();
    });

    // Subtle pointer tilt on desktop; touch devices keep a stable, lightweight scene.
    if (artwork && window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !reduceMotion) {
      artwork.addEventListener('pointermove', event => {
        const bounds = artwork.getBoundingClientRect();
        const px = (event.clientX - bounds.left) / bounds.width - .5;
        const py = (event.clientY - bounds.top) / bounds.height - .5;
        artwork.style.setProperty('--tour-tilt-x', `${(px * 4).toFixed(2)}deg`);
        artwork.style.setProperty('--tour-tilt-y', `${(-py * 3).toFixed(2)}deg`);
      });
      artwork.addEventListener('pointerleave', () => {
        artwork.style.setProperty('--tour-tilt-x', '0deg');
        artwork.style.setProperty('--tour-tilt-y', '0deg');
      });
    }
    renderTour();
  }

});
