#!/usr/bin/env python3
"""Generates the achievement pictures with Gemini through the `agy` CLI, one picture per `agy` session, in the order of prompts.md.

    python3 generate_with_agy.py                  # all the missing pictures
    python3 generate_with_agy.py --only w1 d250   # just these ids
    python3 generate_with_agy.py --workers 3      # pictures made at the same time (default 2)

Reads the prompts from prompts.md (the one code block under each `### Name  ·  `id`  ·  Tier` heading). For every picture it starts
`agy --dangerously-skip-permissions -p ...`, tells it to look at the character reference sheets in reference/ and to hand them to its image
generator, and to save the result as generated/NN-id-slug.png (NN = the order in prompts.md). It then also writes generated/720x480/ (the
same picture cut to 3:2 and scaled to 720 x 480). Pictures that exist are skipped, so a run can be repeated. generation-log.json records
what happened to each picture.

--dangerously-skip-permissions lets the agent do anything without asking: the prompt confines it to one output file, but it is the agent's
own promise. Needs: agy (Antigravity CLI) logged in, Python 3 with Pillow.
"""
import argparse, concurrent.futures as cf, json, os, re, subprocess, sys, time

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, "generated")
SMALL = os.path.join(GEN, "720x480")
LOG = os.path.join(GEN, "generation-log.json")

REF_HERO = ["reference/hero-character-sheet.png", "reference/hero-face.png", "reference/hero-sword.png"]
REF_EXTRA = {"gremlin": "reference/gremlin-and-owl.png", "owl": "reference/gremlin-and-owl.png"}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def parse():
    text = open(os.path.join(HERE, "prompts.md"), encoding="utf-8").read()
    out = []
    for m in re.finditer(r"^### (.+?)  ·  `([^`]+)`  ·  (\w+)\n\*(.*?)\*\n\n```\n(.*?)\n```", text, re.S | re.M):
        name, pid, tier, desc, prompt = m.groups()
        out.append({"n": len(out) + 1, "id": pid, "name": name, "tier": tier, "desc": desc, "prompt": prompt})
    return out


def task(item, dest):
    refs = list(REF_HERO)
    low = item["prompt"].lower()
    for key, ref in REF_EXTRA.items():
        if key in low and ref not in refs:
            refs.append(ref)
    return (
        f"Create exactly ONE picture with your image generation tool (the image-generator subagent / generate_image) and save it as a PNG at:\n{dest}\n\n"
        "Landscape 3:2, as large as the tool allows (about 1536x1024). The small knight hero in the picture must look EXACTLY like the 3D character in the "
        "reference images: open and look at these files and pass them to the image generator as reference images:\n"
        + "\n".join(f"- {os.path.join(HERE, r)}" for r in refs)
        + "\nKeep his design unchanged: helmet, black visor with two white pill eyes, blue scarf, white sash, armour, blue shield, and above all his SWORD, a broad "
        "gently curved tan-copper cleaver-like blade with a squared tip, two rivets, a grey guard plate with a glowing mint-green slot, a bright-green looped hand "
        "guard and a red-brown wrapped grip. Gremlins and the owl must match their reference sheet too.\n\n"
        "Follow this picture description exactly:\n\n" + item["prompt"] + "\n\n"
        "When the file is saved, reply with only its path. Do not create any other files."
    )


def make_small(src, dst):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    want = 3 / 2
    if w / h > want:
        nw = round(h * want); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = round(w / want); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    im.resize((720, 480), Image.LANCZOS).save(dst)


QUOTA = {"hit": False}   # set when the image model says its quota is used up: then every other picture would fail the same way


def one(item, model, timeout):
    if QUOTA["hit"]:
        return {"n": item["n"], "id": item["id"], "file": "", "status": "skipped", "tail": "image quota used up"}
    dest = os.path.join(GEN, f"{item['n']:02d}-{item['id']}-{slug(item['name'])}.png")
    small = os.path.join(SMALL, os.path.basename(dest))
    rec = {"n": item["n"], "id": item["id"], "file": os.path.basename(dest)}
    if os.path.exists(dest):
        if not os.path.exists(small):
            make_small(dest, small)
        return {**rec, "status": "exists"}
    t0 = time.time()
    cmd = ["agy", "--dangerously-skip-permissions", "--model", model, "--print-timeout", f"{timeout}s", "-p", task(item, dest)]
    try:
        r = subprocess.run(cmd, cwd=HERE, capture_output=True, text=True, timeout=timeout + 60)
        tail = (r.stdout + r.stderr).strip()[-400:]
    except subprocess.TimeoutExpired:
        tail = "timeout"
    ok = os.path.exists(dest) and os.path.getsize(dest) > 20000
    if not ok and re.search(r"RESOURCE_EXHAUSTED|\b429\b|quota", tail, re.I):
        QUOTA["hit"] = True
        m = re.search(r"reset[^\n]{0,60}", tail, re.I)
        tail = "IMAGE QUOTA USED UP " + (m.group(0) if m else "")
    if ok:
        try:
            make_small(dest, small)
        except Exception as e:  # a broken file
            ok, tail = False, f"unreadable picture: {e}"
    return {**rec, "status": "ok" if ok else "failed", "seconds": round(time.time() - t0), "tail": tail if not ok else ""}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="*", help="achievement ids to make")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--model", default="gemini-3.8-flash-medium")
    ap.add_argument("--timeout", type=int, default=420, help="seconds agy may take per picture")
    a = ap.parse_args()
    os.makedirs(SMALL, exist_ok=True)
    items = parse()
    if not items:
        sys.exit("no prompts found in prompts.md")
    if a.only:
        items = [i for i in items if i["id"] in a.only]
    log = json.load(open(LOG)) if os.path.exists(LOG) else {}
    print(f"{len(items)} pictures, {a.workers} at a time", flush=True)
    with cf.ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(one, it, a.model, a.timeout): it for it in items}
        for f in cf.as_completed(futs):
            r = f.result(); log[r["id"]] = r
            json.dump(log, open(LOG, "w"), indent=1, ensure_ascii=False)
            print(f"{r['n']:02d} {r['id']:9s} {r['status']:7s} {r.get('seconds', '')} {r.get('tail', '')[:160]}", flush=True)
            if r['status'] == 'skipped':
                log.pop(r['id'], None)
    bad = [i for i, r in log.items() if r["status"] == "failed"]
    if QUOTA["hit"]:
        print("stopped: the image model's quota is used up; run this script again after it resets (finished pictures are kept)")
    print("done;", "failed: " + ", ".join(bad) if bad else "all ok")


if __name__ == "__main__":
    main()
