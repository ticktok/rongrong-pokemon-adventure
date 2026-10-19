"""Download explicitly licensed US pronunciations from Wikimedia Commons.
Requires ffmpeg (set FFMPEG). Keeps downloaded originals under ignored private/.
Never substitutes British or machine-generated audio for a missing US recording.
Source overrides include Wiktionary accent evidence. Outputs include per-file credits
and an explicit missing-word report; existing audio is reused, never auto-deleted.
On upstream rate limiting, honor Retry-After and keep downloaded originals.
"""
import concurrent.futures, html, json, os, re, subprocess, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
CACHE=ROOT/'private/pronunciation-sources'; CACHE.mkdir(parents=True,exist_ok=True)
OUT=ROOT/'public/assets/word-audio'; OUT.mkdir(parents=True,exist_ok=True)
WORDS=json.loads((ROOT/'content/words.json').read_text())
FFMPEG=os.environ.get('FFMPEG','ffmpeg')
HEADERS={'User-Agent':'RongrongEnglishLearning/0.3.1 (https://github.com/ticktok/rongrong-pokemon-adventure)'}
def request(url):
 for attempt in range(2):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=35) as response:return response.read()
  except urllib.error.HTTPError as error:
   if attempt==1 or error.code in (403,404,530):raise
   time.sleep(max(60,float(error.headers.get('Retry-After',60))) if error.code==429 else 2*(attempt+1))
  except Exception:
   if attempt==1:raise
   time.sleep(2*(attempt+1))
def commons(**params):
 return json.loads(request('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(dict(action='query',format='json',prop='imageinfo',iiprop='url|extmetadata',**params))))
def clean(value):return html.unescape(re.sub('<[^>]+>','',value)).strip()
meta={}
for start in range(0,len(WORDS),40):
 group=WORDS[start:start+40]
 cache=CACHE/f'metadata-{start}.json'
 if cache.exists():data=json.loads(cache.read_text())
 else:
  data=commons(titles='|'.join('File:En-us-'+w['word']+'.ogg' for w in group));cache.write_text(json.dumps(data))
 for page in data.get('query',{}).get('pages',{}).values():
  if page.get('imageinfo'):meta[page['title'].lower()]=page
 print('Metadata',min(start+40,len(WORDS)),flush=True)
overrides=json.loads((ROOT/'content/pronunciation-overrides.json').read_text())
if overrides:
 cache=CACHE/'override-metadata.json'
 titles='|'.join(x['title'] for x in overrides.values())
 if cache.exists() and json.loads(cache.read_text()).get('titles')==titles:data=json.loads(cache.read_text())['data']
 else:
  data=commons(titles=titles);cache.write_text(json.dumps({'titles':titles,'data':data}))
 for page in data.get('query',{}).get('pages',{}).values():
  if page.get('imageinfo'):meta[page['title'].lower()]=page
def prepare(w):
 word=w['word'];override=overrides.get(word.lower());key=override['title'] if override else 'File:En-us-'+word+'.ogg';page=meta.get(key.lower())
 if not page:
  cache=CACHE/(w['id']+'-lookup.json')
  if cache.exists():data=json.loads(cache.read_text())
  else:
   try:data=json.loads(request('https://api.dictionaryapi.dev/api/v2/entries/en/'+urllib.parse.quote(word)))
   except Exception:return word,None,'no US recording'
   cache.write_text(json.dumps(data))
  matches=[p for entry in data if isinstance(entry,dict) for p in entry.get('phonetics',[]) if p.get('audio','').endswith('-us.mp3') and p.get('sourceUrl','').startswith('https://commons.wikimedia.org/')]
  if not matches:return word,None,'no US recording'
  match=matches[0];query=urllib.parse.parse_qs(urllib.parse.urlparse(match['sourceUrl']).query)
  if 'curid' not in query:return word,None,'source needs review'
  data=commons(pageids=query['curid'][0]);page=next(iter(data['query']['pages'].values()))
 info=page['imageinfo'][0];ext=info.get('extmetadata',{});get=lambda field:clean(ext.get(field,{}).get('value',''))
 license=get('LicenseShortName');license_url=get('LicenseUrl').replace('http:','https:') or ('https://creativecommons.org/publicdomain/zero/1.0/' if license=='CC0' else 'https://commons.wikimedia.org/wiki/Commons:Public_domain');author=get('Artist')
 if not re.match(r'^(CC BY(?:-SA)? [1-4]\.0|CC BY-SA 2\.5|CC0|Public domain)',license):return word,None,'license needs review: '+license
 if not author and license=='Public domain':author='未署名（公有领域录音）'
 if not author:return word,None,'missing attribution'
 # The filename or Commons category must explicitly identify US English.
 if not override and 'en-us-' not in page['title'].lower() and 'U.S. English pronunciation' not in get('Categories'):return word,None,'accent needs review'
 target=OUT/(w['id']+'.mp3');source=CACHE/(w['id']+'.ogg')
 if not source.exists():
  time.sleep(3)
  source.write_bytes(request(info['url'].split('?')[0]))
 if not target.exists():
  result=subprocess.run([FFMPEG,'-v','error','-nostdin','-n','-i',str(source),'-map_metadata','-1','-af','loudnorm=I=-20:TP=-3:LRA=7,alimiter=limit=0.7:level=false','-ac','1','-ar','44100','-codec:a','libmp3lame','-b:a','96k',str(target)],capture_output=True,text=True)
  if result.returncode:return word,None,'conversion failed: '+result.stderr[:150]
 return word,dict(path='assets/word-audio/'+target.name,source=info['descriptionurl'],author=author,license=license,licenseUrl=license_url,accent=override['accent'] if override else 'US',accentEvidence=override['evidence'] if override else info['descriptionurl'],changes='Converted to mono MP3, normalized loudness; playback at 0.9× speed.'),None
def safe_prepare(w):
 try:return prepare(w)
 except Exception as error:return w["word"],None,'暂未取得可用美式录音（'+type(error).__name__+'）'
records={};missing={}
with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
 for i,(word,record,error) in enumerate(pool.map(safe_prepare,WORDS)):
  if record:records[word.lower()]=record
  else:missing[word]=error
  if i%20==19:print('Audio',i+1,'ready',len(records),'missing',len(missing),flush=True)
(ROOT/'content/pronunciations.json').write_text(json.dumps({word:r['path'] for word,r in sorted(records.items())},ensure_ascii=False,indent=2)+'\n')
(OUT/'sources.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
(ROOT/'content/pronunciation-missing.json').write_text(json.dumps(missing,ensure_ascii=False,indent=2)+'\n')
rows=''.join('<tr><td>'+html.escape(word)+'</td><td>'+html.escape(r['author'])+'</td><td><a href="'+html.escape(r['source'],quote=True)+'">原始录音</a></td><td><a href="'+html.escape(r['licenseUrl'],quote=True)+'">'+html.escape(r['license'])+'</a></td></tr>' for word,r in sorted(records.items()))
(ROOT/'public/audio-credits.html').write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>单词音频来源</title><style>body{font:16px/1.7 sans-serif;max-width:960px;margin:32px auto;padding:0 20px;color:#35472f;background:#fffdf4}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ddd;padding:10px}a{color:#456c36}</style><h1>单词音频来源</h1><p>美式英语录音来自 Wikimedia Commons 贡献者，部分条目通过 Free Dictionary API 查找。每个音频按下表所列许可提供；请保留作者、来源、许可及修改说明。录音已转为单声道 MP3 并统一响度，播放器以 0.9 倍速度播放。CC BY-SA 音频的修改版本按相同许可提供。</p><table><thead><tr><th>单词</th><th>作者</th><th>来源</th><th>许可</th></tr></thead><tbody>'+rows+'</tbody></table></html>')
print(json.dumps({'ready':len(records),'missing':missing},ensure_ascii=False),flush=True)
