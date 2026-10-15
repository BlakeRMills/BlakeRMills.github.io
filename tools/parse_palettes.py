import re, json, sys

def parse(path, listname):
    src = open(path).read()
    # grab the list( ... ) block after "<listname> <- list("
    start = src.index(listname + " <- list(")
    body = src[start:]
    out = {}
    # each entry: Name = list(c("#hex", ...), c(order), colorblind=TRUE/FALSE)
    pat = re.compile(
        r'(\w+)\s*=\s*list\(\s*c\(([^)]*)\)\s*,\s*c\(([^)]*)\)\s*,\s*colorblind\s*=\s*(TRUE|FALSE)',
        re.S)
    for m in pat.finditer(body):
        name = m.group(1)
        hexes = re.findall(r'#[0-9a-fA-F]{6}', m.group(2))
        if not hexes:
            continue
        order_raw = m.group(3).strip()
        if ':' in order_raw:
            order = None  # e.g. c(1:9) -- just use natural order
        else:
            try:
                order = [int(x.strip()) for x in order_raw.split(',')]
            except ValueError:
                order = None
        out[name] = {
            "colors": [h.lower() for h in hexes],
            "order": order,
            "colorblind": m.group(4) == "TRUE",
        }
    return out

met = parse(sys.argv[1], "MetPalettes")
moma = parse(sys.argv[2], "MoMAPalettes")
data = {"MetBrewer": met, "MoMAColors": moma}
json.dump(data, open(sys.argv[3], "w"), indent=1)
for k, v in data.items():
    cb = sum(1 for p in v.values() if p["colorblind"])
    print(f"{k}: {len(v)} palettes, {cb} colorblind-friendly")
