import json,io,subprocess,time,sys
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
REAL_USDG="0x5fc5360d0400a0fd4f2af552add042d716f1d168"
SUF="\u2022 Robinhood Token"
MAND="NVDA MSTR COIN SPY AMD TSLA AAPL GOOGL META MSFT AMZN NFLX HOOD QQQ PLTR AVGO BRKB JPM WMT DIS".split()
def get(u):
    r=subprocess.run(["curl","-s","-H","User-Agent: "+UA,u],capture_output=True)
    try: return json.loads(r.stdout.decode("utf-8","replace"))
    except Exception: return None
prev=json.load(io.open("universo-robinhood.json",encoding="utf-8"))
addr={r["ticker"]:r["baseTokenAddress"] for r in prev if r["baseTokenAddress"]}
addr.update({"BE":"0x822CC93fFD030293E9842c30BBD678F530701867",
             "ON":"0xbBD09F72b025360FeE5C928053Dca6248d35be54",
             "TE":"0xb1969f6604CA1AE7a2cD3F1827876e914594CA2D"})
rows=[]
for i,(t,a) in enumerate(sorted(addr.items())):
    d=get("https://api.dexscreener.com/token-pairs/v1/robinhood/"+a)
    ps=d if isinstance(d,list) else []
    us=[p for p in ps if p["baseToken"]["address"].lower()==a.lower()
        and p["quoteToken"]["address"].lower()==REAL_USDG
        and p["baseToken"]["name"].endswith(SUF)]
    us.sort(key=lambda p:(p.get("liquidity") or {}).get("usd") or 0,reverse=True)
    tot=sum((p.get("liquidity") or {}).get("usd") or 0 for p in us)
    if us:
        p=us[0]
        rows.append({"ticker":t,"tienePar":True,"baseTokenName":p["baseToken"]["name"],
                     "priceUsd":p.get("priceUsd"),"liquidityUsd":(p.get("liquidity") or {}).get("usd"),
                     "pairAddress":p["pairAddress"],"baseTokenAddress":a,"dexId":p.get("dexId"),
                     "poolsUsdg":len(us),"liquidityUsdTotalPools":round(tot,2),"mandatoDeLaSpec":t in MAND})
    else:
        rows.append({"ticker":t,"tienePar":False,"baseTokenName":None,"priceUsd":None,"liquidityUsd":None,
                     "pairAddress":None,"baseTokenAddress":a,"dexId":None,"poolsUsdg":0,
                     "liquidityUsdTotalPools":0,"mandatoDeLaSpec":t in MAND})
    print("[%2d/%d] %-6s pools=%-2d liq_top=%-12s liq_total=%s"%(i+1,len(addr),t,len(us),rows[-1]["liquidityUsd"],rows[-1]["liquidityUsdTotalPools"])); sys.stdout.flush()
    time.sleep(1.1)
for t in MAND:
    if t not in addr:
        rows.append({"ticker":t,"tienePar":False,"baseTokenName":None,"priceUsd":None,"liquidityUsd":None,
                     "pairAddress":None,"baseTokenAddress":None,"dexId":None,"poolsUsdg":0,
                     "liquidityUsdTotalPools":0,"mandatoDeLaSpec":True})
rows.sort(key=lambda r:(-(r["liquidityUsdTotalPools"] or 0),r["ticker"]))
json.dump(rows,io.open("universo-robinhood.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
si=[r for r in rows if r["tienePar"]]
print("\nfilas:%d | conPar:%d | sinPar:%d"%(len(rows),len(si),len(rows)-len(si)))
print("sin par:",[r["ticker"] for r in rows if not r["tienePar"]])
