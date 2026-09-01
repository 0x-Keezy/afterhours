import json,io,subprocess,time,string,sys
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
REAL_USDG="0x5fc5360d0400a0fd4f2af552add042d716f1d168"
def get(u):
    r=subprocess.run(["curl","-s","-H","User-Agent: "+UA,u],capture_output=True)
    try: return json.loads(r.stdout.decode("utf-8","replace")).get("pairs") or []
    except Exception: return []
found={}   # symbol -> best pair
seen_pairs=set()
def absorb(ps):
    new=0
    for p in ps:
        if p.get("chainId")!="robinhood": continue
        if p["pairAddress"] in seen_pairs: continue
        seen_pairs.add(p["pairAddress"])
        for tok in (p["baseToken"],p["quoteToken"]):
            if "Robinhood Token" in tok["name"]:
                s=tok["symbol"].upper()
                if s not in found: found[s]=tok["name"]; new+=1
    return new
queries=["Robinhood Token USDG","Robinhood Token"]
queries+= ["%s Robinhood Token USDG"%c for c in string.ascii_uppercase]
queries+= ["Robinhood Token USDG %s"%w for w in ["Inc","Corp","ETF","Trust","Group","Technologies","Holdings","Class A","Energy","Bank","Pharma","Motors","Semiconductor","Media","Fund","Index","Gold","Oil","China","Airlines","Retail","Software","Systems","Capital"]]
for i,q in enumerate(queries):
    n=absorb(get("https://api.dexscreener.com/latest/dex/search?q="+q.replace(" ","%20")))
    print("[%2d/%d] %-42s +%d nuevos  total=%d"%(i+1,len(queries),q,n,len(found))); sys.stdout.flush()
    time.sleep(1.1)
print("\n=== UNIVERSO DESCUBIERTO: %d tokens 'Robinhood Token' ==="%len(found))
for s in sorted(found): print("   %-8s %s"%(s,found[s]))
json.dump(found,io.open("_universo.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
