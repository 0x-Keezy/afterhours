import json,io,subprocess,time
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
REAL_USDG="0x5fc5360d0400a0fd4f2af552add042d716f1d168"
SUF="\u2022 Robinhood Token"
def get(u):
    r=subprocess.run(["curl","-s","-H","User-Agent: "+UA,u],capture_output=True)
    try: return json.loads(r.stdout.decode("utf-8","replace"))
    except Exception: return None
# 1) hallar direcciones de BE / ON / TE
addr={}
for q in ["Bloom Energy Robinhood Token","ON Semiconductor Robinhood Token","TE Connectivity Robinhood Token","Robinhood Token USDG Systems","Robinhood Token USDG Energy"]:
    d=get("https://api.dexscreener.com/latest/dex/search?q="+q.replace(" ","%20")) or {}
    for p in d.get("pairs") or []:
        if p.get("chainId")!="robinhood": continue
        for tok in (p["baseToken"],p["quoteToken"]):
            if tok["name"].endswith(SUF) and tok["symbol"].upper() in ("BE","ON","TE"):
                addr[tok["symbol"].upper()]=(tok["address"],tok["name"])
    time.sleep(1.1)
print("direcciones halladas:",{k:v[1] for k,v in addr.items()})
# 2) token-pairs deterministico
for t,(a,n) in sorted(addr.items()):
    d=get("https://api.dexscreener.com/token-pairs/v1/robinhood/"+a)
    ps=d if isinstance(d,list) else []
    usdg=[p for p in ps if p["quoteToken"]["address"].lower()==REAL_USDG and p["baseToken"]["address"].lower()==a.lower()]
    usdg.sort(key=lambda p:(p.get("liquidity") or {}).get("usd") or 0,reverse=True)
    print("\n%-3s %s  addr=%s"%(t,n,a))
    print("   pares totales del token: %d | contra USDG real: %d"%(len(ps),len(usdg)))
    for p in usdg[:3]:
        print("     -> USDG pair %s price=%s liq=%s"%(p["pairAddress"],p.get("priceUsd"),(p.get("liquidity") or {}).get("usd")))
    if not usdg:
        from collections import Counter
        print("     quotes vistos:",Counter(p["quoteToken"]["symbol"] for p in ps).most_common())
    time.sleep(1.1)
