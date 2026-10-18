import concurrent.futures, json, pathlib, time, urllib.request, re, zipfile, io, argparse
parser=argparse.ArgumentParser()
parser.add_argument("--generation",type=int,default=1)
GEN=parser.parse_args().generation
ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public/assets"
CACHE = ROOT / "private/asset-cache"
CACHE.mkdir(parents=True, exist_ok=True)
PACK_DIR=ROOT/("content/gen"+str(GEN))
PACK_DIR.mkdir(parents=True,exist_ok=True)
def fetch(url, target=None):
    if target and target.exists(): return target.read_bytes()
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent":"RongrongFamilyAdventure/0.1"})
            data = urllib.request.urlopen(req, timeout=45).read()
            if target:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            return data
        except Exception:
            if attempt == 3: raise
            time.sleep(1 + attempt * 2)
def api(path):
    return json.loads(fetch("https://pokeapi.co/api/v2/" + path, CACHE / (path.strip("/").replace("/", "-") + ".json")))
IDS=sorted(int(p["url"].strip("/").split("/")[-1]) for p in api("generation/"+str(GEN))["pokemon_species"])
def one(n):
    p, s = api("pokemon/"+str(n)), api("pokemon-species/"+str(n))
    name = next((x["name"] for x in s["names"] if x["language"]["name"].lower() == "zh-hans"), p["name"])
    types = [x["type"]["name"] for x in p["types"]]
    urls = {
        "art": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/"+str(n)+".png",
        "front": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/"+str(n)+".png",
        "back": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/"+str(n)+".png",
    }
    for kind, url in urls.items(): fetch(url, ASSETS/"pokemon"/kind/(str(n)+".png"))
    chain_id = s["evolution_chain"]["url"].strip("/").split("/")[-1]
    row = {"id":n,"name":name,"english":p["name"],"types":types,
           "stats":{x["stat"]["name"]:x["base_stat"] for x in p["stats"]},
           "captureRate":s["capture_rate"],"generation":"gen"+str(GEN),"chainId":int(chain_id)}
    print("pokemon", n, name, flush=True)
    return row
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    species = sorted(pool.map(one, IDS), key=lambda p:p["id"])
known_ids=set(IDS)
for older in ROOT.glob("content/gen*/species.json"):
    if int(older.parent.name[3:])<GEN: known_ids.update(p["id"] for p in json.loads(older.read_text()))
evolutions=[]
def walk(node):
    start = int(node["species"]["url"].strip("/").split("/")[-1])
    for child in node["evolves_to"]:
        end = int(child["species"]["url"].strip("/").split("/")[-1])
        if start in known_ids and end in known_ids and (start in IDS or end in IDS):
            d=child["evolution_details"][0] if child["evolution_details"] else {}
            level=d.get("min_level") or (36 if d.get("trigger",{}).get("name")=="trade" else 24)
            evolutions.append({"from":start,"to":end,"level":min(48,level)})
        walk(child)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    chains=pool.map(lambda cid:api("evolution-chain/"+str(cid)),sorted({p["chainId"] for p in species}))
    for chain in chains: walk(chain["chain"])
(PACK_DIR/"species.json").write_text(json.dumps(species,ensure_ascii=False,separators=(",",":")))
(PACK_DIR/"evolutions.json").write_text(json.dumps(evolutions,ensure_ascii=False,separators=(",",":")))
page=fetch("https://kenney.nl/assets/tiny-town").decode()
links=re.findall(r"href=['\"]([^'\"]+\.zip[^'\"]*)['\"]",page)
if not links: raise RuntimeError("Tiny Town download link not found")
url=links[0]
if url.startswith("/"): url="https://kenney.nl"+url
raw=fetch(url,CACHE/"tiny-town.zip")
with zipfile.ZipFile(io.BytesIO(raw)) as z:
    for file in z.namelist():
        if not file.endswith("/") and ("Tilemap/" in file or file.lower().endswith("license.txt")):
            dest=ASSETS/"town"/pathlib.PurePosixPath(file).name
            dest.parent.mkdir(parents=True,exist_ok=True)
            content=z.read(file)
            if dest.suffix.lower()==".txt": content=("\n".join(line.rstrip() for line in content.decode().splitlines())+"\n").encode()
            dest.write_bytes(content)
print("DONE",len(species),"species",len(evolutions),"evolutions",flush=True)
