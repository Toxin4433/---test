(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STATUS = {
    new: {label: 'Новая', cls: 'status-new'},
    progress: {label: 'В работе', cls: 'status-progress'},
    waiting: {label: 'Ожидает клиента', cls: 'status-waiting'},
    done: {label: 'Завершена', cls: 'status-done'},
    cancelled: {label: 'Отменена', cls: 'status-cancelled'}
  };
  const TYPE = {quote: 'Расчёт стоимости', sample: 'Запрос образца', custom: 'Изготовление'};
  const demoDate = days => { const date = new Date(); date.setDate(date.getDate() - days); return date.toISOString(); };
  const requests = [
    {id:'NR-DEMO-001', date:demoDate(0), type:'quote', status:'new', priority:'high', client:{name:'Александр — тестовая запись',company:'ООО «ВолгаФуд» (демо)',phone:'+7 (000) 000-00-01',email:'volgafood@example.invalid',city:'Волгоград',inn:'0000000000'}, items:[{name:'ПЭТ-преформа',quantity:10000,unit:'шт.',description:'Тестовая позиция каталога',details:'Параметры для демонстрации'}], comment:'Демо-запись. Требуется уточнить горловину и массу преформы.', note:'Связаться после согласования технических параметров.', demo:true},
    {id:'NR-DEMO-002', date:demoDate(1), type:'sample', status:'progress', priority:'normal', client:{name:'Мария — тестовая запись',company:'ИП «Тест» (демо)',phone:'+7 (000) 000-00-02',email:'client@example.invalid',city:'Камышин',inn:'не указан'}, items:[{name:'ПЭТ-бутылка',quantity:3,unit:'образца',description:'Запрос образцов из тестового набора',details:'Прозрачная, предварительный вариант'}], comment:'Демо-запись для проверки процесса запроса образцов.', note:'Подготовить тестовую подборку.', demo:true},
    {id:'NR-DEMO-003', date:demoDate(3), type:'custom', status:'waiting', priority:'normal', client:{name:'Игорь — тестовая запись',company:'ООО «Пищевые решения» (демо)',phone:'+7 (000) 000-00-03',email:'buyer@example.invalid',city:'Саратов',inn:'не указан'}, items:[{name:'Индивидуальная полимерная ёмкость',quantity:5000,unit:'шт.',description:'Условный пример индивидуального заказа',details:'Эскиз и характеристики требуют подтверждения'}], comment:'Демо-запись. Клиент должен направить чертёж.', note:'Ожидаем техническое задание.', demo:true}
  ];
  let activeRequestId = null;
  let toastTimer = null;
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fmtDate = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'short',year:'numeric'}).format(date); };
  const fmtDateTime = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date); };
  const toast = message => { const node = $('#managerToast'); if (!node) return; node.textContent = message; node.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 2600); };
  const statusBadge = status => { const item = STATUS[status] || STATUS.new; return `<span class="status-pill ${item.cls}">${item.label}</span>`; };
  const total = () => requests.length;
  const setMetrics = () => {
    $('#metricTotal').textContent = total();
    $('#metricNew').textContent = requests.filter(r => r.status === 'new').length;
    $('#metricProgress').textContent = requests.filter(r => r.status === 'progress').length;
    $('#metricSamples').textContent = requests.filter(r => r.type === 'sample').length;
    $('#sidebarRequestCount').textContent = total();
  };
  const visibleRequests = (mode = 'all') => {
    const q = ($('#requestSearch')?.value || '').trim().toLowerCase();
    const status = $('#statusFilter')?.value || 'all';
    const type = mode === 'samples' ? 'sample' : ($('#typeFilter')?.value || 'all');
    return requests.filter(request => {
      if (status !== 'all' && request.status !== status) return false;
      if (type !== 'all' && request.type !== type) return false;
      const haystack = [request.id, request.client?.name, request.client?.company, request.client?.phone, request.client?.email, request.client?.city, ...request.items.map(i => i.name)].join(' ').toLowerCase();
      return !q || haystack.includes(q);
    }).sort((a,b) => new Date(b.date)-new Date(a.date));
  };
  const openDetail = id => {
    const request = requests.find(item => item.id === id); if (!request) return;
    activeRequestId = id;
    $('#detailNumber').textContent = request.id;
    const client = request.client || {};
    const items = request.items || [];
    $('#detailContent').innerHTML = `
      <div class="detail-block"><h3>КЛИЕНТ</h3>
        <div class="detail-pair"><span>Контакт</span><b>${safe(client.name || 'Не указан')}</b></div>
        <div class="detail-pair"><span>Компания</span><b>${safe(client.company || 'Не указана')}</b></div>
        <div class="detail-pair"><span>Телефон</span><b>${safe(client.phone || 'Не указан')}</b></div>
        <div class="detail-pair"><span>Email</span><b>${safe(client.email || 'Не указан')}</b></div>
        <div class="detail-pair"><span>Город</span><b>${safe(client.city || 'Не указан')}</b></div>
        <div class="detail-pair"><span>ИНН</span><b>${safe(client.inn || 'Не указан')}</b></div>
      </div>
      <div class="detail-block"><h3>СОСТАВ ЗАПРОСА</h3><div class="detail-items">${items.map(item=>`<div class="detail-item"><b>${safe(item.name)} · ${safe(item.quantity)} ${safe(item.unit || 'шт.')}</b><small>${safe(item.description || '')}${item.details ? `\n${safe(item.details)}` : ''}</small></div>`).join('') || '<p>Позиции не указаны</p>'}</div></div>
      <div class="detail-block"><h3>КОММЕНТАРИЙ КЛИЕНТА</h3><p style="font-size:10px;line-height:1.7;color:#607780;white-space:pre-wrap">${safe(request.comment || 'Не указан')}</p></div>
      <div class="detail-block"><h3>ОБРАБОТКА ЗАЯВКИ</h3>
        <div class="detail-controls">
          <div class="detail-field"><label for="detailStatus">Статус</label><select id="detailStatus">${Object.entries(STATUS).map(([key,val])=>`<option value="${key}" ${request.status===key?'selected':''}>${val.label}</option>`).join('')}</select></div>
          <div class="detail-field"><label for="detailPriority">Приоритет</label><select id="detailPriority"><option value="normal" ${request.priority!=='high'?'selected':''}>Обычный</option><option value="high" ${request.priority==='high'?'selected':''}>Высокий</option></select></div>
        </div>
        <div class="detail-field" style="margin-top:12px"><label for="detailNote">Внутренняя заметка менеджера</label><textarea id="detailNote" placeholder="Например: перезвонить, уточнить параметры, подготовить образец…">${safe(request.note || '')}</textarea></div>
        <button type="button" class="detail-save" id="saveRequestChanges">Сохранить изменения в этом сеансе</button>
        <div class="detail-links">${client.phone && !request.demo ? `<a href="tel:${safe(client.phone.replace(/[^+\d]/g,''))}">Позвонить</a>` : ''}${client.email && !client.email.endsWith('.invalid') ? `<a href="mailto:${safe(client.email)}">Написать email</a>` : ''}</div>
      </div>
      ${request.demo ? '<p style="font-size:8px;color:#a28a6b;line-height:1.6">Это вымышленная демонстрационная запись. Не является обращением реального клиента.</p>' : '<p style="font-size:8px;color:#7d929b;line-height:1.6">Импортировано из TXT-черновика на этом устройстве. Данные не отправлены в CRM.</p>'}`;
    $('#requestDetail').classList.add('open'); $('#requestDetail').setAttribute('aria-hidden','false'); $('#detailBackdrop').hidden = false;
  };
  const closeDetail = () => { $('#requestDetail').classList.remove('open'); $('#requestDetail').setAttribute('aria-hidden','true'); $('#detailBackdrop').hidden = true; activeRequestId = null; };
  const renderRecent = () => {
    const recent = [...requests].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,4);
    $('#recentList').innerHTML = recent.map(r=>`<article class="recent-row" tabindex="0" role="button" data-open-request="${safe(r.id)}"><div><span class="recent-title">${safe(r.client?.company || r.client?.name || 'Без названия')}</span><span class="recent-sub">${safe(r.id)} · ${safe(TYPE[r.type] || 'Запрос')}</span></div><div class="recent-right"><span class="recent-date">${fmtDate(r.date)}</span>${statusBadge(r.status)}</div></article>`).join('') || '<p class="no-results">Заявок пока нет. Импортируйте TXT-черновик.</p>';
  };
  const renderTable = () => {
    const list = visibleRequests();
    $('#requestTableBody').innerHTML = list.map(r=>`<tr data-open-request="${safe(r.id)}"><td><span class="request-code">${safe(r.id)}</span>${r.priority==='high'?'<span class="client-sub">Высокий приоритет</span>':''}</td><td><span class="client-name">${safe(r.client?.company || r.client?.name || 'Не указан')}</span><span class="client-sub">${safe(r.client?.name || '')}</span></td><td><span class="type-tag">${safe(TYPE[r.type] || 'Запрос')}</span></td><td><span class="table-date">${fmtDate(r.date)}</span></td><td>${statusBadge(r.status)}</td><td><button class="row-open" type="button" data-open-request="${safe(r.id)}">Открыть →</button></td></tr>`).join('');
    $('#noResults').hidden = list.length > 0;
  };
  const renderSamples = () => {
    const list = requests.filter(r=>r.type==='sample').sort((a,b)=>new Date(b.date)-new Date(a.date));
    $('#sampleSummary').innerHTML = list.map(r=>`<article class="sample-card" data-open-request="${safe(r.id)}"><span class="section-kicker">${safe(r.id)} · ${fmtDate(r.date)}</span><h3>${safe(r.items?.map(i=>i.name).join(', ') || 'Образцы продукции')}</h3><p>${safe(r.client?.company || r.client?.name || 'Клиент не указан')} · ${safe(STATUS[r.status]?.label || 'Новая')}</p></article>`).join('') || '<div class="manager-card">Пока нет запросов образцов. Импортируйте TXT-черновик из Центра заказов.</div>';
  };
  const render = () => { setMetrics(); renderRecent(); renderTable(); renderSamples(); };
  const switchView = view => {
    $$('[data-panel]').forEach(panel=>panel.classList.toggle('active',panel.dataset.panel===view));
    $$('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
    $('#pageTitle').textContent = view==='overview'?'Обзор заявок':view==='samples'?'Запросы образцов':'Все заявки';
    $('#managerSidebar').classList.remove('open'); window.scrollTo({top:0,behavior:'smooth'});
  };
  const parseDraft = text => {
    if (text.length > 100000) throw new Error('Файл слишком большой для импорта.');
    const lines = text.replace(/^\uFEFF/,'').split(/\r?\n/);
    const get = label => { const line=lines.find(row=>row.toLowerCase().startsWith(label.toLowerCase()+':')); return line ? line.slice(label.length+1).trim() : ''; };
    const getSection = title => { const start=lines.findIndex(row=>row.trim().toUpperCase()===title); if(start<0)return ''; const out=[]; for(let i=start+1;i<lines.length && !/^(КОММЕНТАРИЙ|ПРИЛОЖЕНИЯ|ВАЖНО|ФАЙЛЫ)/i.test(lines[i].trim());i++)out.push(lines[i]); return out.join('\n').trim(); };
    const contact = {name:get('Имя'),company:get('Компания'),phone:get('Телефон'),email:get('Email'),city:get('Город / регион'),inn:get('ИНН')};
    if (!contact.name && !contact.phone && !contact.company) throw new Error('Не удалось распознать контакты. Выберите TXT-черновик из Центра заказов.');
    const typeRaw=get('Тип запроса');
    const type=typeRaw.includes('образц')?'sample':typeRaw.includes('изготов')?'custom':'quote';
    const itemLines=getSection('ПОЗИЦИИ ЗАПРОСА').split('\n'); const items=[]; let current=null;
    itemLines.forEach(line=>{const title=line.match(/^\s*\d+\.\s*(.+)$/); if(title){current={name:title[1].trim(),quantity:1,unit:'шт.',description:'',details:''};items.push(current);return;} if(!current)return; let m=line.match(/^\s*Количество:\s*(.+)$/i);if(m){const q=m[1].trim().match(/^([\d\s.,]+)/);if(q)current.quantity=q[1].replace(/\s/g,'');current.unit=m[1].trim().replace(/^[-\d\s.,]+/,'').trim()||'шт.';return;}m=line.match(/^\s*Описание:\s*(.+)$/i);if(m){current.description=m[1].trim();return;}m=line.match(/^\s*Параметры:\s*(.+)$/i);if(m)current.details=m[1].trim();});
    const commentIndex=lines.findIndex(row=>row.trim().toUpperCase()==='КОММЕНТАРИЙ'); const attachmentIndex=lines.findIndex(row=>row.trim().toUpperCase()==='ПРИЛОЖЕНИЯ');
    const comment=commentIndex>=0?lines.slice(commentIndex+1,attachmentIndex>=0?attachmentIndex:lines.length).join('\n').trim():'';
    const dateLine=get('Дата'); const parsedDate=dateLine?new Date(dateLine):new Date();
    return {id:`NR-IMP-${Date.now().toString().slice(-7)}`,date:Number.isNaN(parsedDate.getTime())?new Date().toISOString():parsedDate.toISOString(),type,status:'new',priority:'normal',client:contact,items,comment,note:'',demo:false,imported:true};
  };
  const importFile = async file => {
    if (!file) return;
    if (!/\.txt$/i.test(file.name) || file.size > 100000) { toast('Нужен TXT-черновик размером до 100 КБ.'); return; }
    try { const request=parseDraft(await file.text()); requests.unshift(request); render(); switchView('requests'); $('#requestSearch').value=request.id; renderTable(); openDetail(request.id); toast('Черновик импортирован в текущий сеанс.'); }
    catch(error){toast(error.message || 'Не удалось прочитать файл.');}
  };
  const csvCell = value => `"${String(value ?? '').replace(/"/g,'""')}"`;
  const exportCsv = () => {
    const rows=[['Номер','Дата','Тип','Статус','Приоритет','Источник','Компания','Контакт','Телефон','Email','Город','Позиции','Комментарий']];
    visibleRequests().forEach(r=>rows.push([r.id,fmtDateTime(r.date),TYPE[r.type],STATUS[r.status]?.label,r.priority==='high'?'Высокий':'Обычный',r.demo?'Демо-запись':'Импортированный черновик',r.client?.company,r.client?.name,r.client?.phone,r.client?.email,r.client?.city,(r.items||[]).map(i=>`${i.name} — ${i.quantity} ${i.unit}`).join('; '),r.comment]));
    const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='nr-manager-requests.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('CSV-файл подготовлен на вашем устройстве.');
  };
  document.addEventListener('click',event=>{
    const nav=event.target.closest('[data-view]');if(nav){switchView(nav.dataset.view);return;}
    const go=event.target.closest('[data-go-view]');if(go){switchView(go.dataset.goView);return;}
    const open=event.target.closest('[data-open-request]');if(open){openDetail(open.dataset.openRequest);return;}
    if(event.target.id==='detailBackdrop'||event.target.id==='detailClose'){closeDetail();return;}
    if(event.target.id==='saveRequestChanges'){
      const request=requests.find(r=>r.id===activeRequestId);if(!request)return;
      request.status=$('#detailStatus').value;request.priority=$('#detailPriority').value;request.note=$('#detailNote').value.trim();render();openDetail(request.id);toast('Изменения обновлены в текущем сеансе.');
    }
    if(event.target.id==='quickImport')$('#draftImport').click();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeDetail();if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-open-request]')){event.preventDefault();openDetail(event.target.dataset.openRequest);}});
  $('#draftImport').addEventListener('change',event=>{importFile(event.target.files?.[0]);event.target.value='';});
  $('#requestSearch').addEventListener('input',renderTable);$('#statusFilter').addEventListener('change',renderTable);$('#typeFilter').addEventListener('change',renderTable);$('#exportCsv').addEventListener('click',exportCsv);
  $('#sidebarToggle').addEventListener('click',()=>$('#managerSidebar').classList.toggle('open'));
  const now = new Date();
  $('#todayLabel').textContent=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(now);
  $('#weekdayLabel').textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long'}).format(now).toLocaleUpperCase('ru-RU');
  render();
})();
