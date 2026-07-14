#!/usr/bin/env python3
"""Build Warcry Herald reference JSON from https://warcrier.net/docs."""
from __future__ import annotations
import argparse, html, json, re, sys, time, unicodedata
from collections import deque
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse
import requests
from bs4 import BeautifulSoup, Tag
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE="https://warcrier.net"
SEEDS={
 "warbands":f"{BASE}/docs/warbands",
 "abilities":f"{BASE}/docs/rules/abilities",
 "blessings":f"{BASE}/docs/rules/optional-rules/divine-blessings",
}
ALLIANCES={"chaos":("Chaos",10),"death":("Death",20),"destruction":("Destruction",30),"order":("Order",40)}
FIGHTER_MARKS=["Hero","Agile","Ally","Beast","Berserker","Brute","Bulwark","Champion","Destroyer","Elite","Ferocious","Fly","Icon Bearer","Minion","Monster","Mount","Mystic","Priest","Scout","Sentience","Terrifying","Thrall","Trapper","Warrior"]
COSTS=("Double","Triple","Quad","Reaction")


def norm(s):
 s=html.unescape(s or "").replace("\u200b"," ").replace("\xa0"," ").replace("’","'").replace("–","-").replace("—","-")
 return re.sub(r"\s+"," ",s).strip()

def slug(s):
 s=unicodedata.normalize("NFKD",norm(s).lower()).encode("ascii","ignore").decode().replace("&"," and ")
 return re.sub(r"[^a-z0-9]+","-",s).strip("-") or "unnamed"

def canon(u):
 p=urlparse(u); return urlunparse(("https",p.netloc.lower().removeprefix("www."),p.path.rstrip("/") or "/","","",""))

def session(ua):
 s=requests.Session(); s.headers.update({"User-Agent":ua,"Accept":"text/html"})
 r=Retry(total=4,backoff_factor=.7,status_forcelist=(429,500,502,503,504),allowed_methods=frozenset({"GET"}))
 s.mount("https://",HTTPAdapter(max_retries=r)); return s

def get_page(s,u,timeout):
 r=s.get(u,timeout=timeout); r.raise_for_status(); soup=BeautifulSoup(r.text,"html.parser")
 a=soup.select_one("article .theme-doc-markdown,main .theme-doc-markdown,.theme-doc-markdown,article,main")
 if not a: raise RuntimeError(f"No article at {u}")
 h=a.find("h1") or soup.find("h1"); title=norm(h.get_text(" ",strip=True) if h else "")
 m=re.search(r"Last updated on\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})",norm(a.get_text(" ",strip=True)),re.I)
 updated=None
 if m:
  raw=" ".join(m.groups())
  for f in ("%b %d %Y","%B %d %Y"):
   try: updated=datetime.strptime(raw.title(),f).date().isoformat(); break
   except ValueError: pass
 return {"url":canon(r.url),"title":title,"updated":updated,"soup":soup,"article":a}

def discover(s,timeout,delay,limit):
 q=deque([SEEDS["warbands"]]); seen=set(); found=set(); pat=re.compile(r"^/docs/warbands/(chaos|death|destruction|order)/[^/]+/?$",re.I)
 while q:
  u=canon(q.popleft())
  if u in seen: continue
  seen.add(u); p=get_page(s,u,timeout)
  for a in p["article"].select("a[href]"):
   v=canon(urljoin(p["url"]+"/",a.get("href")))
   x=urlparse(v)
   if x.netloc=="warcrier.net" and pat.match(x.path):
    found.add(v)
    if v not in seen:q.append(v)
  if delay:time.sleep(delay)
  if limit and len(found)>=limit:break
 out=sorted(found); return out[:limit] if limit else out

def doc(p):
 return {"stableKey":f"warcrier-{slug(urlparse(p['url']).path)}-en","title":p["title"],"publisher":"Warcrier","sourceUrl":p["url"],"language":"en","publishedAt":p["updated"]}

def labels(el):
 out=[]
 for n in el.find_all(True):
  for k in ("alt","title","aria-label","data-runemark","data-name"):
   if isinstance(n.get(k),str):out.append(norm(n.get(k)))
  for k in ("src","href","xlink:href"):
   if isinstance(n.get(k),str):out.append(n.get(k).rsplit("/",1)[-1].split("?",1)[0].rsplit(".",1)[0].replace("-"," ").replace("_"," "))
  out.extend(str(x).replace("-"," ").replace("_"," ") for x in (n.get("class") or []))
 return out

def marks(texts,extra=""):
 hay=(" | ".join(texts)+" "+extra).lower().replace("-"," "); out=set()
 for n in FIGHTER_MARKS:
  if re.search(rf"(?<![a-z]){re.escape(n.lower()).replace(r'\ ',r'\s+')}(?=$|[^a-z])",hay):out.add(n)
 return out

def previous_name(card):
 h=card.find_previous(["h2","h3","h4"])
 while h and norm(h.get_text(" ",strip=True)).lower() in {"reaction","reactions","abilities","ability","fighters","heroes","monsters"}:h=h.find_previous(["h2","h3","h4"])
 return h,norm(h.get_text(" ",strip=True) if h else "")

def fragment(h,fallback):return str(h.get("id")) if h and h.get("id") else slug(fallback)

def parse_card(card,p,fkey,rkey,dkey,warn):
 h,name=previous_name(card); t=norm(card.get_text(" ",strip=True))
 sm=re.search(r"(?P<points>\d+)\s+Move\s+(?P<movement>\d+)\s+Toughness\s+(?P<toughness>\d+)\s+Wounds\s+(?P<wounds>\d+)",t,re.I)
 if not sm:
  warn.append(f"{p['url']}#{fragment(h,name)}: stats not parsed for {name}"); return None,[]
 st={k:int(v) for k,v in sm.groupdict().items()}; year=(p["updated"] or str(date.today()))[:4]
 fighter_key=f"{slug(p['title'])}-{slug(name)}-{year}-en"; ms=marks(labels(card),t); path=urlparse(p["url"]).path.lower()
 if "allies" in path:ms.add("Ally")
 if "monsters" in path:ms.add("Monster")
 if "thralls" in path:ms.add("Thrall")
 group=h.find_previous("h2") if h else None
 if group and norm(group.get_text(" ",strip=True)).lower() in {"hero","heroes"}:ms.add("Hero")
 fighter={"stableKey":fighter_key,"rulesReleaseStableKey":rkey,"factionStableKey":fkey,"name":name,"movement":st["movement"],"toughness":st["toughness"],"wounds":st["wounds"],"points":st["points"],"baseSizeMm":None,"isLeader":"Hero" in ms,"isCurrent":True,"runemarkStableKeys":sorted({f"{slug(x)}-en" for x in ms}|{fkey}),"sourceDocumentStableKey":dkey,"sourcePage":f"#{fragment(h,name)}"}
 wp=re.compile(r"(?P<name>[A-Za-z][A-Za-z0-9' ,+&()/.-]{0,100}?)\s+Range\s+(?P<range>\d+(?:\s*-\s*\d+)?)\s+Attacks\s+(?P<attacks>\d+)\s+Strength\s+(?P<strength>\d+)\s+Damage\s*\(normal/crit\)\s+(?P<damage>\d+)\s*/\s*(?P<critical>\d+)",re.I)
 weapons=[]
 for i,m in enumerate(wp.finditer(t),1):
  n=norm(m.group("name")).strip(" -"); vals=[int(x) for x in re.findall(r"\d+",m.group("range"))]; rmin,rmax=(vals[0],vals[-1])
  k=f"{fighter_key}-{slug(n)}"; k=f"{k}-{i}" if any(x["stableKey"]==k for x in weapons) else k
  weapons.append({"stableKey":k,"fighterStableKey":fighter_key,"name":n[:120],"rangeMin":rmin,"rangeMax":rmax,"attacks":int(m.group("attacks")),"strength":int(m.group("strength")),"damage":int(m.group("damage")),"criticalDamage":int(m.group("critical"))})
 if not weapons:warn.append(f"{p['url']}#{fragment(h,name)}: no weapon parsed")
 return fighter,weapons

def container(node,article):
 cur=node.parent
 x=cur.find_parent(["tr","li","p"]) if isinstance(cur,Tag) else None
 if x and article in x.parents:return x
 while isinstance(cur,Tag) and cur is not article:
  if any(q in " ".join(cur.get("class") or []).lower() for q in ("ability","reaction","row")):return cur
  cur=cur.parent
 return node.parent

def clean_ability_name(raw,ms,faction):
 v=norm(raw)
 for prefix in sorted({*ms,faction},key=len,reverse=True):
  while re.match(rf"^{re.escape(prefix)}\s+",v,re.I):v=re.sub(rf"^{re.escape(prefix)}\s+","",v,count=1,flags=re.I).strip()
 return v

def ability_candidates(p):
 out=[]; seen=set(); pat=re.compile(r"\[(Double|Triple|Quad|Reaction)\]",re.I)
 for node in p["article"].find_all(string=pat):
  c=container(node,p["article"])
  if id(c) in seen:continue
  seen.add(id(c)); cells=c.find_all(["td","th"],recursive=False); body=norm((cells[-1] if cells else c).get_text(" ",strip=True))
  m=re.search(r"\[(Double|Triple|Quad|Reaction)\]\s*([^:]{1,140}):\s*(.+)",body,re.I)
  if not m:
   body=norm(c.get_text(" ",strip=True)); m=re.search(r"\[(Double|Triple|Quad|Reaction)\]\s*([^:]{1,140}):\s*(.+)",body,re.I)
  if not m:continue
  ms=marks(labels(c),body[:m.start()]); name=clean_ability_name(m.group(2),ms,p["title"])
  h=c.find_previous(["h2","h3","h4"])
  if name and len(name)<=120:out.append((m.group(1).title(),name,norm(m.group(3)),ms,fragment(h,name)))
 # icon-only reaction rows
 for h in p["article"].find_all(["h3","h4"]):
  if norm(h.get_text(" ",strip=True)).lower() not in {"reaction","reactions"}:continue
  for sib in h.next_siblings:
   if isinstance(sib,Tag) and sib.name in {"h2","h3","h4"}:break
   if not isinstance(sib,Tag):continue
   for row in (sib.select("tr") or [sib]):
    text=norm(row.get_text(" ",strip=True))
    if not text or "[Reaction]" in text or ":" not in text or text.lower().startswith("runemark reaction"):continue
    m=re.search(r"([^:]{1,140}):\s*(.{20,})",text)
    if m:
     ms=marks(labels(row),text[:m.start(1)]); name=clean_ability_name(m.group(1),ms,p["title"])
     if name and len(name)<=120:out.append(("Reaction",name,norm(m.group(2)),ms,fragment(h,name)))
 uniq=[]; keys=set()
 for x in out:
  k=(x[0].lower(),x[1].lower(),tuple(sorted(x[3])))
  if k not in keys:keys.add(k); uniq.append(x)
 return uniq

def value(raw):
 s=norm(raw).lower()
 if s.isdigit():return int(s)
 if "half" in s and "value" in s:return "half-ability-value-rounding-up"
 if "double" in s and "value" in s:return "double-ability-value"
 if "value" in s:return "ability-value"
 m=re.search(r"\d+",s); return int(m.group()) if m else s

def mechanics(text,cost):
 low=text.lower(); m={"cost":{"dice":cost.lower()}}; target={}
 if "friendly fighter" in low:target["side"]="friendly"
 elif "enemy fighter" in low:target["side"]="enemy"
 elif "this fighter" in low:target["side"]="self"
 if "visible" in low:target["visibilityRequired"]=True
 d=re.search(r"within\s+(\d+)\s*(?:\"|inches?)",low)
 if d:target["maximumDistanceInches"]=int(d.group(1))
 if target:m["target"]=target
 if "end of the battle round" in low:m["duration"]="end-of-battle-round"
 elif "end of this fighter's activation" in low:m["duration"]="end-of-activation"
 if "bonus disengage action" in low:m["movement"]={"operation":"bonus-disengage"}
 elif "bonus move action" in low:m["movement"]={"operation":"bonus-move"}
 elif "remove this fighter from the battlefield" in low:m["movement"]={"operation":"teleport"}
 if "bonus melee attack action" in low:m["attack"]={"operation":"bonus-attack","weaponType":"melee"}
 elif "bonus missile attack action" in low or "bonus ranged attack action" in low:m["attack"]={"operation":"bonus-attack","weaponType":"missile"}
 elif "bonus attack action" in low:m["attack"]={"operation":"bonus-attack"}
 mods=[]
 rg=re.compile(r"\b(add|subtract)\s+(\d+|half the value of this ability(?: \(rounding up\))?|double the value of this ability|the value of this ability)\s+(?:to|from)\s+the\s+(move|attacks|strength|toughness|wounds|first damage|second damage|damage points)[^.,;]*",re.I)
 for x in rg.finditer(text):
  q={"characteristic":x.group(3).lower().replace(" ","-"),"operation":"add" if x.group(1).lower()=="add" else "subtract","value":value(x.group(2))}; clause=x.group(0).lower()
  if "melee" in clause:q["weaponType"]="melee"
  elif "missile" in clause or "ranged" in clause:q["weaponType"]="missile"
  mods.append(q)
 if mods:m["modifiers"]=mods
 h=re.search(r"remove\s+(?:(?:up to|a number of)\s+)?(d\d+|\d+|half the value of this ability|the value of this ability)[^.]*damage points?",low)
 if h:m["healing"]={"value":value(h.group(1))}
 if "allocate" in low and "damage point" in low:m["directDamage"]={"present":True}
 restrictions=[code for phrase,code in {"cannot make move actions":"cannot-move","cannot make disengage actions":"cannot-disengage","cannot activate":"cannot-activate","cannot make reactions":"cannot-react","cannot use abilities":"cannot-use-abilities"}.items() if phrase in low]
 if restrictions:m["restrictions"]=restrictions
 return m

def summary(m,cost):
 parts=[]
 if m.get("movement"):parts.append("provides "+m["movement"]["operation"].replace("-"," ")+" movement")
 if m.get("attack"):parts.append("grants a bonus "+(m["attack"].get("weaponType","")+" ").strip()+" attack")
 if m.get("modifiers"):parts.append("modifies "+", ".join(sorted({x["characteristic"].replace("-"," ") for x in m["modifiers"]})))
 if m.get("healing"):parts.append("removes allocated damage")
 if m.get("directDamage"):parts.append("can inflict direct damage")
 if m.get("restrictions"):parts.append("restricts the target's actions")
 if not parts:return "Triggers a defensive, evasive, or retaliatory effect under the stated reaction condition." if cost=="Reaction" else "Applies a faction-specific combat effect under its stated conditions; consult the linked source section for full wording."
 s="; ".join(parts).capitalize()
 if m.get("duration")=="end-of-battle-round":s+=" until the battle round ends"
 elif m.get("duration")=="end-of-activation":s+=" until the fighter's activation ends"
 return s.rstrip(".")+"."

def parse_faction(p,rkey,warn):
 parts=[x for x in urlparse(p["url"]).path.split("/") if x]; alliance=parts[parts.index("warbands")+1].lower(); fkey=f"{slug(p['title'])}-en"; cards=p["article"].select(".fighter-card")
 if not cards:return None,[],[],[],set()
 faction={"stableKey":fkey,"rulesReleaseStableKey":rkey,"grandAllianceStableKey":f"{alliance}-en","name":p["title"],"displayOrder":0}; dkey=doc(p)["stableKey"]
 fighters=[]; weapons=[]; found=set()
 for card in cards:
  f,w=parse_card(card,p,fkey,rkey,dkey,warn)
  if f:fighters.append(f);weapons+=w;found|={x.removesuffix("-en").replace("-"," ").title() for x in f["runemarkStableKeys"] if x!=fkey}
 abilities=[]; year=(p["updated"] or str(date.today()))[:4]
 for cost,name,text,ms,frag in ability_candidates(p):
  found|=ms; mech=mechanics(text,cost)
  abilities.append({"stableKey":f"{slug(p['title'])}-{slug(name)}-{year}-en","rulesReleaseStableKey":rkey,"factionStableKey":fkey,"name":name,"isUniversal":False,"cost":cost,"effect":summary(mech,cost),"mechanics":mech,"runemarkStableKeys":sorted({f"{slug(cost)}-en",fkey}|{f"{slug(x)}-en" for x in ms}),"sourceDocumentStableKey":dkey,"sourcePage":f"#{frag}"})
 return faction,fighters,weapons,abilities,found

def parse_universal(p,rkey):
 out=[]; found=set(); dkey=doc(p)["stableKey"]; year=(p["updated"] or str(date.today()))[:4]
 for cost,name,text,ms,frag in ability_candidates(p):
  if name.lower()=="rampage":continue
  found|=ms; mech=mechanics(text,cost)
  out.append({"stableKey":f"universal-{slug(name)}-{year}-en","rulesReleaseStableKey":rkey,"factionStableKey":None,"name":name,"isUniversal":True,"cost":cost,"effect":summary(mech,cost),"mechanics":mech,"runemarkStableKeys":sorted({f"{slug(cost)}-en"}|{f"{slug(x)}-en" for x in ms}),"sourceDocumentStableKey":dkey,"sourcePage":f"#{frag}"})
 return out,found

def parse_blessings(p,rkey,warn):
 out=[]; dkey=doc(p)["stableKey"]; year=(p["updated"] or str(date.today()))[:4]
 for row in p["article"].select("table tr"):
  c=[norm(x.get_text(" ",strip=True)) for x in row.find_all(["td","th"])]
  if len(c)<4 or c[0].lower().startswith("blessing of"):continue
  nums=[re.search(r"\d+",x) for x in c[-2:]]
  if not all(nums):continue
  regular,elite=(int(x.group()) for x in nums); mech=mechanics(c[1],"Blessing");mech["points"]={"regular":regular,"elite":elite}
  out.append({"stableKey":f"blessing-{slug(c[0])}-{year}-en","rulesReleaseStableKey":rkey,"name":c[0],"effect":summary(mech,"Blessing"),"mechanics":mech,"points":regular,"sourceDocumentStableKey":dkey,"sourcePage":"#blessings"})
 if not out:warn.append(f"{p['url']}: no blessings parsed")
 return out

def dedupe(items):
 out=[];seen={};
 for x in items:
  k=x["stableKey"]
  if k in seen:seen[k]+=1;x=dict(x);x["stableKey"]=f"{k}-{seen[k]}"
  else:seen[k]=1
  out.append(x)
 return out

def runemarks(factions,found):
 out=[]; names=sorted({x.title() for x in FIGHTER_MARKS}|{norm(x).title() for x in found if x})
 out+=[{"stableKey":f"{slug(n)}-en","name":n,"category":"fighter","displayOrder":i*10} for i,n in enumerate(names,1)]
 out+=[{"stableKey":f["stableKey"],"name":f["name"],"category":"faction","displayOrder":1000+i*10} for i,f in enumerate(sorted(factions,key=lambda x:x["name"]),1)]
 out+=[{"stableKey":f"{slug(n)}-en","name":n,"category":"ability","displayOrder":2000+i*10} for i,n in enumerate(COSTS,1)]
 return dedupe(out)

def validate(d):
 errors=[]; maps={k:{x["stableKey"] for x in v} for k,v in d.items()}
 for f in d["factions"]:
  if f["rulesReleaseStableKey"] not in maps["releases"]:errors.append(f"bad release: {f['stableKey']}")
  if f["grandAllianceStableKey"] not in maps["grandAlliances"]:errors.append(f"bad alliance: {f['stableKey']}")
 for f in d["fighters"]:
  if f["factionStableKey"] not in maps["factions"]:errors.append(f"bad faction: {f['stableKey']}")
  for k in f["runemarkStableKeys"]:
   if k not in maps["runemarks"]:errors.append(f"bad runemark {k}: {f['stableKey']}")
 for w in d["weapons"]:
  if w["fighterStableKey"] not in maps["fighters"]:errors.append(f"bad fighter: {w['stableKey']}")
 for a in d["abilities"]:
  if not a["isUniversal"] and a["factionStableKey"] not in maps["factions"]:errors.append(f"bad faction: {a['stableKey']}")
  for k in a["runemarkStableKeys"]:
   if k not in maps["runemarks"]:errors.append(f"bad runemark {k}: {a['stableKey']}")
 return errors

def write(out,d):
 out.mkdir(parents=True,exist_ok=True)
 files={"releases.json":{"sourceDocuments":d["sourceDocuments"],"releases":d["releases"]},"factions.json":{"grandAlliances":d["grandAlliances"],"factions":d["factions"]},"runemarks.json":{"runemarks":d["runemarks"]},"fighters.json":{"fighters":d["fighters"]},"weapons.json":{"weapons":d["weapons"]},"abilities.json":{"abilities":d["abilities"],"blessings":d["blessings"]}}
 for n,v in files.items():(out/n).write_text(json.dumps(v,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")

def main():
 ap=argparse.ArgumentParser();ap.add_argument("--output-dir",default="data/reference");ap.add_argument("--timeout",type=float,default=30);ap.add_argument("--request-delay",type=float,default=.12);ap.add_argument("--max-pages",type=int,default=0);args=ap.parse_args()
 s=session("WarcryHeraldReferenceExtractor/1.0 (+https://github.com/code-smithy/warcryherald)");warn=[];urls=discover(s,args.timeout,args.request_delay,args.max_pages)
 if not urls:raise RuntimeError("No warband pages discovered")
 pages={}
 for i,u in enumerate([*urls,*SEEDS.values()],1):
  u=canon(u)
  if u in pages:continue
  print(f"[{i}] {u}",flush=True);pages[u]=get_page(s,u,args.timeout);time.sleep(args.request_delay)
 updated=[p["updated"] for p in pages.values() if p["updated"]];rdate=max(updated) if updated else str(date.today());year=rdate[:4];rkey=f"warcrier-{rdate}-en";root=f"warcrier-docs-{year}-en"
 docs=[{"stableKey":root,"title":f"Warcrier Rules Reference {year}","publisher":"Warcrier","sourceUrl":SEEDS["warbands"],"language":"en","publishedAt":rdate}]+[doc(p) for p in pages.values()]
 releases=[{"stableKey":rkey,"sourceDocumentStableKey":root,"name":f"Warcrier current English reference ({rdate})","releaseDate":rdate,"language":"en","status":"current","sourceUrl":SEEDS["warbands"]}]
 ga=[{"stableKey":f"{k}-en","name":v[0],"displayOrder":v[1]} for k,v in ALLIANCES.items()]
 factions=[];fighters=[];weapons=[];abilities=[];found=set()
 for u in urls:
  f,fs,ws,ab,rm=parse_faction(pages[canon(u)],rkey,warn)
  if f:factions.append(f);fighters+=fs;weapons+=ws;abilities+=ab;found|=rm
 uni,rm=parse_universal(pages[canon(SEEDS["abilities"])],rkey);abilities+=uni;found|=rm
 blessings=parse_blessings(pages[canon(SEEDS["blessings"])],rkey,warn)
 factions=dedupe(sorted(factions,key=lambda x:(x["grandAllianceStableKey"],x["name"])))
 for i,f in enumerate(factions,1):f["displayOrder"]=i*10
 d={"sourceDocuments":dedupe(sorted(docs,key=lambda x:x["stableKey"])),"releases":releases,"grandAlliances":ga,"factions":factions,"runemarks":runemarks(factions,found),"fighters":dedupe(sorted(fighters,key=lambda x:(x["factionStableKey"],x["points"],x["name"]))),"weapons":dedupe(sorted(weapons,key=lambda x:(x["fighterStableKey"],x["name"]))),"abilities":dedupe(sorted(abilities,key=lambda x:(str(x["factionStableKey"]),x["cost"],x["name"]))),"blessings":dedupe(blessings)}
 errors=validate(d)
 if errors:
  print("\n".join("ERROR: "+x for x in errors),file=sys.stderr);return 1
 write(Path(args.output_dir),d);print(", ".join(f"{k}={len(v)}" for k,v in d.items()))
 for x in warn:print("WARNING: "+x,file=sys.stderr)
 return 0
if __name__=="__main__":raise SystemExit(main())
