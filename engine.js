/* GOD VS GOD: the engine yields player choices. The UI and bots use the same rules. */
(() => {
const {gods,weapons,cards}=globalThis.GVG_DATA;
const option=(label,value,weight=1,note='')=>({label,value,weight,note});
const indices=(a,predicate)=>a.flatMap((v,i)=>predicate(v)?[i]:[]);
const sequence=n=>Array.from({length:n},(_,i)=>i);
const cardName=id=>cards[id]?.[0] || id;
class Arena {
  constructor(count=2,random=Math.random){
    this.random=random;
    this.turn=0;
    this.active=0;
    this.log=[];
    this.deck=this.shuffle(Object.entries(cards).flatMap(([id,c])=>Array(c[2]).fill(id)));
    this.discard=[];
    this.armDiscard=[];
    const godDraft=this.shuffle(sequence(gods.length));
    const armDraft=this.shuffle(sequence(weapons.length));
    this.players=sequence(count).map(i=>({
      i, godOptions:godDraft.slice(i*3,i*3+3), armOptions:armDraft.slice(i*3,i*3+3),
      god:-1, weapon:-1, hand:[], arms:[], hp:0, max:0, alive:true, field:0,
      attackCurse:false, defenseCurse:false, godUsed:false, revivalUsed:false,
      drawSource:'', cache:null
    }));
    this.weaponLocks=new Map();
    this.armDeck=armDraft;
    this.ready=false;
    this.winner=null;
  }
  shuffle(array){
    for(let i=array.length-1;i>0;i--){
      const j=Math.floor(this.random()*(i+1));
      [array[i],array[j]]=[array[j],array[i]];
    }
    return array;
  }
  name(p){ return p.god<0 ? (p.i===0?'คุณ':'คู่แข่ง '+p.i) : gods[p.god][0]; }
  event(text){ this.log.unshift(text); if(this.log.length>80)this.log.pop(); }
  pick(array){return array[Math.floor(this.random()*array.length)];}
  opponents(p){return this.players.filter(q=>q.alive&&q!==p);}
  live(){return this.players.filter(p=>p.alive);}
  ordered(){return this.players.slice(this.active).concat(this.players.slice(0,this.active));}
  choose(god,weapon){
    const human=this.players[0];
    if(this.ready||!human.godOptions.includes(god)||!human.armOptions.includes(weapon))return false;
    for(const p of this.players){
      p.god=p===human?god:this.pick(p.godOptions);
      p.weapon=p===human?weapon:this.pick(p.armOptions);
      p.hp=p.max=gods[p.god][2];
      p.hand=this.deck.splice(0,3);
    }
    this.armDeck=this.armDeck.filter(id=>!this.players.some(p=>p.weapon===id));
    this.ready=true;
    this.event('เริ่มการประลอง ทุกคนได้รับการ์ดปกติ 3 ใบ');
    return true;
  }
  *ask(p,title,choices){
    if(!choices.length)return null;
    return yield {player:p.i,title,choices};
  }
  *yes(p,title,weight=5){
    return yield* this.ask(p,title,[option('ใช้',true,weight),option('ผ่าน',false,1)]);
  }
  *target(p,title,targets=this.opponents(p)){
    const i=yield* this.ask(p,title,targets.map(q=>option(this.name(q),q.i,7-q.hp,`HP ${q.hp}/${q.max}`)).concat(option('ย้อนกลับ',null,0)));
    return i===null?null:this.players[i];
  }
  take(){if(!this.deck.length&&this.discard.length)this.deck=this.shuffle(this.discard.splice(0));return this.deck.shift();}
  put(p,index){const c=p.hand.splice(index,1)[0]; if(c)this.discard.push(c); return c;}
  spend(p,type,n=1){
    for(let i=0;i<n;i++){const index=p.hand.indexOf(type); if(index<0)return false; this.put(p,index);}
    return true;
  }
  count(p,type){return p.hand.filter(c=>c===type).length;}
  *cost(p,n,title='เลือกการ์ดปกติที่จะทิ้ง',exclude=[]){
    if(!n)return true;
    const selected=[];
    while(selected.length<n){
      const choices=indices(p.hand,(_,i)=>!selected.includes(i)&&!exclude.includes(i));
      if(!choices.length)return false;
      const index=yield* this.ask(p,title,choices.map(i=>option(cardName(p.hand[i]),i,p.hand[i]==='attack'||p.hand[i]==='defense'?2:4)).concat(option('ยกเลิก',null,0)));
      if(index===null)return false;
      selected.push(index);
    }
    selected.sort((a,b)=>b-a).forEach(i=>this.put(p,i));
    return true;
  }
  canDraw(p){return p.alive&&p.drawSource!=='weapon';}
  *draw(p,n){
    if(!this.canDraw(p))return false;
    p.drawSource='normal';
    const field=p.field;
    p.field=0;
    for(let i=0;i<field;i++){
      const c=this.take();
      if(!c)break;
      this.discard.push(c);
      this.event(`สนามของ ${this.name(p)} เปิด ${cardName(c)}`);
      if(c!=='attack'&&c!=='defense')yield* this.damage(p,1,null,'field');
      if(!p.alive||this.winner!==null)return false;
    }
    let count=0;
    for(let i=0;i<n;i++){const c=this.take();if(c){p.hand.push(c);count++;}}
    if(count)this.event(`${this.name(p)} จั่วการ์ดปกติ ${count} ใบ`);
    return count>0;
  }
  heal(p){if(p.hp>=p.max||!p.alive)return false; p.hp++;this.event(`${this.name(p)} ฟื้น 1 HP`);return true;}
  godReady(p,i){return p.alive&&p.god===i-1&&!p.godUsed;}
  armReady(p,i){return p.alive&&p.weapon===i-1&&!this.weaponLocks.has(p.weapon);}
  markArm(p){this.weaponLocks.set(p.weapon,p.i);}
  *damage(p,n,source,kind,depth=0){
    if(!p.alive||p.hp<=0)return false;
    const before=p.hp;
    p.hp=Math.max(0,p.hp-n);
    this.event(`${this.name(p)} เสีย ${before-p.hp} HP`);
    if(p.hp===0){
      for(const q of this.ordered()){
        if((q.hp<=0&&q!==p)||!q.alive)continue;
        if(this.godReady(q,11)&&q.hand.length>=2&&
          (yield* this.yes(q,`เอียร์: ช่วย ${this.name(p)} ที่ 0 HP หรือไม่`,q===p?9:0))&&
          (yield* this.cost(q,2))){
          q.godUsed=true;this.heal(p);break;
        }
        if(q===p&&p.god===27&&!p.revivalUsed){
          p.revivalUsed=true;
          if(p.hand.length>=3&&(yield* this.yes(p,'เพอร์เซโฟนี: ทิ้ง 3 ใบเพื่อกลับมาที่ 1 HP',9))&&
             (yield* this.cost(p,3))){this.heal(p);break;}
        }
      }
      if(p.hp===0){
        p.alive=false;
        this.discard.push(...p.hand.splice(0));
        this.armDiscard.push(...p.arms.splice(0));
        if(p.weapon!==-1){this.armDiscard.push(p.weapon);p.weapon=-1;}
        if(p.cache!==null){this.discard.push(p.cache);p.cache=null;}
        this.event(`${this.name(p)} ออกจากการประลอง`);
        if(this.live().length===1){this.winner=this.live()[0].i;return true;}
      }
    }
    if(p.hp===1&&before>1&&source&&source!==p&&this.godReady(p,27)&&this.canDraw(p)&&
       (yield* this.yes(p,'บาลเดอร์: จั่ว 1 ใบ'))){p.godUsed=true;yield* this.draw(p,1);}
    if(p.hp===1&&before>1&&this.armReady(p,19)&&this.canDraw(p)&&p.hand.length&&
       (yield* this.yes(p,'นาฬิกาทรายแห่งนอร์น: เปลี่ยนการ์ด 1 ใบ'))&&(yield* this.cost(p,1))){
      this.markArm(p);yield* this.draw(p,1);
    }
    if(kind==='divine'&&source&&source!==p&&depth===0&&this.godReady(p,30)&&p.hand.length>=2&&source.alive&&
       (yield* this.yes(p,`เนเมซิส: ตอบโต้ ${this.name(source)} ให้เสีย 1 HP`))&&(yield* this.cost(p,2))){
      p.godUsed=true;yield* this.damage(source,1,p,'divine',1);
    }
    if(kind==='divine'&&source&&source!==p&&this.armReady(p,18)&&this.canDraw(p)&&p.hand.length&&
       (yield* this.yes(p,'เขี้ยวเฟนริร์: เปลี่ยนการ์ด 1 ใบ'))&&(yield* this.cost(p,1))){
      this.markArm(p);yield* this.draw(p,1);
    }
    return true;
  }
  *announce(p,id){
    this.event(`${this.name(p)} ประกาศใช้ ${cardName(id)}`);
    for(const q of this.ordered()){
      if(q!==p&&this.godReady(q,26)&&this.count(q,'attack')>0&&p.alive&&this.winner===null&&
        (yield* this.yes(q,`ซุส: ทิ้ง Attack ให้ ${this.name(p)} เสีย 1 HP`,p.hp<=2?8:3))){
        this.spend(q,'attack');q.godUsed=true;
        yield* this.damage(p,1,q,'divine');break;
      }
    }
    return p.alive&&this.winner===null;
  }
  inspect(q){
    return [...q.hand.map(cardName),...q.arms.map(i=>weapons[i][0])].join(' · ')||'ไม่มีการ์ด';
  }
  *show(p,q){
    if(p.i===0)yield* this.ask(p,`มือของ ${this.name(q)} · ${this.inspect(q)}`,[option('รับทราบ',true)]);
  }
  *skillCard(p,id,q){
    this.spend(p,id);
    if(id==='disaster')this.used.field=true;else this.used.skill=true;
    if(!(yield* this.announce(p,id)))return;
    if(id!=='disaster'){
      for(const r of this.ordered()){
        if(r!==p&&r.alive&&this.count(r,'nullify')>0&&
          (yield* this.yes(r,`Nullify · ยกเลิก ${cardName(id)} ของ ${this.name(p)}`,q===r&&id!=='healing'?7:0))){
          this.spend(r,'nullify');
          if(yield* this.announce(r,'nullify')){this.event(`${cardName(id)} ถูกยกเลิก`);return;}
          if(this.winner!==null)return;
        }
      }
    }
    const echo=q&&q!==p&&this.armReady(q,17)&&q.hand.length&&id!=='disaster'&&
      !!(yield* this.yes(q,'เกลปเนียร์: จ่ายการ์ด 1 ใบเพื่อเตรียมลงโทษผู้ใช้สกิล'))&&
      !!(yield* this.cost(q,1));
    if(echo)this.markArm(q);
    switch(id){
      case 'attackCurse':q.attackCurse=true;break;
      case 'defenseCurse':q.defenseCurse=true;break;
      case 'supply':yield* this.draw(p,2);break;
      case 'healing':
        if(this.heal(q)&&p!==q){
          if(this.godReady(p,15)&&this.canDraw(p)&&(yield* this.yes(p,'บริดจิด: จั่ว 1 หลังฮีลผู้อื่น'))){p.godUsed=true;yield* this.draw(p,1);}
          if(this.armReady(p,12)&&p.hp<p.max&&p.hand.length&&(yield* this.yes(p,'จอกแห่งดีมีเทอร์: ฟื้นตน 1 HP'))&&(yield* this.cost(p,1))){this.markArm(p);this.heal(p);}
        }
        break;
      case 'eye': yield* this.show(p,q); break;
      case 'theft': {
        const choices=q.hand.map((c,i)=>option(cardName(c),i,4));
        if(p.weapon>=0&&q.weapon>=0)choices.push(option(`แลกกับ ${weapons[q.weapon][0]}`,'weapon',3));
        if(choices.length){
          const result=yield* this.ask(p,`Divine Theft · มือของ ${this.name(q)}`,choices);
          if(result==='weapon'){
            [p.weapon,q.weapon]=[q.weapon,p.weapon];this.event(`${this.name(p)} และ ${this.name(q)} แลกอาวุธที่สวม`);
          }else{p.hand.push(q.hand.splice(result,1)[0]);this.event(`${this.name(p)} ขโมยการ์ดปกติ 1 ใบ`);}
        }
        break;
      }
      case 'disaster':q.field++;this.event(`ภัยพิบัติของ ${this.name(q)} สะสม ${q.field} ชั้น`);break;
    }
    if(echo&&q.alive&&p.alive&&p.hand.length)this.put(p,Math.floor(this.random()*p.hand.length));
    if(!q||q===p||!q.alive||id==='disaster'||!this.canDraw(q))return;
    if(this.godReady(q,29)&&q.hand.length&&(yield* this.yes(q,'ฟริกก์: ทิ้ง 1 ใบเพื่อจั่ว 2 ใบ'))&&(yield* this.cost(q,1))){
      q.godUsed=true;yield* this.draw(q,2);
    }
    if(this.armReady(q,9)&&q.hand.length&&(yield* this.yes(q,'ผ้าคลุมแห่งนิกซ์: เปลี่ยนการ์ด 1 ใบ'))&&(yield* this.cost(q,1))){
      this.markArm(q);yield* this.draw(q,1);
    }
  }
  *discardRandomType(q,type){
    if(!q.hand.length)return;
    const i=Math.floor(this.random()*q.hand.length);
    const card=q.hand[i];
    this.event(`${this.name(q)} เปิด ${cardName(card)}`);
    if(type(card))this.put(q,i);
  }
  *attack(p,q,method){
    const n=p.attackCurse?2:1;
    let converted=null;
    if(method==='hermes'){
      const selectable=p.hand.flatMap((c,i)=>c!=='attack'?[option(cardName(c),i)]:[]);
      selectable.push(...p.arms.map((id,i)=>option(weapons[id][0],`w${i}`)));
      converted=yield* this.ask(p,'เฮอร์มีส · เลือกการ์ดที่จะแปลง',selectable.concat(option('ย้อนกลับ',null,0)));
      if(converted===null)return;
    }
    const bonus=[];
    const qualifies=[
      [this.godReady(p,3), 'เดิมพันสงครามของอาเรส', 'ares'],
      [this.godReady(p,5)&&p.hp>q.hp, 'ล่าผู้บาดเจ็บของอาร์เทมิส', 'artemis'],
      [this.armReady(p,1), 'คาลิเบิร์น', 'caliburn'],
      [this.armReady(p,3)&&p.hp<q.hp, 'ขวานแห่งสกาดี', 'axe']
    ];
    let attackCost=method==='sacrifice'?0:n;
    if(method==='hermes'){
      if(typeof converted==='string')this.armDiscard.push(p.arms.splice(+converted.slice(1),1)[0]);
      else this.put(p,converted);
      attackCost--;
      p.godUsed=true;
    }
    if(attackCost)this.spend(p,'attack',attackCost);
    for(const [ok,label,key] of qualifies){
      if(ok&&this.canDraw(p)&&p.hand.length&&(yield* this.yes(p,`${label} · ทิ้ง 1 ใบก่อนโจมตี`,3))&&(yield* this.cost(p,1))){
        bonus.push(key);
        if(key==='ares'||key==='artemis')p.godUsed=true;else this.markArm(p);
      }
    }
    this.used.attack=true;
    if(method!=='sacrifice')p.attackCurse=false;
    if(method==='sacrifice'){
      this.used.sacrifice=true;
      yield* this.damage(p,1,null,'sacrifice');
      if(!p.alive||this.winner!==null)return;
      this.event(`${this.name(p)} สังเวยเพื่อโจมตี ${this.name(q)}`);
    }else if(!(yield* this.announce(p,'attack')))return;
    const defenseNeeded=q.defenseCurse?2:1;
    q.defenseCurse=false;
    let defender=null;
    if(this.count(q,'defense')>=defenseNeeded&&(yield* this.yes(q,`ใช้ Defense ${defenseNeeded} ใบ ป้องกันการโจมตีของ ${this.name(p)} หรือไม่`,8))){
      this.spend(q,'defense',defenseNeeded);
      if(yield* this.announce(q,'defense'))defender=q;
    }
    if(this.winner!==null||!p.alive||!q.alive)return;
    if(!defender){
      for(const r of this.ordered()){
        if(r===q||r===p||!r.alive||this.count(r,'defense')<defenseNeeded)continue;
        const god=this.godReady(r,8);
        if((god||this.armReady(r,7))&&(yield* this.yes(r,`จ่าย Defense ${defenseNeeded} ใบเพื่อป้องกันแทน ${this.name(q)}`,0))){
          this.spend(r,'defense',defenseNeeded);
          if(god)r.godUsed=true;else this.markArm(r);
          defender=r;break;
        }
      }
    }
    if(defender){
      this.event(`การโจมตี ${this.name(q)} ถูกป้องกัน`);
      yield* this.afterDefense(defender,p,q);
      if(!p.alive||!q.alive||this.winner!==null)return;
      if(this.godReady(p,4)&&p.hand.length&&(yield* this.yes(p,'ธอร์: ทิ้ง 1 ใบเพื่อลด HP โดยตรง'))&&(yield* this.cost(p,1))){
        p.godUsed=true;yield* this.damage(q,1,p,'divine');
      }
      if(this.armReady(p,5)&&this.canDraw(p)&&p.hand.length&&(yield* this.yes(p,'มโยลเนียร์: เปลี่ยนการ์ด 1 ใบ'))&&(yield* this.cost(p,1))){
        this.markArm(p);yield* this.draw(p,1);
      }
      return;
    }
    const hit=yield* this.damage(q,1,p,'attack');
    if(!hit||this.winner!==null||!p.alive)return;
    if(this.godReady(p,2)&&this.canDraw(p)){p.godUsed=true;yield* this.draw(p,2);}
    if(this.canDraw(p))for(const key of bonus){yield* this.draw(p,1);if(key==='ares'&&q.alive&&q.hand.length)this.put(q,Math.floor(this.random()*q.hand.length));}
    if(this.armReady(p,2)&&q.alive&&q.hand.length&&(yield* this.yes(p,'กุงเนียร์: เปิดสุ่มการ์ดของเป้าหมาย'))){this.markArm(p);yield* this.discardRandomType(q,c=>c==='attack');}
    if(method==='sacrifice'&&this.armReady(p,20)&&p.hp<p.max&&p.hand.length&&(yield* this.yes(p,'ตราแห่งเฟรย์: จ่าย 1 ใบเพื่อฟื้น 1 HP'))&&(yield* this.cost(p,1))){this.markArm(p);this.heal(p);}
  }
  *afterDefense(p,attacker,target){
    const god=p.god+1;
    if([6,9,10].includes(god)&&this.godReady(p,god)){
      if(god===6&&this.canDraw(p)&&(yield* this.yes(p,'เอเธนา: จั่ว 1 หลังป้องกัน'))){p.godUsed=true;yield* this.draw(p,1);}
      if(god===9&&attacker.hand.length&&(yield* this.yes(p,'เฮล: เปิดการ์ดผู้โจมตีแบบสุ่ม'))){p.godUsed=true;yield* this.discardRandomType(attacker,c=>c==='attack');}
      if(god===10&&p===target&&p.hand.length&&p.cache===null&&(yield* this.yes(p,'สกาดี: พักการ์ดเพื่อจั่วในเทิร์นหน้า'))){
        const i=yield* this.ask(p,'เลือกการ์ดที่จะพัก',p.hand.map((c,i)=>option(cardName(c),i)));
        p.cache=p.hand.splice(i,1)[0];p.godUsed=true;
      }
    }
    if(this.armReady(p,6)&&this.canDraw(p)&&p.hand.length&&(yield* this.yes(p,'เอจิส: เปลี่ยนการ์ด 1 ใบ'))&&(yield* this.cost(p,1))){this.markArm(p);yield* this.draw(p,1);}
    if(this.armReady(p,8)&&attacker.hand.length&&(yield* this.yes(p,'เกราะหนามแห่งเฮล: เปิดการ์ดผู้โจมตี'))){this.markArm(p);yield* this.discardRandomType(attacker,c=>!['attack','defense','disaster'].includes(c));}
    if(p===target&&this.armReady(p,10)&&this.canDraw(p)&&p.hand.length<=1&&(yield* this.yes(p,'กระจกแห่งเซเลเน: จั่ว 1 ใบ'))){this.markArm(p);yield* this.draw(p,1);}
  }
  *swap(p){
    const i=yield* this.ask(p,'เลือกอาวุธบนมือที่จะสวม',p.arms.map((id,i)=>option(weapons[id][0],i,3)).concat(option('ย้อนกลับ',null,0)));
    if(i===null)return;
    const next=p.arms.splice(i,1)[0];
    if(p.weapon>=0)p.arms.push(p.weapon);
    p.weapon=next;this.used.swap=true;
    this.event(`${this.name(p)} สวม ${weapons[next][0]}`);
    if(this.godReady(p,7)&&this.opponents(p).length&&(yield* this.yes(p,'ไฮม์ดัลล์: ดูมือผู้เล่นอื่น'))){
      const q=yield* this.target(p,'เลือกผู้เล่นที่จะดูมือ');if(q){p.godUsed=true;yield* this.show(p,q);}
    }
    if(this.godReady(p,17)&&this.canDraw(p)&&p.hand.length&&(yield* this.yes(p,'ไอริส: เปลี่ยนการ์ดปกติ 1 ใบ'))&&(yield* this.cost(p,1))){p.godUsed=true;yield* this.draw(p,1);}
    if(this.godReady(p,23)&&p.hp<p.max&&p.hand.length&&(yield* this.yes(p,'เฮเฟสตัส: จ่าย 1 ใบเพื่อฟื้นตนเอง'))&&(yield* this.cost(p,1))){p.godUsed=true;this.heal(p);}
    if(this.armReady(p,13)&&p.hand.length){
      const q=yield* this.target(p,'ตะเกียงแห่งบริดจิด · เลือกผู้เล่นที่จะฟื้น HP',this.live().filter(q=>q.hp<q.max));
      if(q&&(yield* this.cost(p,1))){this.markArm(p);this.heal(q);}
    }
    if(this.armReady(p,16)&&p.hand.length){
      const q=yield* this.target(p,'ดราวป์เนียร์ · เลือกผู้เล่นที่จะดูมือ');
      if(q&&(yield* this.cost(p,1))){this.markArm(p);yield* this.show(p,q);}
    }
  }
  godAction(p){
    if(p.godUsed)return false;
    const can=this.canDraw(p), wounded=this.live().some(q=>q.hp<q.max);
    return ({
      11:p.hand.length>=2&&wounded,12:this.count(p,'supply')+p.hand.filter(c=>!['attack','defense','supply','disaster'].includes(c)).length>0&&this.opponents(p).some(q=>q.hp<q.max),13:p.hand.length>=2&&p.hp<p.max&&this.opponents(p).some(q=>q.hp<q.max),14:p.hp===1&&p.hand.length>0,
      16:p.hand.length>0&&this.opponents(p).some(q=>q.hand.length>0),18:this.armDeck.length>0,19:p.hand.length>0&&this.opponents(p).length>0,20:can&&this.opponents(p).some(q=>q.hand.length>0),21:can&&p.hand.length>=2,24:this.count(p,'defense')>0&&this.discard.includes('attack'),25:this.deck.length>0
    })[p.god+1]||false;
  }
  *god(p){
    const g=p.god+1;
    if([11,12,13,14].includes(g)){
      const q=g===14?p:yield* this.target(p,'เลือกผู้เล่นที่จะฟื้น HP',this.live().filter(q=>q.hp<q.max&&(g===11||q!==p)));
      if(!q)return;
      if(g===12){
        const i=yield* this.ask(p,'เลือกการ์ดสกิลที่จะทิ้ง',indices(p.hand,c=>!['attack','defense','disaster'].includes(c)).map(i=>option(cardName(p.hand[i]),i)).concat(option('ย้อนกลับ',null,0)));
        if(i===null)return;this.put(p,i);
      }else if(!(yield* this.cost(p,g===14?1:2)))return;
      p.godUsed=true;this.heal(q);if(g===13)this.heal(p);return;
    }
    if(g===18){
      const choices=this.armDeck.slice(0,2);
      const id=yield* this.ask(p,'ฟอร์เซติ · เลือกอาวุธที่จะอยู่ใบบนสุด',choices.map(i=>option(weapons[i][0],i)).concat(option('ย้อนกลับ',null,0)));
      if(id===null)return;
      if(id!==this.armDeck[0])[this.armDeck[0],this.armDeck[1]]=[this.armDeck[1],this.armDeck[0]];
      p.godUsed=true;return;
    }
    if(g===21){if(yield* this.cost(p,2)){p.godUsed=true;yield* this.draw(p,2);}return;}
    if(g===24){this.spend(p,'defense');p.hand.push(this.discard.splice(this.discard.indexOf('attack'),1)[0]);p.godUsed=true;return;}
    if(g===25){
      const c=this.take();p.godUsed=true;
      if(c){this.event(`ฟอร์ทูนาเปิด ${cardName(c)}`);if(['attack','defense'].includes(c))p.hand.push(c);else this.discard.push(c);}return;
    }
    const targets=this.opponents(p).filter(q=>g===19||q.hand.length);
    const q=yield* this.target(p,'เลือกเป้าหมายของสกิลเทพ',targets);
    if(!q)return;
    if(g===16&&(yield* this.cost(p,1))){
      p.hand.push(q.hand.splice(Math.floor(this.random()*q.hand.length),1)[0]);p.godUsed=true;
    }
    if(g===19){
      const id=yield* this.ask(p,'ทีร์ · เลือกประเภทการ์ด', [option('โจมตี','attack'),option('ป้องกัน','defense'),option('ย้อนกลับ',null,0)]);
      if(!id||!(yield* this.cost(p,1)))return;
      yield* this.show(p,q);this.spend(q,id);p.godUsed=true;
    }
    if(g===20){
      const id=yield* this.ask(p,'มอร์ริแกน · ทายประเภทการ์ด',Object.keys(cards).map(c=>option(cardName(c),c,c==='attack'?4:2)).concat(option('ย้อนกลับ',null,0)));
      if(!id)return;
      const c=this.pick(q.hand);this.event(`มอร์ริแกนเปิด ${cardName(c)}`);p.godUsed=true;
      if(c===id)yield* this.draw(p,1);
    }
  }
  armAction(p){
    const w=p.weapon+1;
    if(!this.armReady(p,w))return false;
    return ({
      4:!this.used.attack&&!this.used.bow&&this.opponents(p).length>0,
      11:p.hand.length>=2&&this.live().some(q=>q.hp<q.max),
      14:this.armDeck.length>0,15:p.hand.length>=2&&this.canDraw(p),
      17:p.hand.length>0&&this.opponents(p).some(q=>q.arms.length)
    })[w]||false;
  }
  *arm(p){
    const w=p.weapon+1;
    if(w===4){
      const q=yield* this.target(p,'ธนูแห่งอาร์เทมิส · เลือกเป้าหมาย');
      if(!q)return;
      this.markArm(p);this.used.bow=true;this.used.bowTarget=q.i;yield* this.show(p,q);
    }
    if(w===11){
      const q=yield* this.target(p,'คทาแอสคลีเพียส · เลือกผู้เล่นที่จะฟื้น HP',this.live().filter(q=>q.hp<q.max));
      if(q&&(yield* this.cost(p,2))){this.markArm(p);this.heal(q);}
    }
    if(w===14){
      const bottom=yield* this.ask(p,`ลูกแก้วแห่งฟอร์เซติ · ${weapons[this.armDeck[0]][0]}`,[option('ไว้บนสุด',false),option('ย้ายไปล่างสุด',true),option('ย้อนกลับ',null,0)]);
      if(bottom===null)return;
      if(bottom)this.armDeck.push(this.armDeck.shift());this.markArm(p);
    }
    if(w===15&&(yield* this.cost(p,2))){this.markArm(p);yield* this.draw(p,2);}
    if(w===17){
      const q=yield* this.target(p,'เกลปเนียร์ · เลือกผู้เล่นที่มีอาวุธบนมือ',this.opponents(p).filter(q=>q.arms.length));
      if(q&&(yield* this.cost(p,1))){
        const i=yield* this.ask(q,'เลือกอาวุธบนมือที่จะคืนบนสุดของกอง',q.arms.map((id,i)=>option(weapons[id][0],i)));
        this.armDeck.unshift(q.arms.splice(i,1)[0]);this.markArm(p);
      }
    }
  }
  actions(p){
    const moves=[];
    if(!this.used.attack&&(this.used.bowTarget===null||this.players[this.used.bowTarget].alive)){
      const n=p.attackCurse?2:1;
      if(this.count(p,'attack')>=n)moves.push(option('โจมตี','attack',10));
      if(this.godReady(p,1)&&this.count(p,'attack')>=n-1&&(p.hand.some(c=>c!=='attack')||p.arms.length))moves.push(option('แปลงการ์ดโจมตี','hermes',9));
      if(!this.used.sacrifice&&p.hp>=2)moves.push(option('สังเวยเพื่อโจมตี','sacrifice',p.hp>=3?4:2));
    }
    if(!this.used.sacrifice&&p.hp>=2&&this.canDraw(p))moves.push(option('สังเวยเพื่อจั่ว 2 ใบ','sdraw',p.hp>=3&&p.hand.length<4?5:1));
    if(!this.used.swap&&p.arms.length)moves.push(option('สลับอาวุธ','swap',3));
    if(this.godAction(p))moves.push(option('ใช้สกิลเทพ','god',p.god===17?2:6));
    if(this.armAction(p))moves.push(option('ใช้ความสามารถอาวุธ','arm',3));
    for(const id of new Set(p.hand)){
      if(this.used.skill||['attack','defense','nullify','disaster'].includes(id))continue;
      if(id==='healing'&&!this.live().some(q=>q.hp<q.max))continue;
      if(id==='supply'&&!this.canDraw(p))continue;
      moves.push(option(cardName(id),`card:${id}`,id==='healing'?(p.hp<p.max?9:1):id==='supply'?7:4));
    }
    if(!this.used.field&&p.hand.includes('disaster'))moves.push(option(cardName('disaster'),'card:disaster',7));
    moves.push(option('จบเทิร์น','end',2));
    return moves;
  }
  *game(){
    while(this.winner===null&&this.turn<300){
      const p=this.players[this.active];
      if(p.alive){
        this.turn++;
        this.used={attack:false,skill:false,field:false,sacrifice:false,swap:false,bow:false,bowTarget:null};
        for(const q of this.players)q.drawSource='';
        p.godUsed=false;
        for(const [id,owner] of this.weaponLocks)if(owner===p.i)this.weaponLocks.delete(id);
        this.event(`เทิร์น ${this.turn} · ${this.name(p)}`);
        const draw=[option('กองปกติ · 2 ใบ','normal',9)];
        if(this.armDeck.length&&!p.arms.length)draw.push(option('กองอาวุธ · 1 ใบ','weapon',this.turn%7===0?10:5));
        const source=yield* this.ask(p,'ต้นเทิร์น · เลือกกองจั่ว',draw);
        if(source==='weapon'){p.drawSource='weapon';p.arms.push(this.armDeck.shift());this.event(`${this.name(p)} จั่วอาวุธ 1 ใบ`);}
        else yield* this.draw(p,2);
        if(p.alive&&this.winner===null&&p.cache!==null){
          p.hand.push(p.cache);p.cache=null;if(this.canDraw(p))yield* this.draw(p,1);
        }
        while(p.alive&&this.winner===null){
          const act=yield* this.ask(p,'เทิร์นของ '+this.name(p),this.actions(p));
          if(act==='end')break;
          if(['attack','hermes','sacrifice'].includes(act)){
            const q=yield* this.target(p,'เลือกเป้าหมายโจมตี',this.opponents(p).filter(q=>this.used.bowTarget===null||q.i===this.used.bowTarget));
            if(q)yield* this.attack(p,q,act);
          }else if(act==='sdraw'){
            this.used.sacrifice=true;
            yield* this.damage(p,1,null,'sacrifice');
            if(p.alive&&this.winner===null)yield* this.draw(p,2);
            if(this.godReady(p,22)&&this.canDraw(p)&&(yield* this.yes(p,'เฟรย์: จั่วเพิ่ม 1 ใบ'))){p.godUsed=true;yield* this.draw(p,1);}
          }else if(act==='god')yield* this.god(p);
          else if(act==='arm')yield* this.arm(p);
          else if(act==='swap')yield* this.swap(p);
          else if(act.startsWith('card:')){
            const id=act.slice(5);
            const target=id==='supply'?p:yield* this.target(p,'เลือกเป้าหมาย · '+cardName(id),id==='healing'?this.live().filter(q=>q.hp<q.max):this.opponents(p));
            if(target)yield* this.skillCard(p,id,target);
          }
        }
        p.attackCurse=false;
      }
      if(this.winner===null)this.active=(this.active+1)%this.players.length;
    }
    if(this.winner===null)this.winner=-1;
  }
}
globalThis.GVG={Arena,option};
})();
