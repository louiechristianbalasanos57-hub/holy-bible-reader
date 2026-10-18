/* Holy Bible reader. Full KJV corpus is fetched once and persisted in IndexedDB for offline reading. */
const DATA_URLS=[
 'https://raw.githubusercontent.com/midvash/bible-data/main/versions/en/kjv/kjv.json',
 'https://raw.githubusercontent.com/aruljohn/Bible-kjv/master/kjv.json'
];
const $=id=>document.getElementById(id);

const CANONICAL_BOOKS = [
"Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi",
"Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"];
const BOOK_ALIASES = {
"gen":"Genesis","ge":"Genesis","gn":"Genesis","exo":"Exodus","ex":"Exodus","lev":"Leviticus","lv":"Leviticus","num":"Numbers","nu":"Numbers","deut":"Deuteronomy","dt":"Deuteronomy",
"ps":"Psalms","psalm":"Psalms","psalms":"Psalms","prov":"Proverbs","pr":"Proverbs","song":"Song of Solomon","song of songs":"Song of Solomon","canticles":"Song of Solomon",
"mt":"Matthew","matt":"Matthew","mk":"Mark","mr":"Mark","lk":"Luke","lu":"Luke","jn":"John","jhn":"John","acts":"Acts","rom":"Romans","1 cor":"1 Corinthians","2 cor":"2 Corinthians",
"1 thess":"1 Thessalonians","2 thess":"2 Thessalonians","1 tim":"1 Timothy","2 tim":"2 Timothy","phlm":"Philemon","philem":"Philemon","rev":"Revelation","re":"Revelation"
};
function fullBookName(name,index){
 const original=String(name||'').trim();
 const key=original.toLowerCase().replace(/\./g,'').replace(/\s+/g,' ');
 const alias=BOOK_ALIASES[key];
 if(alias)return alias;
 const exact=CANONICAL_BOOKS.find(n=>n.toLowerCase()===key);
 if(exact)return exact;
 // Match abbreviated names from common KJV JSON datasets, including "Gen", "Phlm", "1 Cor".
 const normalized=key.replace(/[^a-z0-9]/g,'');
 const found=CANONICAL_BOOKS.find(n=>n.toLowerCase().replace(/[^a-z0-9]/g,'')===normalized);
 return found || CANONICAL_BOOKS[index] || original;
}

const state={books:[],bookIndex:0,chapter:1,font:1.15,bible:null,bookmarks:[],currentVerses:[]};
const DB_NAME='holy-bible-db', DB_STORE='cache';
const bookSelect=$('bookSelect'), chapterSelect=$('chapterSelect'), reader=$('reader');
function openDB(){return new Promise((resolve,reject)=>{if(!('indexedDB'in window))return resolve(null);const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>req.result.createObjectStore(DB_STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function dbGet(key){try{const db=await openDB();if(!db)return null;return await new Promise((res,rej)=>{const r=db.transaction(DB_STORE).objectStore(DB_STORE).get(key);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)})}catch{return null}}
async function dbSet(key,value){try{const db=await openDB();if(!db)return;await new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(value,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}catch(e){console.warn('Cache unavailable',e)}}
function normalize(raw){
 if(!raw)throw Error('Empty Bible data');
 let list=raw.books||raw;
 if(!Array.isArray(list))throw Error('Bible data format was not recognized');
 const books=list.map((b,i)=>{
  const name=fullBookName(b.name||b.book||b.title,i);
  let ch=b.chapters||{};
  let chapters=[];
  if(Array.isArray(ch)){chapters=ch.map((c,j)=>normalizeVerses(c.verses||c));}
  else {chapters=Object.keys(ch).sort((a,b)=>Number(a)-Number(b)).map(k=>normalizeVerses(ch[k].verses||ch[k]));}
  return {name, testament:(b.testament||b.testament_name|| (i<39?'OT':'NT')).toUpperCase().includes('NEW')?'NT':((b.testament||'').toUpperCase()==='NT'?'NT':(i<39?'OT':'NT')), chapters};
 }).filter(b=>b.name&&b.chapters.length);
 if(books.length<66)throw Error('Only '+books.length+' books received; expected all 66.');
 return books;
}
function normalizeVerses(v){
 if(Array.isArray(v))return v.map((x,i)=>typeof x==='string'?x:(x.text||x.verse||''));
 if(v&&typeof v==='object')return Object.keys(v).sort((a,b)=>Number(a)-Number(b)).map(k=>typeof v[k]==='string'?v[k]:(v[k].text||''));
 return [];
}
async function loadBible(){
 $('status').textContent='Checking saved Bible data…';
 const cached=await dbGet('kjv');
 if(cached){try{state.books=normalize(cached);$('status').textContent='Bible text loaded from this device. Offline reading is ready.';initReader();return}catch(e){console.warn(e)}}
 let lastError;
 for(const url of DATA_URLS){try{$('status').textContent='Downloading complete KJV text… keep this tab open.';
  const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);const raw=await r.json();
  const books=normalize(raw);state.books=books;await dbSet('kjv',raw);$('status').textContent='Complete KJV loaded and saved for offline reading.';initReader();return;
 }catch(e){lastError=e;console.warn(url,e)}}
 $('status').textContent='Could not download the Bible text. Check your internet connection and reload.';
 reader.innerHTML='<div class="error"><b>Bible data could not load.</b><p>This version loads the complete public-domain KJV text on first launch, then saves it locally. Connect to the internet and reload this page. If using GitHub Pages, wait for deployment to finish.</p><p>Technical detail: '+escapeHTML(lastError?.message||'network error')+'</p></div>';
}
function initReader(){
 bookSelect.innerHTML='';renderBookOptions();bookSelect.disabled=false;$('testament').disabled=false;chapterSelect.disabled=false;
 const saved=localStorage.getItem('holyBibleLocation');if(saved){try{const x=JSON.parse(saved);const i=state.books.findIndex(b=>b.name===x.book);if(i>=0){state.bookIndex=i;state.chapter=x.chapter||1}}catch{}}
 loadBookmarks();renderBookOptions();renderChapters();renderChapter();renderDaily();
 if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
function renderBookOptions(){const filter=$('testament').value;bookSelect.innerHTML='';state.books.forEach((b,i)=>{if(filter!=='all'&&b.testament!==filter)return;const o=document.createElement('option');o.value=i;o.textContent=(b.testament==='OT'?'OT · ':'NT · ')+b.name;bookSelect.append(o)});if(!bookSelect.options.length)return;const current=[...bookSelect.options].some(o=>Number(o.value)===state.bookIndex);if(!current)state.bookIndex=Number(bookSelect.options[0].value);bookSelect.value=String(state.bookIndex)}
function renderChapters(){const b=state.books[state.bookIndex];chapterSelect.innerHTML='';if(!b)return;b.chapters.forEach((_,i)=>{const o=document.createElement('option');o.value=i+1;o.textContent='Chapter '+(i+1);chapterSelect.append(o)});state.chapter=Math.min(Math.max(1,state.chapter),b.chapters.length);chapterSelect.value=String(state.chapter)}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderChapter(){const b=state.books[state.bookIndex];if(!b)return;const verses=b.chapters[state.chapter-1]||[];state.currentVerses=verses;
 localStorage.setItem('holyBibleLocation',JSON.stringify({book:b.name,chapter:state.chapter}));
 reader.innerHTML=`<div class="sectionhead"><div><h2>${escapeHTML(b.name)} ${state.chapter}</h2><p class="subhead">${b.testament==='OT'?'Old Testament':'New Testament'} · ${verses.length} verses · KJV</p></div><span class="pill">${state.bookIndex+1}/66 books</span></div><div id="verseList"></div>`;
 const list=$('verseList');verses.forEach((text,i)=>{const row=document.createElement('div');row.className='verse';row.id='v'+(i+1);row.innerHTML=`<span class="vnum">${i+1}</span><span class="vtext">${escapeHTML(cleanText(text))}</span><span class="verseActions"><button data-action="bookmark" data-verse="${i+1}" title="Bookmark verse">☆</button><button data-action="speak" data-verse="${i+1}" title="Read verse aloud">🔊</button></span>`;list.append(row)});
 list.addEventListener('click',e=>{const btn=e.target.closest('button[data-action]');if(!btn)return;const n=Number(btn.dataset.verse);if(btn.dataset.action==='bookmark')addBookmark(ref(b.name,state.chapter,n),verses[n-1]);else speak(`${b.name} chapter ${state.chapter} verse ${n}. ${cleanText(verses[n-1])}`)});
 $('prevBtn').disabled=state.bookIndex===0&&state.chapter===1;$('nextBtn').disabled=state.bookIndex===65&&state.chapter===state.books[65].chapters.length;
}
function cleanText(s){return String(s).replace(/\[[^\]]*\]/g,m=>m.slice(1,-1)).replace(/[{}]/g,'')}
function ref(book,ch,v){return `${book} ${ch}:${v}`}
function navigateRef(bookName,ch){const i=state.books.findIndex(b=>b.name.toLowerCase()===bookName.toLowerCase());if(i<0)return;state.bookIndex=i;state.chapter=ch;renderBookOptions();renderChapters();renderChapter();reader.scrollIntoView({behavior:'smooth',block:'start'})}
function next(){const b=state.books[state.bookIndex];if(state.chapter<b.chapters.length)state.chapter++;else if(state.bookIndex<65){state.bookIndex++;state.chapter=1}renderBookOptions();renderChapters();renderChapter()}
function prev(){if(state.chapter>1)state.chapter--;else if(state.bookIndex>0){state.bookIndex--;state.chapter=state.books[state.bookIndex].chapters.length}renderBookOptions();renderChapters();renderChapter()}
function speak(text){if(!('speechSynthesis'in window)){alert('Audio reading is not supported by this browser.');return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=.9;speechSynthesis.speak(u)}
function loadBookmarks(){try{state.bookmarks=JSON.parse(localStorage.getItem('holyBibleBookmarks')||'[]')}catch{state.bookmarks=[]}renderBookmarks()}
function saveBookmarks(){localStorage.setItem('holyBibleBookmarks',JSON.stringify(state.bookmarks));renderBookmarks()}
function addBookmark(reference,text){if(state.bookmarks.some(b=>b.reference===reference)){alert('This verse is already bookmarked.');return}state.bookmarks.unshift({reference,text});saveBookmarks()}
function renderBookmarks(){const host=$('bookmarkList');if(!host)return;if(!state.bookmarks.length){host.innerHTML='<p class="muted">Saved verses will appear here.</p>';return}host.innerHTML='';state.bookmarks.forEach((b,i)=>{const d=document.createElement('div');d.className='bookmark-item';d.innerHTML=`<b>${escapeHTML(b.reference)}</b><p>${escapeHTML(cleanText(b.text))}</p><button data-open="${escapeHTML(b.reference)}">Open</button><button data-remove="${i}">Remove</button>`;host.append(d)});host.onclick=e=>{const o=e.target.closest('[data-open]');const r=e.target.closest('[data-remove]');if(o){const m=o.dataset.open.match(/^(.*?)\s+(\d+):(\d+)$/);if(m){navigateRef(m[1],Number(m[2]));setTimeout(()=>document.getElementById('v'+m[3])?.scrollIntoView({behavior:'smooth'}),100)}}if(r){state.bookmarks.splice(Number(r.dataset.remove),1);saveBookmarks()}}}
function renderDaily(){if(!state.books.length)return;const seed=new Date().getDate()+new Date().getMonth()*31;const b=state.books[(seed*7)%state.books.length];const ch=(seed*3)%b.chapters.length;const v=(seed*11)%b.chapters[ch].length;state.daily={reference:ref(b.name,ch+1,v+1),text:b.chapters[ch][v]};$('dailyVerse').textContent=state.daily.reference+' — '+cleanText(state.daily.text)}
function doSearch(){const q=$('searchInput').value.trim();if(!q)return;const host=$('resultsList');host.innerHTML='';$('searchResults').classList.remove('hidden');let count=0;const reference=q.match(/^(.+?)\s+(\d+):(\d+)$/);if(reference){const b=state.books.find(x=>x.name.toLowerCase()===reference[1].toLowerCase());if(b&&b.chapters[+reference[2]-1]?.[+reference[3]-1]){addResult(b,+reference[2],+reference[3],b.chapters[+reference[2]-1][+reference[3]-1]);count++}}
 else {const terms=q.toLowerCase().split(/\s+/);for(const b of state.books){for(let ci=0;ci<b.chapters.length;ci++){const vs=b.chapters[ci];for(let vi=0;vi<vs.length;vi++){const t=cleanText(vs[vi]);if(terms.every(term=>t.toLowerCase().includes(term))){addResult(b,ci+1,vi+1,vs[vi]);if(++count>=250)break}}if(count>=250)break}if(count>=250)break}}
 if(!count)host.innerHTML='<p class="muted">No matches found. Try fewer words or a reference like John 3:16.</p>';else{const p=document.createElement('p');p.className='muted';p.textContent=`Showing ${count}${count===250?'+':''} result(s).`;host.prepend(p)}}
function addResult(b,ch,v,text){const d=document.createElement('div');d.className='result-item';d.innerHTML=`<b>${escapeHTML(ref(b.name,ch,v))}</b><p>${escapeHTML(cleanText(text))}</p><button data-ref="${escapeHTML(ref(b.name,ch,v))}">Open verse</button><button data-save="${escapeHTML(ref(b.name,ch,v))}">☆ Save</button>`;$('resultsList').append(d)}
$('resultsList').addEventListener('click',e=>{const o=e.target.closest('[data-ref]'),s=e.target.closest('[data-save]');if(o){const m=o.dataset.ref.match(/^(.*?)\s+(\d+):(\d+)$/);navigateRef(m[1],+m[2]);setTimeout(()=>document.getElementById('v'+m[3])?.scrollIntoView({behavior:'smooth'}),100)}if(s){const m=s.dataset.save.match(/^(.*?)\s+(\d+):(\d+)$/);const b=state.books.find(x=>x.name===m[1]);addBookmark(s.dataset.save,b.chapters[+m[2]-1][+m[3]-1])}});
bookSelect.addEventListener('change',()=>{state.bookIndex=+bookSelect.value;state.chapter=1;renderChapters();renderChapter()});
chapterSelect.addEventListener('change',()=>{state.chapter=+chapterSelect.value;renderChapter()});
$('testament').addEventListener('change',renderBookOptions);
$('prevBtn').addEventListener('click',prev);$('nextBtn').addEventListener('click',next);
$('searchBtn').addEventListener('click',doSearch);$('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')doSearch()});
$('closeResults').addEventListener('click',()=>$('searchResults').classList.add('hidden'));
$('fontUp').addEventListener('click',()=>{state.font=Math.min(1.8,state.font+.1);document.querySelectorAll('.vtext').forEach(e=>e.style.fontSize=state.font+'rem')});
$('fontDown').addEventListener('click',()=>{state.font=Math.max(.85,state.font-.1);document.querySelectorAll('.vtext').forEach(e=>e.style.fontSize=state.font+'rem')});
$('readBtn').addEventListener('click',()=>{const b=state.books[state.bookIndex];speak(`${b.name} chapter ${state.chapter}. `+state.currentVerses.map((v,i)=>`Verse ${i+1}. ${cleanText(v)}`).join(' '))});
$('stopBtn').addEventListener('click',()=>speechSynthesis?.cancel());
$('themeBtn').addEventListener('click',()=>{document.body.classList.toggle('dark');localStorage.setItem('holyBibleDark',document.body.classList.contains('dark'))});
$('clearBookmarks').addEventListener('click',()=>{if(confirm('Clear all saved bookmarks?')){state.bookmarks=[];saveBookmarks()}});
$('dailyBtn').addEventListener('click',()=>{const b=state.books[Math.floor(Math.random()*state.books.length)];const ch=Math.floor(Math.random()*b.chapters.length),v=Math.floor(Math.random()*b.chapters[ch].length);state.daily={reference:ref(b.name,ch+1,v+1),text:b.chapters[ch][v]};$('dailyVerse').textContent=state.daily.reference+' — '+cleanText(state.daily.text)});
$('saveDaily').addEventListener('click',()=>state.daily&&addBookmark(state.daily.reference,state.daily.text));
if(localStorage.getItem('holyBibleDark')==='true')document.body.classList.add('dark');
loadBible();