(() => {
  const {gods,weapons,cards}=globalThis.GVG_DATA;
  const {Arena}=globalThis.GVG;
  const screen=document.querySelector('#screen');
  const dialog=document.querySelector('#overlay');
  const dialogTitle=document.querySelector('#dialog-title');
  const dialogBody=document.querySelector('#dialog-body');
  const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
  const btn=(text,cls,fn)=>{const node=el('button',cls,text);node.type='button';node.addEventListener('click',fn);return node;};
  const mod=(...nodes)=>{const node=el('div','dialog-content');node.append(...nodes);return node;};
  const avatar=(kind,i)=>`assets/${kind}/${String(i+1).padStart(2,'0')}.webp`;
  function image(src,cls){
    const node=el('img',cls);node.src=src;node.alt='';node.decoding='async';
    node.onerror=()=>{node.onerror=null;node.src='assets/emblem-web.png';};return node;
  }
  function open(title,node){dialogTitle.textContent=title;dialogBody.replaceChildren(node);if(!dialog.open)dialog.showModal();}
  function data(kind,i){
    const row=kind==='god'?gods[i]:kind==='weapon'?weapons[i]:cards[i];
    const src=kind==='card'?('assets/cards/'+i+'.webp'):avatar(kind,i);
    return {name:row[0],en:row[1],meta:kind==='god'?`HP ${row[2]}`:kind==='card'?`${row[2]} ใบในกอง`:'อาวุธ',desc:row[kind==='weapon'?2:3],src};
  }
  function detail(kind,i,fromCatalog=false){
    const item=data(kind,i);
    const body=el('div','detail'),text=el('div');
    text.append(el('h3','',item.en+' · '+item.meta),el('p','',item.desc));
    if(fromCatalog)text.append(btn('กลับไปคลังการ์ด','ghost',()=>collection(kind)));
    body.append(image(item.src,'detail-art'),text);open(item.name,mod(body));
  }
  function tile(kind,i,fn,selected,full=true){
    const item=data(kind,i);
    const button=btn('','pick',fn),body=el('div','pick-text');
    if(selected!==null)button.setAttribute('aria-pressed',String(selected));
    body.append(el('small','',item.en+' · '+item.meta),el('strong','',item.name));
    if(full)body.append(el('span','',item.desc));
    button.append(image(item.src),body);return button;
  }
  let arena,runner,current,timer,draftGod,draftWeapon;
  function home(){
    clearTimeout(timer);arena=null;runner=null;current=null;draftGod=null;draftWeapon=null;
    screen.replaceChildren(document.querySelector('#intro').content.cloneNode(true));
    document.querySelector('#start').onclick=()=>{
      arena=new Arena(Number(document.querySelector('#opponents').value)+1);draft('god');
    };
  }
  function draft(kind){
    const god=kind==='god', selected=god?draftGod:draftWeapon;
    const page=el('section','page'),title=el('div','page-title'),copy=el('div'),list=el('div','draft'),foot=el('div','draft-cta');
    copy.append(el('h1','',god?'เลือกเทพของคุณ':'เลือกอาวุธเริ่มต้น'),el('p','','เลือกหนึ่งใบจากสามใบที่สุ่มให้คุณ'));
    title.append(copy,el('span','step',god?'1 / 2':'2 / 2'));
    const options=god?arena.players[0].godOptions:arena.players[0].armOptions;
    for(const i of options)list.append(tile(kind,i,()=>{if(god)draftGod=i;else draftWeapon=i;draft(kind);},i===selected));
    foot.append(btn('ย้อนกลับ','ghost',()=>god?home():draft('god')));
    const next=btn(god?'เลือกอาวุธ':'เข้าสู่สนาม','primary',()=>{
      if(god){draft('weapon');return;}
      if(arena.choose(draftGod,draftWeapon)){runner=arena.game();advance();}
    });
    next.disabled=selected===null;foot.append(next);page.append(title,list,foot);screen.replaceChildren(page);
  }
  function bot(prompt){
    const best=Math.max(...prompt.choices.map(c=>c.weight));
    if(best<=0)return prompt.choices.at(-1).value;
    const options=prompt.choices.filter(c=>c.weight===best);
    return arena.pick(options).value;
  }
  function advance(value){
    clearTimeout(timer);
    const result=runner.next(value);
    current=result.done?null:result.value;
    renderArena();
    if(current&&current.player!==0)timer=setTimeout(()=>advance(bot(current)),100);
  }
  function chip(name,value){const node=el('span','chip');node.append(document.createTextNode(name+' '),el('strong','',value));return node;}
  function playerCard(p){
    const node=btn('',`player${p.i===arena.active?' active':''}${p.alive?'':' dead'}`,()=>detail('god',p.god));
    const body=el('div','player-data');
    const hp=el('p','hp',p.alive?`♥ ${p.hp} / ${p.max} HP`:'ออกจากการประลอง');
    body.append(el('h3','',gods[p.god][0]+(p.i===0?' · คุณ':'')),hp);
    if(p.alive){
      body.append(el('p','',`${weapons[p.weapon][0]} · มือ ${p.hand.length} + อาวุธ ${p.arms.length}`));
      const flags=[p.field?`ภัยพิบัติ ×${p.field}`:'',p.attackCurse?'คำสาปโจมตี':'',p.defenseCurse?'คำสาปป้องกัน':''].filter(Boolean);
      if(flags.length)body.append(el('div','flags',flags.join(' · ')));
    }
    node.append(image(avatar('god',p.god),'portrait'),body);return node;
  }
  function renderArena(){
    const page=el('section','page arena-page'),grid=el('div','arena-grid'),main=el('div','arena-main'),board=el('div','board'),meta=el('div','board-meta'),foes=el('div','players'),self=el('div','self');
    meta.append(chip('เทิร์น',String(arena.turn)),chip('กองปกติ',String(arena.deck.length)),chip('กองอาวุธ',String(arena.armDeck.length)),chip('กองทิ้ง',String(arena.discard.length)));
    foes.style.setProperty('--foes',arena.players.length-1);
    arena.players.slice(1).forEach(p=>foes.append(playerCard(p)));
    const human=arena.players[0];
    self.append(playerCard(human));board.append(meta,foes,self);
    const pane=el('section','prompt');pane.setAttribute('aria-label','การกระทำ');
    const choices=el('div','options');
    if(!current){
      const title=arena.winner===0?'คุณชนะการประลอง':arena.winner<0?'เสมอเมื่อครบจำนวนเทิร์น':`${arena.name(arena.players[arena.winner])} ชนะการประลอง`;
      pane.append(el('h2','',title));choices.append(btn('เล่นใหม่','primary',home));
    }else if(current.player===0){
      pane.append(el('h2','',current.title));
      for(const choice of current.choices){
        const ch=btn(choice.label,`choices${choice.value==='end'?' finish':''}`,()=>advance(choice.value));
        if(choice.note)ch.append(el('small','',choice.note));choices.append(ch);
      }
    }else{
      pane.append(el('h2','',`${arena.name(arena.players[current.player])} กำลังเลือก`),el('p','subtle',current.title.startsWith('มือของ')?'กำลังดูการ์ด': 'รอการตอบสนองจากคอมพิวเตอร์'));
    }
    pane.append(choices);
    const hand=el('section','hand'),handRow=el('div','hand-row');
    const add=(kind,id)=>{
      const item=data(kind,id);const node=btn('','hand-card',()=>detail(kind,id));
      node.append(image(item.src),el('span','',item.name));handRow.append(node);
    };
    human.hand.forEach(id=>add('card',id));human.arms.forEach(id=>add('weapon',id));
    if(!human.hand.length&&!human.arms.length)handRow.append(el('p','subtle','ไม่มีการ์ดบนมือ'));
    hand.append(el('h2','',`การ์ดบนมือ · ${human.hand.length+human.arms.length} ใบ`),handRow);
    const rail=el('aside','rail'),history=el('ul','history');
    arena.log.slice(0,30).forEach(v=>history.append(el('li','',v)));
    rail.append(el('h2','','บันทึกการประลอง'),history);
    if(human.weapon>=0)rail.append(btn('ดูอาวุธที่สวม','ghost',()=>detail('weapon',human.weapon)));
    if(arena.used&&arena.active===0){
      const u=arena.used;
      rail.append(el('p','note',`ใช้แล้วในเทิร์นนี้ · ${[u.attack?'โจมตี':'',u.skill?'สกิลการ์ด':'',u.field?'สนาม':'',u.sacrifice?'สังเวย':'',u.swap?'สลับอาวุธ':''].filter(Boolean).join(' / ')||'ยังไม่ได้ใช้'}`));
    }
    main.append(board,pane,hand);grid.append(main,rail);page.append(grid);screen.replaceChildren(page);
  }
  function collection(kind='god'){
    const tabs=el('div','tabs'),grid=el('div','catalog');
    for(const [key,label] of [['god','เทพ'],['weapon','อาวุธ'],['card','กองปกติ']]){
      const b=btn(label,'ghost',()=>collection(key));b.setAttribute('aria-pressed',String(key===kind));tabs.append(b);
    }
    const ids=kind==='card'?Object.keys(cards):Array.from({length:kind==='god'?gods.length:weapons.length},(_,i)=>i);
    ids.forEach(i=>grid.append(tile(kind,i,()=>detail(kind,i,true),null,false)));
    open('คลังการ์ด',mod(tabs,grid));
  }
  function rules(){
    const sections=[
      ['เริ่มเกม','เลือกเทพและอาวุธอย่างละ 1 จากตัวเลือกอย่างละ 3 ใบ ผู้เล่นแต่ละคนได้รับการ์ดปกติ 3 ใบ ผู้รอดคนสุดท้ายชนะ'],
      ['ต้นเทิร์น','จั่วปกติ 2 ใบ หรือจั่วอาวุธ 1 ใบเมื่อไม่มีอาวุธบนมือ หากเลือกกองอาวุธ การจั่วปกติในเทิร์นนั้นถูกข้าม'],
      ['การกระทำ','โจมตีได้ 1 ครั้ง การ์ดสกิล 1 ใบ การ์ดสนาม 1 ใบ และสลับอาวุธ 1 ครั้งต่อเทิร์น อาวุธที่ถอดกลับขึ้นมือ สังเวย 1 HP ได้ครั้งเดียวเพื่อโจมตีหรือจั่ว 2 ใบ'],
      ['ตอบโต้','Defense กันการโจมตี ส่วน Nullify ยกเลิกได้เฉพาะการ์ดสกิลขณะประกาศ สกิลเทพยกเลิกไม่ได้ การลด HP โดยตรงใช้ Defense กันไม่ได้'],
      ['ข้อยุติที่ใช้ในต้นแบบ','ห้ามสังเวยที่ 1 HP คำสาปโจมตีหมดท้ายเทิร์นถัดไปของเป้าหมาย คำสาปป้องกันมีผลกับการโจมตีที่ได้รับครั้งถัดไป สนามตรวจ Attack หรือ Defense ทีละชั้น การขโมยอาวุธแลกอาวุธที่สวมทั้งคู่โดยไม่ใช้โควตาสลับ'],
      ['HP และกองการ์ด','HP ไม่เกินค่าสูงสุด เอียร์และเพอร์เซโฟนีใช้เงื่อนไขช่วยที่ 0 ทันที กองปกติหมดให้สับกองทิ้งกลับ รอบโต๊ะของสกิลเริ่มใหม่เมื่อถึงเทิร์นของผู้ใช้']
    ];
    const list=el('div');for(const [title,desc] of sections)list.append(el('h3','',title),el('p','',desc));open('วิธีเล่น',mod(list));
  }
  document.querySelector('#home').onclick=()=>{if(!arena?.ready||!current||confirm('กลับหน้าแรกและจบการประลองนี้?'))home();};
  document.querySelector('#collection').onclick=()=>collection();
  document.querySelector('#rules').onclick=rules;
  home();
})();
