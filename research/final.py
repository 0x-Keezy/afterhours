import json,io,subprocess,time,sys
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
REAL_USDG="0x5fc5360d0400a0fd4f2af552add042d716f1d168"
SUF="\u2022 Robinhood Token"
MAND="NVDA MSTR COIN SPY AMD TSLA AAPL GOOGL META MSFT AMZN NFLX HOOD QQQ PLTR AVGO BRKB JPM WMT DIS".split()
disc=sorted(s for s,n in json.load(io.open("_universo.json",encoding="utf-8")).items() if n.endswith(SUF))
order=MAND+[s for s in disc if s not in MAND]
def get(u):
    r=subprocess.run(["curl","-s","-H","User-Agent: "+UA,u],capture_output=True)
    try: return json.loads(r.stdout.decode("utf-8","replace")).get("pairs") or []
    except Exception: return None
rows=[]
for i,t in enumerate(order):
    ps=get("https://api.dexscreener.com/latest/dex/search?q=%s%%2FUSDG"%t)
    if ps is None: print("  ERROR",t); ps=[]
    cand=[p for p in ps if p.get("chainId")=="robinhood"
          and p["baseToken"]["symbol"].upper()==t
          and p["baseToken"]["name"].endswith(SUF)
          and p["quoteToken"]["address"].lower()==REAL_USDG]
    cand.sort(key=lambda p:(p.get("liquidity") or {}).get("usd") or 0, reverse=True)
    if cand:
        p=cand[0]
        rows.append({"ticker":t,"tienePar":True,"baseTokenName":p["baseToken"]["name"],
                     "priceUsd":p.get("priceUsd"),"liquidityUsd":(p.get("liquidity") or {}).get("usd"),
                     "pairAddress":p["pairAddress"],"baseTokenAddress":p["baseToken"]["address"],
                     "dexId":p.get("dexId"),"poolsUsdg":len(cand),"mandatoDeLaSpec":t in MAND})
    else:
        rows.append({"ticker":t,"tienePar":False,"baseTokenName":None,"priceUsd":None,
                     "liquidityUsd":None,"pairAddress":None,"baseTokenAddress":None,
                     "dexId":None,"poolsUsdg":0,"mandatoDeLaSpec":t in MAND})
    r=rows[-1]
    print("[%2d/%d] %-7s %s pools=%-2d price=%-10s liq=%s"%(i+1,len(order),t,"SI" if r["tienePar"] else "NO",r["poolsUsdg"],r["priceUsd"],r["liquidityUsd"])); sys.stdout.flush()
    time.sleep(1.1)
json.dump(rows,io.open("universo-robinhood.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
si=[r for r in rows if r["tienePar"]]
print("\nTOTAL filas:",len(rows),"| con par USDG:",len(si),"| sin par:",len(rows)-len(si))
print("SIN PAR:",[r["ticker"] for r in rows if not r["tienePar"]])
