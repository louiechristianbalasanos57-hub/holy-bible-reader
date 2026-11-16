/* Holy Bible reader. Full KJV corpus is fetched once and persisted in IndexedDB for offline reading. */
// Supabase authentication configuration
const SUPABASE_URL = 'https://giwnjovmhudciswelkwx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_BNGJARWU3EifJ02dCcfGwg_9Q2v5n4v';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let authMode = 'login';
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
 const normalized=key.replace(/[^a-z0-9]/g,'');
 const found=CANONICAL_BOOKS.find(n=>n.toLowerCase().replace(/[^a-z0-9]/g,'')===normalized);
 return found || CANONICAL_BOOKS[index] || original;
}

const state={books:[],bookIndex:0,chapter:1,font:1.15,bible:null,bookmarks:[],currentVerses:[],userId:null,highlights:[]};
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
 loadBookmarks();renderBookOptions();renderChapters();renderChapter();renderDaily();fillTestamentCard('oldBook','oldChapter','OT');fillTestamentCard('newBook','newChapter','NT');renderTestamentBookGrids();
 if('serviceWorker'in navigator && location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
function renderBookOptions(){const filter=$('testament').value;bookSelect.innerHTML='';state.books.forEach((b,i)=>{if(filter!=='all'&&b.testament!==filter)return;const o=document.createElement('option');o.value=i;o.textContent=(b.testament==='OT'?'OT · ':'NT · ')+b.name;bookSelect.append(o)});if(!bookSelect.options.length)return;const current=[...bookSelect.options].some(o=>Number(o.value)===state.bookIndex);if(!current)state.bookIndex=Number(bookSelect.options[0].value);bookSelect.value=String(state.bookIndex)}
function renderChapters(){const b=state.books[state.bookIndex];chapterSelect.innerHTML='';if(!b)return;b.chapters.forEach((_,i)=>{const o=document.createElement('option');o.value=i+1;o.textContent='Chapter '+(i+1);chapterSelect.append(o)});state.chapter=Math.min(Math.max(1,state.chapter),b.chapters.length);chapterSelect.value=String(state.chapter)}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderChapter(){const b=state.books[state.bookIndex];if(!b)return;const verses=b.chapters[state.chapter-1]||[];state.currentVerses=verses;state.highlights=[];
 localStorage.setItem('holyBibleLocation',JSON.stringify({book:b.name,chapter:state.chapter}));
 reader.innerHTML=`<div class="sectionhead"><div><h2>${escapeHTML(b.name)} ${state.chapter}</h2><p class="subhead">${b.testament==='OT'?'Old Testament':'New Testament'} · ${verses.length} verses · KJV</p></div><span class="pill">${state.bookIndex+1}/66 books</span></div><div id="verseList"></div>`;
 const list=$('verseList');verses.forEach((text,i)=>{const row=document.createElement('div');row.className='verse';row.id='v'+(i+1);row.innerHTML=`<span class="vnum">${i+1}</span><span class="vtext">${escapeHTML(cleanText(text))}</span><span class="verseActions"><button data-action="bookmark" data-verse="${i+1}" title="Bookmark verse">☆</button><button data-action="speak" data-verse="${i+1}" title="Read verse aloud">🔊</button></span>`;list.append(row)});
 list.addEventListener('click',e=>{
  const mark=e.target.closest('mark[data-highlight-id]');
  if(mark){e.preventDefault();removeBibleHighlight(mark.dataset.highlightId);return;}
  const btn=e.target.closest('button[data-action]');if(!btn)return;const n=Number(btn.dataset.verse);if(btn.dataset.action==='bookmark')addBookmark(ref(b.name,state.chapter,n),verses[n-1]);else speak(`${b.name} chapter ${state.chapter} verse ${n}. ${cleanText(verses[n-1])}`)
 });
 $('prevBtn').disabled=state.bookIndex===0&&state.chapter===1;$('nextBtn').disabled=state.bookIndex===65&&state.chapter===state.books[65].chapters.length;
 loadAndApplyBibleHighlights(b.name,state.chapter);
}
function cleanText(s){return String(s).replace(/\[[^\]]*\]/g,m=>m.slice(1,-1)).replace(/[{}]/g,'')}
function ref(book,ch,v){return `${book} ${ch}:${v}`}
// USER-SPECIFIC WORD / PHRASE HIGHLIGHTS
// Highlights are stored in Supabase so they follow the signed-in account.

let highlightToolbar=null;
let pendingHighlightSelection=null;

function ensureHighlightToolbar(){
 if(highlightToolbar)return highlightToolbar;
 highlightToolbar=document.createElement('div');
 highlightToolbar.id='highlightToolbar';
 highlightToolbar.className='highlight-toolbar hidden';
 highlightToolbar.innerHTML='<span>Selected text</span><button type="button" id="applyTextHighlight">✦ Highlight</button>';
 document.body.appendChild(highlightToolbar);
 highlightToolbar.addEventListener('mousedown',event=>event.preventDefault());
 highlightToolbar.querySelector('#applyTextHighlight').addEventListener('click',saveSelectedBibleHighlight);
 return highlightToolbar;
}

function getBibleSelection(){
 const selection=window.getSelection();
 if(!selection||selection.isCollapsed||!selection.rangeCount)return null;
 const range=selection.getRangeAt(0);
 const startElement=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement;
 const endElement=range.endContainer.nodeType===Node.ELEMENT_NODE?range.endContainer:range.endContainer.parentElement;
 const startVerse=startElement?.closest?.('.vtext');
 const endVerse=endElement?.closest?.('.vtext');
 if(!startVerse||startVerse!==endVerse)return null;
 const verseRow=startVerse.closest('.verse');
 if(!verseRow||!reader.contains(verseRow))return null;
 const selectedText=range.toString();
 if(!selectedText.trim())return null;
 const prefix=document.createRange();
 prefix.selectNodeContents(startVerse);
 try{prefix.setEnd(range.startContainer,range.startOffset)}catch{return null;}
 const startOffset=prefix.toString().length;
 const endOffset=startOffset+selectedText.length;
 return {book:state.books[state.bookIndex]?.name,chapter:state.chapter,verse:Number(verseRow.id.slice(1)),startOffset,endOffset,selectedText};
}

function updateHighlightButton(){
 const button=$('addHighlightBtn');
 const status=$('highlightSelectionStatus');
 if(!button)return;
 const details=getBibleSelection();
 button.disabled=!details;
 if(status)status.textContent=details
  ? (state.userId?'Ready to highlight: “'+details.selectedText+'”':'Log in to save your selected highlight.')
  : 'Select a word or phrase in a verse, then click Highlight.';
}

function showHighlightToolbar(){
 const toolbar=ensureHighlightToolbar();
 const details=getBibleSelection();
 updateHighlightButton();
 if(!details||!state.userId){toolbar.classList.add('hidden');pendingHighlightSelection=null;return;}
 pendingHighlightSelection=details;
 toolbar.classList.remove('hidden');
 const range=window.getSelection().getRangeAt(0);
 const rect=range.getBoundingClientRect();
 const left=Math.min(Math.max(12,rect.left+(rect.width/2)-toolbar.offsetWidth/2),window.innerWidth-toolbar.offsetWidth-12);
 toolbar.style.left=`${left}px`;
 toolbar.style.top=`${Math.max(12,rect.top-48)}px`;
}

function hideHighlightToolbar(){
 if(highlightToolbar)highlightToolbar.classList.add('hidden');
 pendingHighlightSelection=null;
}

document.addEventListener('mouseup',event=>{
 if(event.target.closest?.('#highlightToolbar'))return;
 window.setTimeout(showHighlightToolbar,0);
});
document.addEventListener('keyup',event=>{
 if(['Shift','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))showHighlightToolbar();
});
document.addEventListener('mousedown',event=>{
 if(!event.target.closest?.('#highlightToolbar')&&!event.target.closest?.('.vtext'))hideHighlightToolbar();
});
document.addEventListener('touchend',()=>window.setTimeout(showHighlightToolbar,80),{passive:true});

// Persistent reader-controls button: select any word/phrase, then press this button.
$('addHighlightBtn')?.addEventListener('click',()=>{
 const details=getBibleSelection();
 if(!details){alert('Please select a word or phrase inside a Bible verse first.');updateHighlightButton();return;}
 pendingHighlightSelection=details;
 saveSelectedBibleHighlight();
});

function renderHighlightedVerse(text,highlights){
 const valid=(highlights||[]).filter(h=>Number.isInteger(h.start_offset)&&Number.isInteger(h.end_offset)&&h.start_offset>=0&&h.end_offset>h.start_offset&&h.end_offset<=text.length).sort((a,b)=>a.start_offset-b.start_offset);
 let html='',cursor=0;
 for(const h of valid){
  if(h.start_offset<cursor)continue;
  html+=escapeHTML(text.slice(cursor,h.start_offset));
  html+=`<mark class="bible-highlight" data-highlight-id="${escapeHTML(String(h.id))}" title="Click to remove this highlight">${escapeHTML(text.slice(h.start_offset,h.end_offset))}</mark>`;
  cursor=h.end_offset;
 }
 return html+escapeHTML(text.slice(cursor));
}

async function loadAndApplyBibleHighlights(book,chapter){
 const userId=state.userId;
 if(!userId){state.highlights=[];return;}
 const bookIndex=state.bookIndex;
 const {data,error}=await supabaseClient.from('bible_highlights')
  .select('id,book,chapter,verse,translation_id,start_offset,end_offset,selected_text,color')
  .eq('user_id',userId).eq('book',book).eq('chapter',chapter)
  .eq('translation_id',activeTranslationId)
  .order('start_offset',{ascending:true});
 if(error){console.warn('Could not load Bible highlights:',error.message);return;}
 if(state.userId!==userId||state.bookIndex!==bookIndex||state.chapter!==chapter||state.books[state.bookIndex]?.name!==book)return;
 state.highlights=data||[];
 state.highlights.forEach(h=>{
  const verseText=cleanText(state.currentVerses[h.verse-1]||'');
  const host=document.querySelector(`#v${h.verse} .vtext`);
  if(host)host.innerHTML=renderHighlightedVerse(verseText,state.highlights.filter(x=>x.verse===h.verse));
 });
}

async function saveSelectedBibleHighlight(){
 const h=pendingHighlightSelection;
 if(!h||!state.userId){alert('Please log in to save your highlights.');hideHighlightToolbar();return;}
 const overlaps=state.highlights.some(existing=>existing.verse===h.verse&&h.startOffset<existing.end_offset&&h.endOffset>existing.start_offset);
 if(overlaps){alert('This text already contains a highlight. Remove the existing highlight first if you want to change it.');return;}
 const button=highlightToolbar.querySelector('#applyTextHighlight');
 button.disabled=true;button.textContent='Saving…';
 const {data,error}=await supabaseClient.from('bible_highlights').insert({
  user_id:state.userId,book:h.book,chapter:h.chapter,verse:h.verse,
  translation_id:activeTranslationId,start_offset:h.startOffset,end_offset:h.endOffset,selected_text:h.selectedText,color:'yellow'
 }).select('id,book,chapter,verse,translation_id,start_offset,end_offset,selected_text,color').single();
 button.disabled=false;button.textContent='✦ Highlight';
 if(error){console.error('Highlight save failed:',error);alert(error.message.includes('bible_highlights')?'Please create the bible_highlights table in Supabase first.':`Could not save highlight: ${error.message}`);return;}
 if(state.bookIndex>=0&&state.books[state.bookIndex]?.name===h.book&&state.chapter===h.chapter){
  state.highlights.push(data);
  const verseText=cleanText(state.currentVerses[h.verse-1]||'');
  const host=document.querySelector(`#v${h.verse} .vtext`);
  if(host)host.innerHTML=renderHighlightedVerse(verseText,state.highlights.filter(x=>x.verse===h.verse));
 }
 window.getSelection()?.removeAllRanges();hideHighlightToolbar();updateHighlightButton();
}

async function removeBibleHighlight(id){
 if(!state.userId)return;
 if(!confirm('Remove this highlight?'))return;
 const {error}=await supabaseClient.from('bible_highlights').delete().eq('id',id).eq('user_id',state.userId);
 if(error){alert(`Could not remove highlight: ${error.message}`);return;}
 const mark=document.querySelector(`mark[data-highlight-id="${CSS.escape(String(id))}"]`);
 const targetVerse=Number(mark?.closest('.verse')?.id?.slice(1));
 state.highlights=state.highlights.filter(h=>String(h.id)!==String(id));
 if(targetVerse){const host=document.querySelector(`#v${targetVerse} .vtext`);if(host)host.innerHTML=renderHighlightedVerse(cleanText(state.currentVerses[targetVerse-1]||''),state.highlights.filter(h=>h.verse===targetVerse));}
 updateHighlightButton();
}

function navigateRef(bookName,ch){const i=state.books.findIndex(b=>b.name.toLowerCase()===bookName.toLowerCase());if(i<0)return;openSelectedBook(i,ch)}
function next(){const b=state.books[state.bookIndex];if(state.chapter<b.chapters.length)state.chapter++;else if(state.bookIndex<65){state.bookIndex++;state.chapter=1}renderBookOptions();renderChapters();renderChapter()}
function prev(){if(state.chapter>1)state.chapter--;else if(state.bookIndex>0){state.bookIndex--;state.chapter=state.books[state.bookIndex].chapters.length}renderBookOptions();renderChapters();renderChapter()}
function speak(text){if(!('speechSynthesis'in window)){alert('Audio reading is not supported by this browser.');return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=.9;speechSynthesis.speak(u)}

function loadBookmarks(){try{state.bookmarks=JSON.parse(localStorage.getItem('holyBibleBookmarks')||'[]')}catch{state.bookmarks=[]}renderBookmarks()}
function saveBookmarks(){localStorage.setItem('holyBibleBookmarks',JSON.stringify(state.bookmarks));renderBookmarks()}
function addBookmark(reference,text){if(state.bookmarks.some(b=>b.reference===reference)){alert('This verse is already bookmarked.');return}state.bookmarks.unshift({reference,text});saveBookmarks()}
function renderBookmarks(){const host=$('bookmarkList');if(!host)return;if(!state.bookmarks.length){host.innerHTML='<p class="muted">Saved verses will appear here.</p>';return}host.innerHTML='';state.bookmarks.forEach((b,i)=>{const d=document.createElement('div');d.className='bookmark-item';d.innerHTML=`<b>${escapeHTML(b.reference)}</b><p>${escapeHTML(cleanText(b.text))}</p><button data-open="${escapeHTML(b.reference)}">Open</button><button data-remove="${i}">Remove</button>`;host.append(d)});host.onclick=e=>{const o=e.target.closest('[data-open]');const r=e.target.closest('[data-remove]');if(o){const m=o.dataset.open.match(/^(.*?)\s+(\d+):(\d+)$/);if(m){navigateRef(m[1],Number(m[2]));setTimeout(()=>document.getElementById('v'+m[3])?.scrollIntoView({behavior:'smooth'}),100)}}if(r){state.bookmarks.splice(Number(r.dataset.remove),1);saveBookmarks()}}}

function renderDaily(){
 if(!state.books.length)return;
 const seed=new Date().getDate()+new Date().getMonth()*31;
 const b=state.books[(seed*7)%state.books.length];
 const ch=(seed*3)%b.chapters.length;
 const v=(seed*11)%b.chapters[ch].length;
 state.daily={reference:ref(b.name,ch+1,v+1),text:b.chapters[ch][v]};
 $('dailyVerse').textContent=state.daily.reference+' — '+cleanText(state.daily.text);
}

function parseBibleReference(query){
 const q=query.trim().replace(/\s+/g,' ');
 const m=q.match(/^(.+?)\s+(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/i);
 if(!m)return null;
 const typed=m[1].toLowerCase().replace(/\./g,'').trim();
 const aliases={"gen":"Genesis","ge":"Genesis","gn":"Genesis","exo":"Exodus","ex":"Exodus","lev":"Leviticus","num":"Numbers","deut":"Deuteronomy","ps":"Psalms","psalm":"Psalms","psalms":"Psalms","prov":"Proverbs","matt":"Matthew","mt":"Matthew","mk":"Mark","lk":"Luke","jn":"John","jhn":"John","rom":"Romans","1 cor":"1 Corinthians","2 cor":"2 Corinthians","1 thess":"1 Thessalonians","2 thess":"2 Thessalonians","1 tim":"1 Timothy","2 tim":"2 Timothy","phlm":"Philemon","philem":"Philemon","rev":"Revelation"};
 const bookName=aliases[typed]||state.books.find(b=>b.name.toLowerCase()===typed)?.name;
 if(!bookName)return {invalid:true};
 const book=state.books.find(b=>b.name.toLowerCase()===bookName.toLowerCase());
 if(!book)return {invalid:true};
 const ch=Number(m[2]),v=Number(m[3]),vEnd=Number(m[4]||m[3]);
 if(ch<1||ch>book.chapters.length||v<1||vEnd<v||vEnd>(book.chapters[ch-1]||[]).length)return {invalid:true};
 return {book,chapter:ch,verse:v,verseEnd:vEnd};
}
function normalizeSearchText(value){
 return cleanText(String(value||""))
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^\p{L}\p{N}\s:]/gu," ")
  .replace(/\s+/g," ").trim();
}

let searchTimer = null;
let activeSearchTestament = 'all';
// SUPABASE LOGIN AND SIGN UP
// ===============================

const authSection = $('authSection');
const authForm = $('authForm');
const authMessage = $('authMessage');
const authSwitch = $('authSwitch');
const togglePassword = $('togglePassword');
const authPassword = $('authPassword');
const passwordEye = $('passwordEye');

togglePassword.addEventListener('click', () => {
  const isHidden = authPassword.type === 'password';
  authPassword.type = isHidden ? 'text' : 'password';
  passwordEye.textContent = isHidden ? '🙈' : '👁';

  togglePassword.setAttribute(
    'aria-label',
    isHidden ? 'Hide password' : 'Show password'
  );
});

function showAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.style.color = isError ? '#c0392b' : 'var(--green)';
}

function clearRenderedBibleHighlights() {
  document.querySelectorAll('#verseList .verse').forEach((row, index) => {
    const host = row.querySelector('.vtext');
    if (host) host.textContent = cleanText(state.currentVerses[index] || '');
  });
}

function updateAuthScreen(session) {
  const signedIn = !!session;

  // Show navigation only after successful login.
  document.body.classList.toggle('auth-logged-in', signedIn);

  const previousUserId = state.userId;
  state.userId = session?.user?.id || null;

  if (previousUserId !== state.userId) {
    state.highlights = [];
    clearRenderedBibleHighlights();
    hideHighlightToolbar();

    if (signedIn && state.books.length) {
      const currentBook = state.books[state.bookIndex]?.name;
      if (currentBook) loadAndApplyBibleHighlights(currentBook, state.chapter);
    }
  }

  // Hide Bible content until the user is signed in.
  document.querySelectorAll('main > :not(#authSection)').forEach(element => {
    element.classList.toggle('hidden', !signedIn);
  });

  authSection.classList.toggle('hidden', signedIn);

  let logoutButton = $('logoutButton');

  if (signedIn) {
    if (!logoutButton) {
      logoutButton = document.createElement('button');
      logoutButton.id = 'logoutButton';
      logoutButton.textContent = 'Log Out';
      logoutButton.style.marginLeft = '10px';
      $('themeBtn').insertAdjacentElement('beforebegin', logoutButton);

      logoutButton.addEventListener('click', async () => {
        const { error } = await supabaseClient.auth.signOut();

        if (error) {
          alert(error.message);
        }
      });
    }

    logoutButton.classList.remove('hidden');
  } else if (logoutButton) {
    logoutButton.classList.add('hidden');
  }
}

function switchAuthMode() {
  authMode = authMode === 'login' ? 'signup' : 'login';

  $('authTitle').textContent =
    authMode === 'login' ? 'Welcome Back' : 'Create Your Account';

  $('authDescription').textContent =
    authMode === 'login'
      ? 'Sign in to your Holy Bible account.'
      : 'Register to access your Holy Bible account.';

  $('authSubmit').textContent =
    authMode === 'login' ? 'Log In' : 'Create Account';

  $('authSwitchText').textContent =
    authMode === 'login'
      ? "Don't have an account?"
      : 'Already have an account?';

  authSwitch.textContent =
    authMode === 'login' ? 'Sign Up' : 'Log In';

  showAuthMessage('');
}

authSwitch.addEventListener('click', switchAuthMode);

authForm.addEventListener('submit', async event => {
  event.preventDefault();

  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;

  $('authSubmit').disabled = true;
  showAuthMessage('Please wait...');

  try {
    if (authMode === 'signup') {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) throw error;

      if (data.session) {
        showAuthMessage('Account created successfully!');
      } else {
        showAuthMessage(
          'Account created! Please check your email and confirm your account before logging in.'
        );
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      showAuthMessage('Login successful!');
    }
  } catch (error) {
    showAuthMessage(error.message || 'Authentication failed.', true);
  } finally {
    $('authSubmit').disabled = false;
  }
});

$('googleLogin').addEventListener('click', async () => {
  showAuthMessage('Connecting to Google...');

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) {
    showAuthMessage(
      'Google Login is not configured yet: ' + error.message,
      true
    );
  }
});

async function initializeAuthentication() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    showAuthMessage(error.message, true);
    updateAuthScreen(null);
    return;
  }

  updateAuthScreen(data.session);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    updateAuthScreen(session);
  });
}

initializeAuthentication();

// ============================================
// UNIFIED LANGUAGE AND BIBLE TRANSLATION SYSTEM
// ============================================

const TRANSLATION_API = 'https://bible.helloao.org/api';
const UI_TRANSLATION_API = 'https://api.mymemory.translated.net/get';

const languageSelect = $('languageSelect');
const translationVersionSelect = $('translationVersionSelect');
const translationStatus = $('translationStatus');

let availableTranslations = [];
let activeTranslationId = 'LOCAL_KJV';
let activeTranslationName = 'King James Version (KJV)';
let currentInterfaceLanguage = 'fil';
let interfaceTranslationRun = 0;

// Bible API language codes
const TRANSLATION_LANGUAGES = {
  waray: ['war', 'waray'],
  fil: ['tgl', 'fil'],
  en: ['eng'],
  es: ['spa'],
  fr: ['fra', 'fre'],
  de: ['deu', 'ger'],
  pt: ['por'],
  it: ['ita'],
  zh: ['zho', 'chi'],
  ja: ['jpn'],
  ko: ['kor'],
  ar: ['ara'],
  id: ['ind'],
  hi: ['hin'],
  ru: ['rus'],
  th: ['tha'],
  vi: ['vie'],
  ms: ['msa', 'may'],
  nl: ['nld', 'dut'],
  el: ['ell', 'gre'],
  he: ['heb'],
  tr: ['tur'],
  sw: ['swa'],
  ur: ['urd'],
  bn: ['ben'],
  pl: ['pol']
};

// MyMemory language codes for interface translation
const UI_LANGUAGE_CODES = {
  waray: 'war',
  fil: 'tl',
  en: 'en',
  es: 'es',
  fr: 'fr',
  de: 'de',
  pt: 'pt',
  it: 'it',
  zh: 'zh-CN',
  ja: 'ja',
  ko: 'ko',
  ar: 'ar',
  id: 'id',
  hi: 'hi',
  ru: 'ru',
  th: 'th',
  vi: 'vi',
  ms: 'ms',
  nl: 'nl',
  el: 'el',
  he: 'he',
  tr: 'tr',
  sw: 'sw',
  ur: 'ur',
  bn: 'bn',
  pl: 'pl'
};

const UI_LANGUAGE_NAMES = {
  waray: 'Waray-Waray',
  fil: 'Filipino / Tagalog',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  id: 'Indonesian',
  hi: 'Hindi',
  ru: 'Russian',
  th: 'Thai',
  vi: 'Vietnamese',
  ms: 'Malay',
  nl: 'Dutch',
  el: 'Greek',
  he: 'Hebrew',
  tr: 'Turkish',
  sw: 'Swahili',
  ur: 'Urdu',
  bn: 'Bengali',
  pl: 'Polish'
};

function translationMessage(message) {
  if (translationStatus) {
    translationStatus.textContent = message;
  }
}
// ============================================
// INTERFACE TRANSLATION
// ============================================

const uiOriginalText = new WeakMap();
const uiTrackedText = new Set();
const uiOriginalAttributes = new WeakMap();
const uiTrackedElements = new Set();

const UI_SKIP_SELECTOR = [
  'script',
  'style',
  'noscript',
  'svg',
  'code',
  'pre',
  '.vtext',
  '.result-item p',
  '.bookmark-item p',
  '#dailyVerse'
].join(',');

function getUiCache(language) {
  try {
    return JSON.parse(
      localStorage.getItem('holyBibleUi_' + language) || '{}'
    );
  } catch {
    return {};
  }
}

function saveUiCache(language, cache) {
  try {
    localStorage.setItem(
      'holyBibleUi_' + language,
      JSON.stringify(cache)
    );
  } catch (error) {
    console.warn('UI translation cache unavailable:', error);
  }
}

function getUiUsage(language) {
  const today = new Date().toISOString().slice(0, 10);

  try {
    const saved = JSON.parse(
      localStorage.getItem('holyBibleUiUsage_' + language) || '{}'
    );

    if (saved.date !== today) {
      return { date: today, characters: 0 };
    }

    return saved;
  } catch {
    return { date: today, characters: 0 };
  }
}

const WARAY_UI_DICTIONARY = {
  'Holy Bible': 'Baraan nga Biblia',
  'READ · SEARCH · REFLECT': 'BASA · PAMILING · PAMALANDONG',
  'YOUR DAILY SCRIPTURE': 'IMO ADLAW-ADLAW NGA KASURATAN',
  'Find wisdom.': 'Bilnga an kinaadman.',
  'Discover faith.': 'Hibaroi an pagtoo.',
  'Grow in His Word.': 'Tubo ha Iya Pulong.',
  'App Language': 'Yinaknan han Aplikasyon',
  'Choose the language for the entire Holy Bible app.': 'Pilia an yinaknan para ha bug-os nga aplikasyon han Baraan nga Biblia.',
  'Select Language': 'Pilia an Yinaknan',
  'EXPLORE THE SCRIPTURES': 'USISAHA AN KASURATAN',
  'Choose Your Testament': 'Pilia an Imo Testamento',
  'Old Testament': 'Daan nga Testamento',
  'New Testament': 'Bag-o nga Testamento',
  'Select Book': 'Pilia an Libro',
  'Chapter': 'Kapitulo',
  'Search': 'Pamiling',
  'Search Results': 'Mga Resulta han Pamiling',
  'Close': 'Isara',
  'YOUR READING SPACE': 'IMO LUGAR PARA HA PAGBASA',
  'Read the Word': 'Basaha an Pulong',
  'READING CONTROLS': 'MGA KONTROL HAN PAGBASA',
  'Read chapter': 'Basaha an Kapitulo',
  'Stop audio': 'Undangon an Audio',
  'Preparing your Bible': 'Gin-aandam an Imo Biblia',
  'YOUR PERSONAL LIBRARY': 'IMO PERSONAL NGA LIBRARIYA',
  'Save & Reflect': 'Tipigi ngan Pamalandonga',
  'Bookmarks': 'Mga Ginmarkahan',
  'Clear': 'Kuhaa',
  'Saved verses will appear here.': 'An imo gintipigan nga mga bersikulo makikita dinhi.',
  'DAILY INSPIRATION': 'ADLAW-ADLAW NGA INSPIRASYON',
  'Daily Verse': 'Adlaw-adlaw nga Bersikulo',
  'New verse': 'Bag-o nga Bersikulo',
  'Save Daily Verse': 'Tipigi an Adlaw-adlaw nga Bersikulo',
  'Welcome Back': 'Maupay nga Pagbalik',
  'Create Your Account': 'Paghimo han Imo Account',
  'Email Address': 'Email Address',
  'Password': 'Password',
  'Log In': 'Sulod',
  'Sign Up': 'Magparehistro',
  'Continue with Google': 'Padayon pinaagi han Google',
  'OR': 'O',
  'Log Out': 'Gawas',
  'Translation': 'Paghubad',
  'Browse All Old Testament Books': 'Usisaha an Ngatanan nga Libro han Daan nga Testamento',
  'Browse All New Testament Books': 'Usisaha an Ngatanan nga Libro han Bag-o nga Testamento'
};

Object.assign(WARAY_UI_DICTIONARY, {
  'READ · SEARCH · REFLECT': 'BASA · PAMILING · PAMALANDONG',
  'Sign in to your Holy Bible account.': 'Sulod ha imo account han Baraan nga Biblia.',
  'Register to access your Holy Bible account.': 'Magparehistro basi magkaada access ha imo account han Baraan nga Biblia.',
  'Welcome to your Holy Bible': 'Maupay nga pag-abot ha imo Baraan nga Biblia',
  'Welcome Back': 'Maupay nga Pagbalik',
  'Create Your Account': 'Paghimo han Imo Account',
  'Email Address': 'Email Address',
  'Enter your email': 'Ibutang an imo email',
  'Password': 'Password',
  'Enter your password': 'Ibutang an imo password',
  'Hide password': 'Tagoa an password',
  'Show password': 'Ipakita an password',
  'Log In': 'Sulod',
  'Sign Up': 'Magparehistro',
  'Create Account': 'Paghimo hin Account',
  "Don't have an account?": 'Waray ka pa account?',
  'Already have an account?': 'May account ka na?',
  'Continue with Google': 'Padayon pinaagi han Google',
  'Log Out': 'Gawas',

  'Please wait...': 'Alayon paghulat...',
  'Connecting to Google...': 'Nagtutukod hin koneksyon ha Google...',
  'Login successful!': 'Malampuson an pag-login!',
  'Account created successfully!': 'Malampuson nga nahimo an account!',
  'Authentication failed.': 'Napakyas an authentication.',
  'Clear all saved bookmarks?': 'Kuhaon ba an ngatanan nga gintipigan nga bookmark?',
  'This verse is already bookmarked.': 'Mayda na ini nga bersikulo ha imo bookmarks.',
  'Audio reading is not supported by this browser.': 'Diri nasusuportahan hini nga browser an pagbasa pinaagi han audio.',

  'Checking saved Bible data…': 'Ginsisiguro an gintipigan nga datos han Biblia...',
  'Downloading complete KJV text… keep this tab open.': 'Gindada-download an bug-os nga KJV... ayaw anay sirhi ini nga tab.',
  'Bible text loaded from this device. Offline reading is ready.': 'Na-load an teksto han Biblia tikang hini nga device. Andam na an offline nga pagbasa.',
  'Complete KJV loaded and saved for offline reading.': 'Na-load ngan gintipigan na an bug-os nga KJV para ha offline nga pagbasa.',
  'Could not download the Bible text. Check your internet connection and reload.': 'Diri ma-download an teksto han Biblia. Susiha an internet connection ngan i-reload an page.',

  'No matches found. Try “love”, “lov”, or a reference such as “John 3:16”.': 'Waray nakit-an nga resulta. Pamiling hin iba nga pulong o Bible reference.',
  'Open verse': 'Abrihi an bersikulo',
  'Open': 'Abrihi',
  'Remove': 'Kuhaa',
  'Save': 'Tipigi',
  'Saved verses will appear here.': 'An imo gintipigan nga mga bersikulo makikita dinhi.',
  'Clear': 'Kuhaa',
  'Previous': 'Naglabay',
  'Next': 'Sunod',
  'New verse': 'Bag-o nga Bersikulo',
  'Save Daily Verse': 'Tipigi an Adlaw-adlaw nga Bersikulo',

  'Checking available Bible translations...': 'Ginsisiguro an mga available nga hubad han Biblia...',
  'Translation catalog could not be loaded.': 'Diri ma-load an lista han mga hubad.',
  'No verified translation available': 'Waray mapamatud-an nga hubad nga available',
  'Bible translation catalog unavailable. Your existing Bible text is still working.': 'Diri available an lista han mga hubad. Nagagamit la gihapon an imo Biblia.',
  'Translation download failed.': 'Napakyas an pag-download han hubad.',
  'Invalid translation data.': 'Diri husto an datos han hubad.',
  'This translation does not contain all 66 Bible books.': 'Diri kompleto an 66 nga libro hini nga hubad.',
  'Could not restore the saved KJV Bible.': 'Diri maibalik an gintipigan nga KJV nga Biblia.'
});

async function translateInterfaceText(text, language) {
  const original = String(text || '').trim();

  if (!original || language === 'en') return original;

  if (
    language === 'waray' &&
    WARAY_UI_DICTIONARY[original]
  ) {
    return WARAY_UI_DICTIONARY[original];
  }

  if (new TextEncoder().encode(original).length > 450) {
    return original;
  }

  const cache = getUiCache(language);

  if (cache[original]) {
    return cache[original];
  }

  const usage = getUiUsage(language);

  if (usage.characters + original.length > 4500) {
    return original;
  }

  const target = UI_LANGUAGE_CODES[language];

  if (!target) return original;

  try {
    const params = new URLSearchParams({
      q: original,
      langpair: 'en|' + target,
      mt: '1'
    });

    const response = await fetch(
      UI_TRANSLATION_API + '?' + params.toString()
    );

    if (!response.ok) {
      throw new Error('Translation service unavailable.');
    }

    const data = await response.json();

    if (
      data.responseStatus !== 200 ||
      !data.responseData ||
      !data.responseData.translatedText
    ) {
      throw new Error('No translation returned.');
    }

    const translated = data.responseData.translatedText;

    if (!translated || translated === original) {
      return original;
    }

    cache[original] = translated;
    saveUiCache(language, cache);

    usage.characters += original.length;

    localStorage.setItem(
      'holyBibleUiUsage_' + language,
      JSON.stringify(usage)
    );

    return translated;

  } catch (error) {
    console.warn('Interface translation failed:', error);
    return original;
  }
}

function collectUiText(root, onlyNew = false) {
  const found = [];

  if (!root) return found;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT
  );

  let node;

  while ((node = walker.nextNode())) {
    if (!node.nodeValue.trim()) continue;

    if (node.parentElement?.closest(UI_SKIP_SELECTOR)) {
      continue;
    }

    if (!uiOriginalText.has(node)) {
      uiOriginalText.set(node, node.nodeValue);
      uiTrackedText.add(node);
      found.push(node);
    } else if (!onlyNew) {
      found.push(node);
    }
  }

  return found;
}

function collectUiAttributes(root = document) {
  const selector = '[placeholder], [title], [aria-label]';
  const elements = [];

  if (root.matches?.(selector)) {
    elements.push(root);
  }

  elements.push(...root.querySelectorAll(selector));

  const found = [];

  elements.forEach(element => {
    if (element.closest(UI_SKIP_SELECTOR)) return;

    if (!uiOriginalAttributes.has(element)) {
      uiOriginalAttributes.set(element, {
        placeholder: element.getAttribute('placeholder'),
        title: element.getAttribute('title'),
        ariaLabel: element.getAttribute('aria-label')
      });

      uiTrackedElements.add(element);
    }

    found.push(element);
  });

  return found;
}
function preserveTextSpacing(original, translated) {
  const leading = original.match(/^\s*/)?.[0] || '';
  const trailing = original.match(/\s*$/)?.[0] || '';

  return leading + translated.trim() + trailing;
}

async function translateUiNode(node, language, run) {
  if (!node.isConnected) return;

  const original = uiOriginalText.get(node);

  if (!original) return;

  if (language === 'en') {
    node.nodeValue = original;
    return;
  }

  const leading = original.match(/^\s*/)?.[0] || '';
  const trailing = original.match(/\s*$/)?.[0] || '';
  const core = original.trim();

  if (!core) return;

  const translated = await translateInterfaceText(
    core,
    language
  );

  if (run !== interfaceTranslationRun) return;

  if (node.isConnected) {
    node.nodeValue = leading + translated + trailing;
  }
}

async function translateUiAttribute(
  element,
  attribute,
  original,
  language,
  run
) {
  if (!element.isConnected || !original) return;

  if (language === 'en') {
    element.setAttribute(attribute, original);
    return;
  }

  const translated = await translateInterfaceText(
    original,
    language
  );

  if (run !== interfaceTranslationRun) return;

  if (element.isConnected) {
    element.setAttribute(attribute, translated);
  }
}

async function applyInterfaceLanguage(language) {
  if (!UI_LANGUAGE_NAMES[language]) return;

  currentInterfaceLanguage = language;
  const run = ++interfaceTranslationRun;

  document.documentElement.lang = language;

  if (language === 'waray') {
    document.title = 'Baraan nga Biblia — Kasuratan';
  } else if (language === 'en') {
    document.title = 'Holy Bible — Scriptures';
  } else {
    document.title = 'Holy Bible — Scriptures';
  }

  document.documentElement.dir =
    ['ar', 'he', 'ur'].includes(language) ? 'rtl' : 'ltr';

  // Restore original English text first.
  uiTrackedText.forEach(node => {
    if (node.isConnected) {
      node.nodeValue = uiOriginalText.get(node);
    }
  });

  uiTrackedElements.forEach(element => {
    if (!element.isConnected) return;

    const original = uiOriginalAttributes.get(element);

    if (!original) return;

    ['placeholder', 'title'].forEach(attribute => {
      if (original[attribute] !== null) {
        element.setAttribute(attribute, original[attribute]);
      }
    });

    if (original.ariaLabel !== null) {
      element.setAttribute('aria-label', original.ariaLabel);
    }
  });

  const textNodes = collectUiText(document.body);
  const elements = collectUiAttributes();

  if (language === 'en') {
    return;
  }

  translationMessage(
    'Translating interface into ' + UI_LANGUAGE_NAMES[language] + '...'
  );

  // Translate in small groups to avoid sending too many requests at once.
  for (let i = 0; i < textNodes.length; i += 3) {
    if (run !== interfaceTranslationRun) return;

    await Promise.all(
      textNodes.slice(i, i + 3).map(node =>
        translateUiNode(node, language, run)
      )
    );
  }

  for (const element of elements) {
    if (run !== interfaceTranslationRun) return;

    const original = uiOriginalAttributes.get(element);

    if (!original) continue;

    await Promise.all([
      translateUiAttribute(
        element,
        'placeholder',
        original.placeholder,
        language,
        run
      ),
      translateUiAttribute(
        element,
        'title',
        original.title,
        language,
        run
      ),
      translateUiAttribute(
        element,
        'aria-label',
        original.ariaLabel,
        language,
        run
      )
    ]);
  }

  if (run === interfaceTranslationRun) {
    translationMessage(
      'Interface language: ' + UI_LANGUAGE_NAMES[language] +
      '. Bible text availability is checked separately.'
    );
  }
}

// Automatically translate newly rendered interface elements.
const uiTranslationObserver = new MutationObserver(records => {
  if (currentInterfaceLanguage === 'en') return;

  const newNodes = [];
  const newElements = [];

  records.forEach(record => {
    record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        newNodes.push(...collectUiText(node, true));
        newElements.push(...collectUiAttributes(node));
      }

      else if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;

        if (
          parent &&
          !parent.closest(UI_SKIP_SELECTOR) &&
          node.nodeValue.trim() &&
          !uiOriginalText.has(node)
        ) {
          uiOriginalText.set(node, node.nodeValue);
          uiTrackedText.add(node);
          newNodes.push(node);
        }
      }
    });
  });

  const run = interfaceTranslationRun;
  const language = currentInterfaceLanguage;

  newNodes.forEach(node => {
    translateUiNode(node, language, run);
  });

  newElements.forEach(element => {
    const original = uiOriginalAttributes.get(element);

    if (!original) return;

    translateUiAttribute(
      element,
      'placeholder',
      original.placeholder,
      language,
      run
    );

    translateUiAttribute(
      element,
      'title',
      original.title,
      language,
      run
    );

    translateUiAttribute(
      element,
      'aria-label',
      original.ariaLabel,
      language,
      run
    );
  });
});

uiTranslationObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// ============================================
// BIBLE TRANSLATION CATALOG
// ============================================

function translationLanguageMatches(item, language) {
  const acceptedCodes = TRANSLATION_LANGUAGES[language] || [];

  const code = String(item.language || '').toLowerCase();
  const languageName = String(item.languageName || '').toLowerCase();
  const englishName = String(item.languageEnglishName || '').toLowerCase();

  const languageAliases = {
    waray: ['waray', 'waray-waray'],
    fil: ['filipino', 'tagalog'],
    en: ['english'],
    es: ['spanish', 'español'],
    fr: ['french', 'français'],
    de: ['german', 'deutsch'],
    pt: ['portuguese'],
    it: ['italian'],
    zh: ['chinese'],
    ja: ['japanese'],
    ko: ['korean'],
    ar: ['arabic'],
    id: ['indonesian'],
    hi: ['hindi'],
    ru: ['russian'],
    th: ['thai'],
    vi: ['vietnamese'],
    ms: ['malay'],
    nl: ['dutch'],
    el: ['greek'],
    he: ['hebrew'],
    tr: ['turkish'],
    sw: ['swahili'],
    ur: ['urdu'],
    bn: ['bengali'],
    pl: ['polish']
  };

  const names = languageAliases[language] || [];

  return (
    acceptedCodes.includes(code) ||
    names.some(name =>
      languageName.includes(name) ||
      englishName.includes(name)
    )
  );
}
function doSearch() {
  const raw = $('searchInput').value || '';
  const q = normalizeSearchText(raw);
  const inlineMode = activeSearchTestament === 'OT' || activeSearchTestament === 'NT';
  const host = inlineMode
    ? $(activeSearchTestament === 'OT' ? 'oldInlineResults' : 'newInlineResults')
    : $('resultsList');
  const panel = inlineMode ? host : $('searchResults');

  host.innerHTML = '';

  if (!q) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  let count = 0;
  const maxResults = 250;

  const eligibleBooks = state.books.filter(b =>
    activeSearchTestament === 'all' || b.testament === activeSearchTestament
  );

  const parsed = parseBibleReference(raw);

  if (parsed && !parsed.invalid &&
      (activeSearchTestament === 'all' || parsed.book.testament === activeSearchTestament)) {
    const verses = parsed.book.chapters[parsed.chapter - 1] || [];

    for (let v = parsed.verse; v <= parsed.verseEnd; v++) {
      addResult(parsed.book, parsed.chapter, v, verses[v - 1], host);
      count++;
    }
  } else {
    const terms = q.split(/\s+/).filter(Boolean);

    outer:
    for (const book of eligibleBooks) {
      for (let ci = 0; ci < book.chapters.length; ci++) {
        const verses = book.chapters[ci];

        for (let vi = 0; vi < verses.length; vi++) {
          const verseText = normalizeSearchText(verses[vi]);

          if (terms.every(term => verseText.includes(term))) {
            addResult(book, ci + 1, vi + 1, verses[vi], host);
            count++;

            if (count >= maxResults) break outer;
          }
        }
      }
    }
  }

  if (!count) {
    host.innerHTML = '<p class="muted">No matches found. Try “love”, “lov”, or a reference such as “John 3:16”.</p>';
  } else {
    const message = document.createElement('p');
    message.className = 'muted result-count';
    message.textContent = `Showing ${count}${count === maxResults ? '+' : ''} result(s).`;
    host.prepend(message);
  }

  if (!inlineMode) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function addResult(b,ch,v,text,host=$('resultsList')) {
  const d=document.createElement('div');
  d.className='result-item';
  d.innerHTML=`<b>${escapeHTML(ref(b.name,ch,v))}</b><p>${escapeHTML(cleanText(text))}</p><button data-ref="${escapeHTML(ref(b.name,ch,v))}">Open verse</button><button data-save="${escapeHTML(ref(b.name,ch,v))}">☆ Save</button>`;
  host.append(d);
}

function handleResultClick(e) {
  const o=e.target.closest('[data-ref]');
  const s=e.target.closest('[data-save]');

  if(o) {
    const p=parseBibleReference(o.dataset.ref);

    if(p&&!p.invalid) {
      navigateRef(p.book.name,p.chapter);
      setTimeout(()=>document.getElementById('v'+p.verse)?.scrollIntoView({behavior:'smooth'}),100);
    }
  }

  if(s) {
    const p=parseBibleReference(s.dataset.save);

    if(p&&!p.invalid) {
      addBookmark(ref(p.book.name,p.chapter,p.verse),p.book.chapters[p.chapter-1][p.verse-1]);
    }
  }
}

$('resultsList').addEventListener('click',handleResultClick);
$('oldInlineResults').addEventListener('click',handleResultClick);
$('newInlineResults').addEventListener('click',handleResultClick);

bookSelect.addEventListener('change',()=>{
  state.bookIndex=+bookSelect.value;
  state.chapter=1;
  renderChapters();
  renderChapter();
});

chapterSelect.addEventListener('change',()=>{
  state.chapter=+chapterSelect.value;
  renderChapter();
});

$('testament').addEventListener('change',renderBookOptions);
$('prevBtn').addEventListener('click',prev);
$('nextBtn').addEventListener('click',next);

function fillTestamentCard(bookId, chapterId, testament) {
  const sel=$(bookId), ch=$(chapterId);

  if(!sel||!ch)return;

  sel.disabled=false;
  ch.disabled=false;
  sel.innerHTML='';

  state.books.forEach((b,i)=>{
    if(b.testament===testament){
      const o=document.createElement('option');
      o.value=i;
      o.textContent=b.name;
      sel.append(o);
    }
  });

  const first=state.books.findIndex(b=>b.testament===testament);

  sel.value=String(
    state.books[state.bookIndex]?.testament===testament
      ? state.bookIndex
      : first
  );

  function fillChapters(){
    const b=state.books[Number(sel.value)];
    ch.innerHTML='';

    if(b) {
      b.chapters.forEach((_,i)=>{
        const o=document.createElement('option');
        o.value=i+1;
        o.textContent=String(i+1);
        ch.append(o);
      });
    }
  }

  fillChapters();

  sel.addEventListener('change',()=>fillChapters());

  ch.addEventListener('change',()=>{
    const idx=Number(sel.value);
    if(state.books[idx])openSelectedBook(idx,Number(ch.value)||1);
  });
}

function wireCard(prefix,testament){
  const input=$(prefix+'Search');
  const btn=$(prefix+'SearchBtn');

  const run=()=>{
    $('searchInput').value=input.value;
    activeSearchTestament=testament;
    doSearch();
  };

  input.addEventListener('input',()=>{
    clearTimeout(searchTimer);
    searchTimer=setTimeout(run,150);
  });

  input.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      clearTimeout(searchTimer);
      run();
    }
  });

  btn.addEventListener('click',run);

  $(prefix+'Browse').addEventListener('click',()=>{
    showTestamentPage(testament);
    const b=Number($(prefix+'Book').value);
    const c=Number($(prefix+'Chapter').value||1);
    openSelectedBook(b,c);
  });
}

wireCard('old','OT');
wireCard('new','NT');

$('searchBtn').addEventListener('click', doSearch);

$('searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(doSearch, 120);
});

$('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    clearTimeout(searchTimer);
    doSearch();
  }
});

$('closeResults').addEventListener('click',()=>$('searchResults').classList.add('hidden'));

$('fontUp').addEventListener('click',()=>{
  state.font=Math.min(1.8,state.font+.1);
  document.querySelectorAll('.vtext').forEach(e=>e.style.fontSize=state.font+'rem');
});

$('fontDown').addEventListener('click',()=>{
  state.font=Math.max(.85,state.font-.1);
  document.querySelectorAll('.vtext').forEach(e=>e.style.fontSize=state.font+'rem');
});

$('readBtn').addEventListener('click',()=>{
  const b=state.books[state.bookIndex];
  speak(`${b.name} chapter ${state.chapter}. `+state.currentVerses.map((v,i)=>`Verse ${i+1}. ${cleanText(v)}`).join(' '));
});

$('stopBtn').addEventListener('click',()=>speechSynthesis?.cancel());

$('themeBtn').addEventListener('click',()=>{
  document.body.classList.toggle('dark');
  localStorage.setItem('holyBibleDark',document.body.classList.contains('dark'));
});

$('clearBookmarks').addEventListener('click',()=>{
  if(confirm('Clear all saved bookmarks?')){
    state.bookmarks=[];
    saveBookmarks();
  }
});

$('dailyBtn').addEventListener('click',()=>{
  const b=state.books[Math.floor(Math.random()*state.books.length)];
  const ch=Math.floor(Math.random()*b.chapters.length);
  const v=Math.floor(Math.random()*b.chapters[ch].length);

  state.daily={
    reference:ref(b.name,ch+1,v+1),
    text:b.chapters[ch][v]
  };

  $('dailyVerse').textContent=state.daily.reference+' — '+cleanText(state.daily.text);
});

$('saveDaily').addEventListener('click',()=>{
  if(state.daily)addBookmark(state.daily.reference,state.daily.text);
});

if(localStorage.getItem('holyBibleDark')==='true') {
  document.body.classList.add('dark');
}

loadBible();

async function loadAvailableTranslations() {
  if (!languageSelect || !translationVersionSelect) return;

  translationMessage('Checking available Bible translations...');

  try {
    const response = await fetch(
      `${TRANSLATION_API}/available_translations.json`
    );

    if (!response.ok) {
      throw new Error('Translation catalog could not be loaded.');
    }

    const data = await response.json();

    availableTranslations = (data.translations || []).filter(item =>
      item.numberOfBooks === 66 &&
      Array.isArray(item.availableFormats) &&
      item.availableFormats.includes('json')
    );

    updateTranslationVersionOptions();

    const selectedLanguage = languageSelect.value || 'fil';

    if (selectedLanguage === 'en') {
      await switchBibleTranslation('LOCAL_KJV');
    } else {
      const matching = availableTranslations.filter(item =>
        translationLanguageMatches(item, selectedLanguage)
      );

      if (matching.length) {
        await switchBibleTranslation(matching[0].id);
      } else {
        translationMessage(
          'Interface language is available. No verified 66-book public-domain Bible translation was found for this language. Your current Bible text remains unchanged.'
        );
      }
    }

  } catch (error) {
    console.warn('Translation catalog:', error);

    translationMessage(
      'Bible translation catalog unavailable. Your existing Bible text is still working.'
    );
  }
}

function updateTranslationVersionOptions() {
  if (!languageSelect || !translationVersionSelect) return;

  const selectedLanguage = languageSelect.value;

  translationVersionSelect.innerHTML = '';

  if (selectedLanguage === 'en') {
    const option = document.createElement('option');

    option.value = 'LOCAL_KJV';
    option.textContent = 'King James Version (KJV) - Offline';

    translationVersionSelect.append(option);
  }

  const matching = availableTranslations.filter(item =>
    translationLanguageMatches(item, selectedLanguage)
  );

  matching.forEach(item => {
    const option = document.createElement('option');

    option.value = item.id;
    option.textContent =
      `${item.name} (${item.shortName || item.id})`;

    translationVersionSelect.append(option);
  });

  if (!translationVersionSelect.options.length) {
    const option = document.createElement('option');

    option.value = '';
    option.textContent = 'No verified translation available';

    translationVersionSelect.append(option);
  }
}

function normalizeApiTranslation(data) {
  if (!data || !Array.isArray(data.books)) {
    throw new Error('Invalid translation data.');
  }

  const books = data.books.map((book, index) => {
    const chapters = (book.chapters || []).map(chapterEntry => {
      const chapter = chapterEntry.chapter || chapterEntry;

      return (chapter.content || [])
        .filter(item => item.type === 'verse')
        .sort((a, b) => Number(a.number) - Number(b.number))
        .map(item => String(item.text || ''));
    });

    return {
      name: fullBookName(
        book.commonName || book.name,
        index
      ),
      testament: index < 39 ? 'OT' : 'NT',
      chapters
    };
  });

  if (books.length !== 66) {
    throw new Error(
      'This translation does not contain all 66 Bible books.'
    );
  }

  return books;
}

function refreshTranslationCards() {
  const cards = [
    { bookId: 'oldBook', chapterId: 'oldChapter', testament: 'OT' },
    { bookId: 'newBook', chapterId: 'newChapter', testament: 'NT' }
  ];

  cards.forEach(card => {
    const bookElement = $(card.bookId);
    const chapterElement = $(card.chapterId);

    if (!bookElement || !chapterElement) return;

    const previousName = state.books[state.bookIndex]?.name;

    bookElement.innerHTML = '';

    state.books.forEach((book, index) => {
      if (book.testament !== card.testament) return;

      const option = document.createElement('option');

      option.value = index;
      option.textContent = book.name;

      bookElement.append(option);
    });

    const matchingIndex = state.books.findIndex(book =>
      book.name === previousName &&
      book.testament === card.testament
    );

    const firstIndex = state.books.findIndex(book =>
      book.testament === card.testament
    );

    bookElement.value = String(
      matchingIndex >= 0 ? matchingIndex : firstIndex
    );

    const selectedBook = state.books[Number(bookElement.value)];

    chapterElement.innerHTML = '';

    if (selectedBook) {
      selectedBook.chapters.forEach((_, index) => {
        const option = document.createElement('option');

        option.value = index + 1;
        option.textContent = String(index + 1);

        chapterElement.append(option);
      });
    }
  });
}

async function switchBibleTranslation(translationId) {
  if (!translationId) return;

  if (translationId === 'LOCAL_KJV') {
    translationMessage('Restoring King James Version...');

    try {
      const cached = await dbGet('kjv');

      if (!cached) {
        throw new Error('Saved KJV data was not found.');
      }

      const previousBook = state.books[state.bookIndex]?.name;

      state.books = normalize(cached);

      const index = state.books.findIndex(book =>
        book.name === previousBook
      );

      state.bookIndex = index >= 0 ? index : 0;

      state.chapter = Math.min(
        state.chapter,
        state.books[state.bookIndex].chapters.length
      );

      activeTranslationId = 'LOCAL_KJV';
      activeTranslationName = 'King James Version (KJV)';

      renderBookOptions();
      renderChapters();
      renderChapter();
      renderDaily();
      refreshTranslationCards();

      translationMessage(
        'Current Bible text: King James Version (KJV) - Offline'
      );

    } catch (error) {
      console.error(error);
      translationMessage('Could not restore the saved KJV Bible.');
    }

    return;
  }

  const selected = availableTranslations.find(item =>
    item.id === translationId
  );

  if (!selected) return;

  translationMessage(`Loading ${selected.name}...`);

  try {
    const cacheKey = `translation_${translationId}`;

    let books = await dbGet(cacheKey);

    if (!books) {
      const response = await fetch(
        `${TRANSLATION_API}/${encodeURIComponent(translationId)}/complete.simple.json`
      );

      if (!response.ok) {
        throw new Error('Translation download failed.');
      }

      const data = await response.json();

      books = normalizeApiTranslation(data);

      await dbSet(cacheKey, books);
    }

    const previousBook = state.books[state.bookIndex]?.name;

    state.books = books;

    const index = state.books.findIndex(book =>
      book.name === previousBook
    );

    state.bookIndex = index >= 0 ? index : 0;

    state.chapter = Math.min(
      state.chapter,
      state.books[state.bookIndex].chapters.length
    );

    activeTranslationId = translationId;
    activeTranslationName = selected.name;

    renderBookOptions();
    renderChapters();
    renderChapter();
    renderDaily();
    refreshTranslationCards();

    translationMessage(`Current Bible text: ${selected.name}`);

  } catch (error) {
    console.error('Translation loading error:', error);

    translationMessage(
      `Could not load ${selected.name}. Your previous Bible text remains available.`
    );
  }
}

// Keep the existing chapter renderer and update its subtitle.
const originalTranslationRenderChapter = renderChapter;

renderChapter = function() {
  originalTranslationRenderChapter();

  const subtitle = reader.querySelector('.subhead');

  if (subtitle) {
    const book = state.books[state.bookIndex];

    if (book) {
      const testamentName =
        book.testament === 'OT'
          ? 'Old Testament'
          : 'New Testament';

      subtitle.textContent =
        `${testamentName} · ${state.currentVerses.length} verses · ${activeTranslationName}`;
    }
  }
};

// ============================================
// ONE LANGUAGE SELECTOR CONTROLS BOTH SYSTEMS
// ============================================

if (languageSelect) {
  const savedLanguage = localStorage.getItem('holyBibleLanguage');

  if (
    savedLanguage &&
    UI_LANGUAGE_NAMES[savedLanguage]
  ) {
    languageSelect.value = savedLanguage;
  }

  currentInterfaceLanguage = languageSelect.value || 'fil';

  languageSelect.addEventListener('change', async () => {
    const language = languageSelect.value;

    localStorage.setItem('holyBibleLanguage', language);

    applyInterfaceLanguage(language);

    updateTranslationVersionOptions();

    if (language === 'en') {
      await switchBibleTranslation('LOCAL_KJV');
      return;
    }

    const matching = availableTranslations.filter(item =>
      translationLanguageMatches(item, language)
    );

    if (matching.length) {
      translationVersionSelect.value = matching[0].id;
      await switchBibleTranslation(matching[0].id);
    } else {
      translationMessage(
        'The interface language was changed. No verified complete Bible translation is currently available for this language, so your existing Bible text remains unchanged.'
      );
    }
  });
}

if (translationVersionSelect) {
  translationVersionSelect.addEventListener('change', async () => {
    const selectedVersion = translationVersionSelect.value;

    if (selectedVersion) {
      await switchBibleTranslation(selectedVersion);
    }
  });
}

applyInterfaceLanguage(currentInterfaceLanguage);
loadAvailableTranslations();

// ============================================
// END OF UNIFIED LANGUAGE SYSTEM
// ============================================

// ============================================
// HOME + SEPARATE OLD/NEW TESTAMENT PAGES
// ============================================

(function setupTestamentPages(){
  const oldCard=document.querySelector('#testamentCardTemplates .old-card');
  const newCard=document.querySelector('#testamentCardTemplates .new-card');
  const oldSlot=$('oldCardSlot'), newSlot=$('newCardSlot');

  if(oldCard&&oldSlot) oldSlot.appendChild(oldCard);
  if(newCard&&newSlot) newSlot.appendChild(newCard);

  const homeLibrary=$('homeLibrary');
  const homePage=$('homePage');

  if(homeLibrary&&homePage) homePage.appendChild(homeLibrary);

  const readerArea=$('readerArea');

  if(readerArea) readerArea.classList.add('hidden');

  document.querySelectorAll('[data-page]').forEach(button=>{
    button.addEventListener('click',()=>{
      const page=button.dataset.page;

      if(page==='home') showHomePage();
      else showTestamentPage(page);
    });
  });
})();

function updatePageNav(active){
  document.querySelectorAll('.page-nav [data-page]').forEach(btn=>{
    btn.classList.toggle('active',btn.dataset.page===active);
  });
}

function showHomePage(){
  $('homePage')?.classList.remove('hidden');
  $('oldPage')?.classList.add('hidden');
  $('newPage')?.classList.add('hidden');
  $('readerArea')?.classList.add('hidden');

  updatePageNav('home');

  window.scrollTo({top:0,behavior:'smooth'});
}

function showTestamentPage(testament){
  const isOld=testament==='OT';

  $('homePage')?.classList.add('hidden');
  $('oldPage')?.classList.toggle('hidden',!isOld);
  $('newPage')?.classList.toggle('hidden',isOld);
  $('readerArea')?.classList.add('hidden');

  const page=isOld?$('oldPage'):$('newPage');

  if(page&&$('readerArea')) {
    page.appendChild($('readerArea'));
  }

  $('testament').value=testament;

  renderBookOptions();
  updatePageNav(testament);

  window.scrollTo({top:0,behavior:'smooth'});
}

function renderTestamentBookGrids(){
  if(!state.books.length)return;

  [['oldBooksGrid','OT'],['newBooksGrid','NT']].forEach(([id,testament])=>{
    const host=$(id);

    if(!host)return;

    host.innerHTML='';

    state.books.forEach((book,index)=>{
      if(book.testament!==testament)return;

      const button=document.createElement('button');

      button.type='button';
      button.className='book-choice';
      button.textContent=book.name;

      button.addEventListener('click',()=>openSelectedBook(index,1));

      host.appendChild(button);
    });
  });
}

function openSelectedBook(bookIndex,chapter){
  if(!state.books[bookIndex])return;

  const testament=state.books[bookIndex].testament;

  showTestamentPage(testament);

  state.bookIndex=bookIndex;
  state.chapter=chapter||1;

  $('testament').value=testament;

  renderBookOptions();
  renderChapters();

  const cardPrefix=testament==='OT'?'old':'new';

  if($(cardPrefix+'Book')) {
    $(cardPrefix+'Book').value=String(bookIndex);
  }

  if($(cardPrefix+'Chapter')) {
    $(cardPrefix+'Chapter').value=String(state.chapter);
  }

  $('readerArea').classList.remove('hidden');

  renderChapter();

  $('reader').scrollIntoView({
    behavior:'smooth',
    block:'start'
  });
}