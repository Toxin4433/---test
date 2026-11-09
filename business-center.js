import { getSupabase, getActiveUserProfile } from './auth.js';

// NR Business Center: корзина хранится локально, а оформленные заявки отправляются в тестовую CRM через защищённый RPC.
(() => {
  const CART_KEY = 'nr-business-cart-v1';
  const MAX_ITEMS = 40;
  const MAX_FILES = 3;
  const MAX_FILE_SIZE = 15 * 1024 * 1024;
  const allowedExtensions = ['pdf','png','jpg','jpeg','webp','dwg','dxf','doc','docx','xls','xlsx'];

  const safeRead = () => {
    try {
      const value = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(value) ? value.filter(item => item && typeof item === 'object').slice(0, MAX_ITEMS) : [];
    } catch { return []; }
  };
  const safeWrite = items => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items.slice(0, MAX_ITEMS))); return true; }
    catch { return false; }
  };
  const makeId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const formatNumber = value => Number(value || 0).toLocaleString('ru-RU');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  const cartCount = items => items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity) || 1), 0);
  const updateBadges = () => {
    const count = safeRead().length;
    document.querySelectorAll('[data-business-cart-count]').forEach(node => { node.textContent = String(count); node.hidden = count === 0; });
    document.querySelectorAll('[data-business-cart-link]').forEach(node => node.setAttribute('aria-label', `Центр заказов, позиций: ${count}`));
  };

  let toastTimer = null;
  const showToast = message => {
    let toast = document.querySelector('.business-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'business-toast';
      toast.setAttribute('role','status');
      toast.setAttribute('aria-live','polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
  };

  const addItem = item => {
    const items = safeRead();
    if (items.length >= MAX_ITEMS) {
      showToast(`В центре заказов максимум ${MAX_ITEMS} разных позиций. Удалите ненужные.`);
      return false;
    }
    const normalized = {
      id: String(item.id || makeId('item')),
      kind: item.kind === 'configuration' ? 'configuration' : 'product',
      name: String(item.name || 'Позиция каталога').slice(0,160),
      description: String(item.description || '').slice(0,600),
      details: String(item.details || '').slice(0,1400),
      quantity: Math.max(1, Math.min(10000000, Math.floor(Number(item.quantity) || 1))),
      unit: String(item.unit || 'шт.').slice(0,16),
      requestSample: Boolean(item.requestSample),
      createdAt: new Date().toISOString()
    };
    const duplicate = items.find(existing => existing.id === normalized.id && existing.details === normalized.details && existing.requestSample === normalized.requestSample);
    if (duplicate) duplicate.quantity = Math.min(10000000, (Number(duplicate.quantity) || 1) + normalized.quantity);
    else items.push(normalized);
    if (!safeWrite(items)) {
      showToast('Не удалось сохранить список. Проверьте настройки браузера.');
      return false;
    }
    updateBadges();
    renderCart();
    showToast(normalized.requestSample ? 'Позиция добавлена в запрос образца' : 'Позиция добавлена в центр заказов');
    return true;
  };

  const removeItem = id => {
    safeWrite(safeRead().filter(item => item.id !== id));
    renderCart();
    updateBadges();
  };

  const updateQuantity = (id, value) => {
    const items = safeRead();
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    item.quantity = Math.max(1, Math.min(10000000, Math.floor(Number(value) || 1)));
    safeWrite(items);
    updateBadges();
    renderCart();
  };

  const initNav = () => {
    document.querySelectorAll('.main-nav').forEach(nav => {
      let link = nav.querySelector('[data-business-cart-link]');
      if (!link) {
        link = document.createElement('a');
        link.href = 'business-center.html';
        link.className = 'business-center-nav';
        link.dataset.businessCartLink = '';
        link.innerHTML = '<span>Центр заказов</span><b data-business-cart-count hidden>0</b>';
        const contacts = [...nav.querySelectorAll('a')].find(a => /контакт/i.test(a.textContent));
        nav.insertBefore(link, contacts || null);
      }
      if (!link.dataset.mobileCloseBound) {
        link.dataset.mobileCloseBound = '1';
        link.addEventListener('click', () => {
          nav.classList.remove('open');
          const toggle = document.querySelector('.menu-toggle');
          if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.textContent = '☰'; }
        });
      }
    });
    updateBadges();
  };

  const initCatalogButtons = () => {
    document.querySelectorAll('[data-catalog] .product-card').forEach((card, index) => {
      const info = card.querySelector('.product-info');
      if (!info || info.querySelector('.product-card-actions')) return;
      const title = card.querySelector('h3')?.textContent.trim() || `Продукция ${index + 1}`;
      const description = card.querySelector('.product-info > p')?.textContent.trim() || '';
      const fav = card.querySelector('[data-product-id]');
      const id = fav?.dataset.productId || card.id || `catalog-${index+1}`;
      const actions = document.createElement('div');
      actions.className = 'product-card-actions';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn-card-add';
      add.textContent = 'Добавить в запрос +';
      add.dataset.businessAddProduct = '';
      add.dataset.itemId = id;
      add.dataset.itemName = title;
      add.dataset.itemDescription = description;
      actions.appendChild(add);
      if (card.dataset.type !== 'beverage' && card.dataset.type !== 'custom') {
        const sample = document.createElement('button');
        sample.type = 'button';
        sample.className = 'btn-card-sample';
        sample.textContent = 'Запросить образец';
        sample.dataset.businessAddSample = '';
        sample.dataset.itemId = id;
        sample.dataset.itemName = title;
        sample.dataset.itemDescription = description;
        actions.appendChild(sample);
      }
      const meta = info.querySelector('.product-meta');
      if (meta) meta.insertAdjacentElement('afterend', actions); else info.appendChild(actions);
    });
  };

  const center = document.querySelector('[data-business-center]');
  const emptyCartMarkup = '<div class="business-empty"><div class="business-empty-icon">＋</div><h3>Пока нет выбранных позиций</h3><p>Добавьте продукцию из каталога или перенесите предварительную конфигурацию из 3D-конструктора.</p><div class="business-empty-actions"><a class="btn btn-dark" href="catalog.html">Открыть каталог ↗</a><a class="business-text-link" href="configurator.html">Перейти в конструктор</a></div></div>';

  function renderCart() {
    if (!center) return;
    const list = center.querySelector('[data-business-cart-list]');
    const countLabel = center.querySelector('[data-business-total-count]');
    const total = center.querySelector('[data-business-line-count]');
    if (!list) return;
    const items = safeRead();
    if (countLabel) countLabel.textContent = `${cartCount(items)} шт.`;
    if (total) total.textContent = `${items.length} ${items.length === 1 ? 'позиция' : (items.length > 1 && items.length < 5 ? 'позиции' : 'позиций')}`;
    if (!items.length) {
      list.innerHTML = emptyCartMarkup;
      return;
    }
    list.innerHTML = items.map(item => `
      <article class="business-cart-item" data-cart-row="${escapeHtml(item.id)}">
        <div class="business-cart-item-main">
          <div class="business-cart-item-icon">${item.kind === 'configuration' ? '◇' : '▦'}</div>
          <div class="business-cart-item-copy"><div class="business-cart-item-kicker">${item.kind === 'configuration' ? 'ИЗ КОНСТРУКТОРА' : 'КАТАЛОГ'}${item.requestSample ? ' · ОБРАЗЕЦ' : ''}</div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p>${item.details ? `<small>${escapeHtml(item.details).replace(/\n/g,'<br>')}</small>` : ''}</div>
        </div>
        <div class="business-cart-item-controls"><label>Количество <span><input type="number" min="1" max="10000000" step="1" value="${Math.max(1,Number(item.quantity)||1)}" data-cart-quantity="${escapeHtml(item.id)}"><b>${escapeHtml(item.unit)}</b></span></label><button type="button" class="business-remove-button" data-cart-remove="${escapeHtml(item.id)}">Удалить ×</button></div>
      </article>`).join('');
  }

  const initCenter = () => {
    if (!center) return;
    renderCart();
    const params = new URLSearchParams(window.location.search);
    const modeInputs = [...center.querySelectorAll('[data-business-request-mode]')];
    if (params.get('mode') === 'sample') {
      const sampleMode = modeInputs.find(input => input.value === 'sample');
      if (sampleMode) sampleMode.checked = true;
    }
    const fileInput = center.querySelector('[data-business-files]');
    const fileList = center.querySelector('[data-business-file-list]');
    const status = center.querySelector('[data-business-status]');
    const form = center.querySelector('[data-business-request-form]');
    getSupabase().then(async supabase => {
      const context = await getActiveUserProfile(supabase);
      if (context?.profile?.role === 'customer' && form) {
        const nameField = form.elements.namedItem('name');
        const emailField = form.elements.namedItem('email');
        if (nameField && !nameField.value) nameField.value = context.profile.full_name || '';
        if (emailField && !emailField.value) emailField.value = context.profile.email || context.user.email || '';
      }
    }).catch(() => {});
    const renderFiles = () => {
      if (!fileInput || !fileList) return;
      const files = [...(fileInput.files || [])];
      fileList.textContent = files.length ? files.map(file => `${file.name} · ${(file.size/1024/1024).toFixed(2)} МБ`).join(' | ') : 'Файлы не выбраны';
    };
    fileInput?.addEventListener('change', () => {
      const files = [...(fileInput.files || [])];
      let problem = '';
      if (files.length > MAX_FILES) problem = `Можно выбрать не более ${MAX_FILES} файлов.`;
      for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!allowedExtensions.includes(ext)) { problem = `Формат .${ext} не поддерживается.`; break; }
        if (file.size > MAX_FILE_SIZE) { problem = `Файл «${file.name}» больше 15 МБ.`; break; }
      }
      if (problem) {
        fileInput.value = '';
        if (status) status.textContent = problem;
      }
      renderFiles();
    });
    const clearButton = center.querySelector('[data-business-clear-cart]');
    clearButton?.addEventListener('click', () => {
      if (!safeRead().length) return;
      if (!window.confirm('Удалить все позиции из центра заказов?')) return;
      safeWrite([]); renderCart(); updateBadges();
      if (status) status.textContent = 'Список очищен.';
    });
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const items = safeRead();
      if (!items.length) {
        if (status) status.textContent = 'Сначала добавьте хотя бы одну позицию из каталога или конструктора.';
        return;
      }
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const name = String(data.get('name') || '').trim();
      const phone = String(data.get('phone') || '').trim();
      const email = String(data.get('email') || '').trim();
      if (!name) { if (status) status.textContent = 'Укажите имя.'; return; }
      if (!phone && !email) { if (status) status.textContent = 'Укажите хотя бы один способ связи: телефон или email.'; return; }

      const submitButton = form.querySelector('button[type="submit"]');
      if (submitButton?.disabled) return;
      if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Отправляем заявку…'; }
      if (status) status.textContent = 'Сохраняем заявку в тестовой CRM…';

      try {
        const files = [...(fileInput?.files || [])];
        const payload = {
          name,
          company: String(data.get('company') || '').trim(),
          phone,
          email,
          city: String(data.get('city') || '').trim(),
          inn: String(data.get('inn') || '').trim(),
          type: String(data.get('requestMode') || 'quote'),
          comment: String(data.get('comment') || '').trim(),
          items: items.map(item => ({
            name: String(item.name || '').slice(0, 160),
            description: String(item.description || '').slice(0, 600),
            details: String(item.details || '').slice(0, 1400),
            quantity: Math.max(1, Math.min(10000000, Math.floor(Number(item.quantity) || 1))),
            unit: String(item.unit || 'шт.').slice(0, 16),
            requestSample: Boolean(item.requestSample),
            kind: item.kind === 'configuration' ? 'configuration' : 'product'
          })),
          attachments: files.map(file => ({ name: file.name.slice(0, 180), size_bytes: file.size, content_type: file.type || 'application/octet-stream' }))
        };

        const supabase = await getSupabase();
        const { data: savedOrder, error } = await supabase.rpc('create_order', { p_payload: payload });
        if (error) throw error;
        if (!savedOrder?.order_number) throw new Error('Сервер не вернул номер заявки. Проверьте журнал базы данных.');

        const typeLabel = { quote: 'Расчёт стоимости и условий', sample: 'Запрос образцов', custom: 'Индивидуальное изготовление' }[payload.type] || 'Консультация';
        const lines = [
          'ЗАПРОС В ООО «НОВАЯ РЕАЛЬНОСТЬ»',
          `Номер заявки CRM: ${savedOrder.order_number}`,
          `Дата: ${new Date().toLocaleString('ru-RU')}`,
          `Тип запроса: ${typeLabel}`,
          '', 'КОНТАКТЫ',
          `Имя: ${name}`,
          `Компания: ${payload.company || 'не указана'}`,
          `Телефон: ${phone || 'не указан'}`,
          `Email: ${email || 'не указан'}`,
          `Город / регион: ${payload.city || 'не указан'}`,
          `ИНН: ${payload.inn || 'не указан'}`,
          '', 'ПОЗИЦИИ ЗАПРОСА'
        ];
        items.forEach((item, index) => {
          lines.push(`${index + 1}. ${item.name}`);
          lines.push(`   Количество: ${formatNumber(item.quantity)} ${item.unit}`);
          if (item.description) lines.push(`   Описание: ${item.description}`);
          if (item.details) lines.push(`   Параметры: ${item.details.replace(/\n/g, '; ')}`);
          if (item.requestSample) lines.push('   Дополнительно: запрошен образец');
        });
        lines.push('', 'КОММЕНТАРИЙ', payload.comment || 'не указан');
        lines.push('', 'ПРИЛОЖЕНИЯ', files.length ? files.map(file => `- ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} МБ)`).join('\n') : 'Файлы не приложены');
        lines.push('', 'ВАЖНО: это предварительный запрос. Техническая возможность, характеристики, наличие, стоимость и условия поставки подтверждаются менеджером.');
        lines.push('Файлы пока не загружаются в CRM: в заявке сохранены только их названия и размеры.');

        const blob = new Blob(['\uFEFF', lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `novaya-realnost-${savedOrder.order_number}.txt`;
        document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1200);

        safeWrite([]); renderCart(); updateBadges();
        form.reset(); renderFiles();
        if (status) status.innerHTML = `<strong>Заявка ${escapeHtml(savedOrder.order_number)} сохранена в CRM.</strong> Менеджер увидит её в рабочем кабинете. Черновик с номером заявки также скачан.`;
      } catch (error) {
        console.error('CRM order submit failed:', error);
        if (status) status.textContent = `Не удалось отправить заявку: ${error.message || 'ошибка соединения'}. Данные формы и корзина сохранены на этой странице — попробуйте ещё раз.`;
      } finally {
        if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Отправить заявку в CRM ↓'; }
      }
    });
  };

  const initConfiguratorButton = () => {
    const button = document.querySelector('[data-config-add-to-cart]');
    const section = document.querySelector('[data-configurator]');
    if (!button || !section) return;
    button.addEventListener('click', () => {
      const activeType = section.querySelector('[data-config-type].active')?.dataset.configType || 'bottle';
      const typeNames = {bottle:'ПЭТ-бутылка',preform:'ПЭТ-преформа',container:'Полимерная ёмкость'};
      const volume = section.querySelector('[data-config-volume]')?.value || 'не указан';
      const purpose = section.querySelector('[data-config-use]')?.value || 'не указано';
      const material = section.querySelector('[data-config-material]')?.value || 'обсудить';
      const closure = activeType === 'preform' ? 'без крышки' : (section.querySelector('[data-config-closure]')?.value || 'уточнить');
      const color = section.querySelector('[data-config-color].active')?.dataset.configColor || 'clear';
      const colorNames = {clear:'прозрачный',blue:'голубой',amber:'янтарный',green:'зелёный'};
      const cap = section.querySelector('[data-config-cap]')?.selectedOptions?.[0]?.textContent || 'уточнить';
      const quantity = Math.max(1, Math.floor(Number(section.querySelector('[data-config-quantity]')?.value) || 1));
      const name = typeNames[activeType] || 'ПЭТ-изделие';
      const details = [`Объём / размер: ${volume}`,`Назначение: ${purpose}`,`Предпочтение по сырью: ${material}`,`Укупорка: ${closure}`,`Цвет эскиза: ${colorNames[color] || color}`,`Крышка: ${activeType === 'preform' ? 'без крышки' : cap}`].join('\n');
      const description = 'Предварительная конфигурация из 3D-конструктора. Параметры требуют подтверждения специалистом.';
      addItem({id:makeId('config'),kind:'configuration',name,description,details,quantity,unit:'шт.'});
    });
  };

  const initInteractions = () => {
    initNav();
    initCatalogButtons();
    initConfiguratorButton();
    initCenter();
    updateBadges();
    document.addEventListener('click', event => {
      const addProduct = event.target.closest('[data-business-add-product]');
      if (addProduct) {
        addItem({id:`product-${addProduct.dataset.itemId}`,kind:'product',name:addProduct.dataset.itemName,description:addProduct.dataset.itemDescription,quantity:1,unit:'шт.'});
        return;
      }
      const addSample = event.target.closest('[data-business-add-sample]');
      if (addSample) {
        addItem({id:`sample-${addSample.dataset.itemId}`,kind:'product',name:addSample.dataset.itemName,description:addSample.dataset.itemDescription,quantity:1,unit:'образец',requestSample:true});
        window.location.href = 'business-center.html?mode=sample#request';
        return;
      }
      const remove = event.target.closest('[data-cart-remove]');
      if (remove) { removeItem(remove.dataset.cartRemove); return; }
    });
    document.addEventListener('change', event => {
      const qty = event.target.closest('[data-cart-quantity]');
      if (qty) updateQuantity(qty.dataset.cartQuantity, qty.value);
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initInteractions, {once:true});
  else initInteractions();
})();
