import json,io,subprocess,time
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
REAL_USDG="0x5fc5360d0400a0fd4f2af552add042d716f1d168"
FAKE_USDG="0xf052f9339afaba171724b3229a624db2a30eb115"
def get(u):
    r=subprocess.run(["curl","-s","-H","User-Agent: "+UA,u],capture_output=True)
    try: return json.loads(r.stdout.decode("utf-8","replace")).get("pairs") or []
    except Exception: return []
pool={}
for t,ps in json.load(io.open("_raw20.json",encoding="utf-8")).items():
    for p in ps:
        if p.get("chainId")=="robinhood": pool[p["pairAddress"]]=p
for q in ["Robinhood Token USDG","USDG","HOOD","GME USDG","AMD USDG","COIN USDG","TSLA USDG","NVDA USDG","SPY USDG","AAPL USDG"]:
    for p in get("https://api.dexscreener.com/latest/dex/search?q="+q.replace(" ","%20")):
        if p.get("chainId")=="robinhood": pool[p["pairAddress"]]=p
    time.sleep(1.2)
ps=list(pool.values())
qu=[p for p in ps if p["quoteToken"]["symbol"].upper()=="USDG"]
print("=== 1) VALIDACION DEL QUOTE: cuantos 'USDG' son el USDG real? ===")
from collections import Counter
print("  quote addr:",Counter(('REAL' if p['quoteToken']['address'].lower()==REAL_USDG else 'FAKE/otro:'+p['quoteToken']['address'][:10]) for p in qu).most_common())
print("\n=== 2) EL CASO ASESINO: base=Robinhood Token REAL pero quote=USDG FALSO ===")
kill=[p for p in qu if "Robinhood Token" in p["baseToken"]["name"] and p["quoteToken"]["address"].lower()!=REAL_USDG]
print("  encontrados:",len(kill))
for p in kill: print("   !!",p["baseToken"]["symbol"],"quote addr",p["quoteToken"]["address"],"liq",(p.get("liquidity") or {}).get("usd"))
print("\n=== 3) SUFICIENCIA: todos los nombres que PASAN el filtro 'Robinhood Token' ===")
good=[p for p in qu if "Robinhood Token" in p["baseToken"]["name"]]
names=sorted({(p["baseToken"]["symbol"],p["baseToken"]["name"]) for p in good})
print("  %d tokens distintos:"%len(names))
for s,n in names: print("     %-8s %s"%(s,n))
print("\n=== 4) el impostor USDG 'Upside Down Gorilla': con quien tradea? ===")
for p in ps:
    if FAKE_USDG in (p["baseToken"]["address"].lower(),p["quoteToken"]["address"].lower()):
        print("   ",p["baseToken"]["symbol"],"/",p["quoteToken"]["symbol"],"| liq",(p.get("liquidity") or {}).get("usd"),"| pair",p["pairAddress"])
