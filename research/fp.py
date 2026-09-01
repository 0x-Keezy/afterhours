import json,io,subprocess,time,glob
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
def get(u):
    r=subprocess.run(["curl","-s","-H","User-Agent: "+UA,u],capture_output=True)
    try: return json.loads(r.stdout.decode("utf-8","replace")).get("pairs") or []
    except Exception: return []
pool={}
def absorb(ps,src):
    for p in ps:
        if p.get("chainId")!="robinhood": continue
        pool[p["pairAddress"]]=(p,src)
# 1) todo lo ya recolectado
for t,ps in json.load(io.open("_raw20.json",encoding="utf-8")).items(): absorb(ps,"q=%s/USDG"%t)
for f in ["t1_usdg.json","t2_rhtoken.json","t2b.json"]:
    try: absorb(json.load(io.open(f,encoding="utf-8")).get("pairs") or [],f)
    except Exception: pass
absorb(json.load(io.open("t3_tokenpairs.json",encoding="utf-8")),"token-pairs")
# 2) queries extra apuntando a memecoins con ticker de accion + USDG (donde viviria un falso positivo)
extra=["Robinhood Token USDG","USDG","TSLA","NVDA","SPY","AAPL","HOOD","GME","MSTR",
       "TSLA USDG","NVDA USDG","SPY USDG","AAPL USDG","HOOD USDG","GME USDG","AMD USDG","COIN USDG"]
for q in extra:
    absorb(get("https://api.dexscreener.com/latest/dex/search?q="+q.replace(" ","%20")),"q="+q); time.sleep(1.2)
usdg=[(p,s) for p,s in pool.values() if p["quoteToken"]["symbol"].upper()=="USDG" or p["baseToken"]["symbol"].upper()=="USDG"]
print("pares robinhood unicos vistos:",len(pool),"| con USDG en algun lado:",len(usdg))
print("\n=== A) USDG como QUOTE (la forma {TICKER}/USDG que usa la spec) ===")
q=[(p,s) for p,s in usdg if p["quoteToken"]["symbol"].upper()=="USDG"]
good=[(p,s) for p,s in q if "Robinhood Token" in p["baseToken"]["name"]]
bad=[(p,s) for p,s in q if "Robinhood Token" not in p["baseToken"]["name"]]
print("  total:",len(q)," pasan filtro:",len(good)," FALSOS POSITIVOS:",len(bad))
for p,s in bad:
    print("   !! %-14s name=%-34s liq=%-12s addr=%s (via %s)"%(p["baseToken"]["symbol"],repr(p["baseToken"]["name"]),(p.get("liquidity") or {}).get("usd"),p["baseToken"]["address"],s))
print("\n=== B) USDG como BASE (el otro lado) ===")
b=[(p,s) for p,s in usdg if p["baseToken"]["symbol"].upper()=="USDG"]
from collections import Counter
print("  total:",len(b),"| baseToken.name:",Counter(p["baseToken"]["name"] for p,_ in b).most_common())
for p,s in b:
    if p["baseToken"]["name"]!="Global Dollar":
        print("   !! USDG IMPOSTOR: name=%r addr=%s liq=%s"%(p["baseToken"]["name"],p["baseToken"]["address"],(p.get("liquidity") or {}).get("usd")))
print("\n=== C) universo de tickers RH Token con par /USDG descubierto ===")
tk=sorted({p["baseToken"]["symbol"] for p,_ in good})
print("  ",len(tk),"tickers:",tk)
json.dump({"good_pairs":len(good),"bad_pairs":len(bad),"tickers":tk},io.open("_fp.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
