import json,io,subprocess,time,sys
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
TICKERS="NVDA MSTR COIN SPY AMD TSLA AAPL GOOGL META MSFT AMZN NFLX HOOD QQQ PLTR AVGO BRKB JPM WMT DIS".split()
def get(url):
    r=subprocess.run(["curl","-s","-H","User-Agent: "+UA,"-w","\n__HTTP__%{http_code}",url],capture_output=True)
    out=r.stdout.decode("utf-8","replace")
    body,_,code=out.rpartition("\n__HTTP__")
    return int(code), body
rows=[]; raw={}; t0=time.time()
for i,t in enumerate(TICKERS):
    url=f"https://api.dexscreener.com/latest/dex/search?q={t}%2FUSDG"
    code,body=get(url)
    try: ps=json.loads(body).get("pairs") or []
    except Exception: ps=[]
    raw[t]=ps
    # candidatos: chain robinhood, base symbol == ticker, quote symbol == USDG
    cand=[p for p in ps if p.get("chainId")=="robinhood"
          and p["baseToken"]["symbol"].upper()==t
          and p["quoteToken"]["symbol"].upper()=="USDG"]
    cand.sort(key=lambda p:(p.get("liquidity") or {}).get("usd") or 0, reverse=True)
    if cand:
        p=cand[0]
        rows.append(dict(ticker=t,tienePar=True,baseTokenName=p["baseToken"]["name"],
                         priceUsd=p.get("priceUsd"),liquidityUsd=(p.get("liquidity") or {}).get("usd"),
                         pairAddress=p["pairAddress"],dexId=p.get("dexId"),
                         baseTokenAddress=p["baseToken"]["address"],pairsEncontrados=len(cand)))
    else:
        rows.append(dict(ticker=t,tienePar=False,baseTokenName=None,priceUsd=None,
                         liquidityUsd=None,pairAddress=None,dexId=None,baseTokenAddress=None,pairsEncontrados=0))
    r=rows[-1]
    print(f"[{i+1:2}/20] HTTP{code} {t:6} par={'SI' if r['tienePar'] else 'NO':2} pools={r['pairsEncontrados']:2} price={str(r['priceUsd']):>10} liq={r['liquidityUsd']} name={r['baseTokenName']}")
    sys.stdout.flush()
    time.sleep(1.2)
json.dump(rows,io.open("_rows20.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
json.dump(raw,io.open("_raw20.json","w",encoding="utf-8"),ensure_ascii=False)
print("elapsed %.1fs"%(time.time()-t0))
