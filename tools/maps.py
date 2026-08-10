"""맵 파이프라인. zip 넣으면 맵이 추가된다.

  python tools/maps.py sync    유비소프트 공식 블루프린트 zip 을 maps/ 로 내려받음
  python tools/maps.py build   maps/*.zip -> public/maps/<맵>/<층>.webp + manifest.json
  python tools/maps.py check   층 배정 규칙 자체 검사

맵 추가: maps/ 에 <슬러그>.zip 넣고 build. 끝.
층 순서가 기본 규칙과 다르면 maps/floors.json 에 한 줄 추가.
"""
import io, json, os, re, sys, urllib.request, zipfile

sys.stdout.reconfigure(encoding="utf-8")  # 윈도우 콘솔 기본이 cp1252 라 한글 print 가 죽는다

SITE = "https://www.ubisoft.com/en-gb/game/rainbow-six/siege/game-info/maps"
UA = {"User-Agent": "SixerMapFetcher/0.1 (personal tactical map tool)"}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIPS = os.path.join(ROOT, "maps")
OUT = os.path.join(ROOT, "public", "maps")
OVERRIDE = os.path.join(ZIPS, "floors.json")

# 공식 zip 은 대부분 -blueprint-N 번호뿐이고 그 순서가 맵마다 다르다(Bank 는 1F 부터,
# Chalet 은 지하부터). 그래서 층 순서는 maps/floors.json 에 맵별로 적어두고,
# 새 맵은 아래 기본값(다수파: 지하부터)으로 일단 굽고 화면 보고 고친다.
DEFAULT_ORDER = {
    2: ["1F", "2F"],
    3: ["1F", "2F", "R"],
    4: ["B", "1F", "2F", "R"],
    5: ["B", "1F", "2F", "3F", "R"],
    6: ["B2", "B", "1F", "2F", "3F", "R"],
}
# 파일명에 층이 적힌 zip 도 있다(Calypso). 그건 순서를 믿지 않고 이름을 쓴다.
BY_NAME = {"basement": "B", "ground": "G", "roof": "R"}
FLOOR_N = re.compile(r"(?<![a-z0-9])([1-4])(?:f|(?:st|nd|rd|th)[ _-]?floor)(?![a-z0-9])")


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA)).read()


def sync():
    """맵 목록 -> 각 맵 페이지의 zip 링크 -> maps/<슬러그>.zip"""
    os.makedirs(ZIPS, exist_ok=True)
    slugs = sorted(set(re.findall(rb"game-info/maps/([a-z0-9-]+)", get(SITE))))
    for s in slugs:
        s = s.decode()
        dest = os.path.join(ZIPS, s + ".zip")
        if os.path.exists(dest):
            continue
        links = re.findall(rb'https://ubistatic-a[^"]+\.zip', get(f"{SITE}/{s}"))
        if not links:
            print(f"  ! {s}: zip 없음")
            continue
        open(dest, "wb").write(get(links[0].decode()))
        print(f"{s}: {os.path.getsize(dest)//1024}KB")


def floor_from_name(fname):
    """파일명에서 층을 읽는다. 못 읽으면 None."""
    f = os.path.basename(fname).lower()
    for word, label in BY_NAME.items():
        if word in f:
            return label
    m = FLOOR_N.search(f)
    return m.group(1) + "F" if m else None


def floor_labels(names, slug, override):
    """블루프린트 파일 목록 -> 층 이름. 파일명 > floors.json > 장수 기본값 순."""
    named = [floor_from_name(n) for n in names]
    if all(named):
        return named
    return override.get(slug) or DEFAULT_ORDER.get(len(names), [])


def build():
    from PIL import Image
    override = json.load(open(OVERRIDE, encoding="utf-8")) if os.path.exists(OVERRIDE) else {}
    manifest, before, after = {}, 0, 0

    for z in sorted(f for f in os.listdir(ZIPS) if f.endswith(".zip")):
        slug = z[:-4]
        blob = open(os.path.join(ZIPS, z), "rb").read()
        zf = zipfile.ZipFile(io.BytesIO(blob))
        # zip 안 파일명은 제각각이라 이름이 아니라 정렬 순서로 층을 매긴다.
        names = sorted(n for n in zf.namelist() if not n.endswith("/")
                       and not os.path.basename(n).startswith((".", "_")))
        labels = floor_labels(names, slug, override)
        if not labels:
            print(f"  ! {slug}: {len(names)}장짜리 규칙 없음. maps/floors.json 에 추가 필요")
            continue
        if slug not in override and not all(floor_from_name(n) for n in names):
            print(f"  ? {slug}: 층 순서 추정값 {labels}. 화면 보고 maps/floors.json 에 확정할 것")

        d = os.path.join(OUT, slug)
        os.makedirs(d, exist_ok=True)
        keep = set()
        for label, n in zip(labels, names):
            out = os.path.join(d, label.lower() + ".webp")
            keep.add(os.path.basename(out))
            before += zf.getinfo(n).file_size
            if not os.path.exists(out):
                Image.open(io.BytesIO(zf.read(n))).convert("RGB").save(
                    out, "WEBP", quality=82, method=6)
            after += os.path.getsize(out)
        for f in set(os.listdir(d)) - keep:  # 이전 빌드 잔재 정리
            os.remove(os.path.join(d, f))
        # 층은 아래에서 위로. UI 휠 스크롤 순서와 같다.
        rank = {"B2": 0, "B": 1, "G": 2, "1F": 3, "2F": 4, "3F": 5, "4F": 6, "R": 7}
        manifest[slug] = sorted(labels, key=lambda x: rank.get(x, 9))

    json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
    print(f"{len(manifest)} maps, {before//2**20}MB -> {after//2**20}MB")


def check():
    n4 = [f"r6-maps-x-blueprint-{i}.jpg" for i in (1, 2, 3, 4)]
    named = ["X_Basement.png", "X_Roof.png", "X_2F.png", "X_1F.png"]  # 알파벳순 = 층 순서 아님
    o = {"bank": ["1F", "2F", "B", "R"]}
    assert floor_labels(n4, "x", {}) == ["B", "1F", "2F", "R"], "장수 기본값"
    assert floor_labels(n4, "bank", o) == o["bank"], "floors.json 이 기본값보다 우선"
    assert floor_labels(named, "bank", o) == ["B", "R", "2F", "1F"], "파일명이 최우선"
    assert floor_labels(n4 + n4, "x", {}) == [], "규칙 없는 장수는 조용히 넘어가면 안 됨"
    print("ok")


if __name__ == "__main__":
    {"sync": sync, "build": build, "check": check}[
        sys.argv[1] if len(sys.argv) > 1 else "build"]()
